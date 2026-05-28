#!/usr/bin/env python3
"""Build Pannellum multiresolution tiles from a Google Street View panoid."""

from __future__ import annotations

import concurrent.futures
import json
import math
import shutil
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

PANOID = "muOStU_C45UDgZ_E5jcMFA"
SOURCE_ZOOM = 5
SOURCE_COLS = 32
SOURCE_ROWS = 16
SOURCE_TILE_SIZE = 512
OUTPUT_TILE_SIZE = 512
JPEG_QUALITY = 92

ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / ".cache" / "streetview" / PANOID / f"z{SOURCE_ZOOM}"
PUBLIC_DIR = ROOT / "public"
PANORAMA_DIR = PUBLIC_DIR / "assets" / "panorama"
PREVIEW_PATH = PUBLIC_DIR / "assets" / "preview.jpg"

TILE_URL = (
    "https://streetviewpixels-pa.googleapis.com/v1/tile"
    f"?cb_client=maps_sv.tactile&panoid={PANOID}&zoom={SOURCE_ZOOM}&x={{x}}&y={{y}}"
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


def download_tile(x: int, y: int) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    destination = CACHE_DIR / f"{x}_{y}.jpg"

    if destination.exists() and destination.stat().st_size > 1000:
        return

    request = urllib.request.Request(TILE_URL.format(x=x, y=y), headers=HEADERS)
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read()

    destination.write_bytes(data)


def download_tiles() -> None:
    coords = [(x, y) for y in range(SOURCE_ROWS) for x in range(SOURCE_COLS)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        list(executor.map(lambda item: download_tile(*item), coords))


def stitch_equirectangular() -> Image.Image:
    width = SOURCE_COLS * SOURCE_TILE_SIZE
    height = SOURCE_ROWS * SOURCE_TILE_SIZE
    panorama = Image.new("RGB", (width, height))

    for y in range(SOURCE_ROWS):
        for x in range(SOURCE_COLS):
            tile = Image.open(CACHE_DIR / f"{x}_{y}.jpg").convert("RGB")
            panorama.paste(tile, (x * SOURCE_TILE_SIZE, y * SOURCE_TILE_SIZE))

    return panorama


def bilinear_sample(source: np.ndarray, xf: np.ndarray, yf: np.ndarray) -> np.ndarray:
    height, width, _ = source.shape

    x0 = np.floor(xf).astype(np.int32) % width
    y0 = np.floor(yf).astype(np.int32)
    y0 = np.clip(y0, 0, height - 1)
    x1 = (x0 + 1) % width
    y1 = np.clip(y0 + 1, 0, height - 1)

    wx = (xf - np.floor(xf))[..., None]
    wy = (yf - np.floor(yf))[..., None]

    top = source[y0, x0] * (1.0 - wx) + source[y0, x1] * wx
    bottom = source[y1, x0] * (1.0 - wx) + source[y1, x1] * wx
    return np.clip(top * (1.0 - wy) + bottom * wy, 0, 255).astype(np.uint8)


def face_vectors(face: str, uu: np.ndarray, vv: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if face == "f":
        return uu, -vv, np.ones_like(uu)
    if face == "b":
        return -uu, -vv, -np.ones_like(uu)
    if face == "l":
        return -np.ones_like(uu), -vv, uu
    if face == "r":
        return np.ones_like(uu), -vv, -uu
    if face == "u":
        return uu, np.ones_like(uu), vv
    if face == "d":
        return uu, -np.ones_like(uu), -vv
    raise ValueError(f"Unknown face {face}")


def equirectangular_to_face(source: np.ndarray, face: str, cube_size: int) -> Image.Image:
    source_height, source_width, _ = source.shape
    axis = ((np.arange(cube_size, dtype=np.float32) + 0.5) / cube_size) * 2.0 - 1.0
    face_array = np.empty((cube_size, cube_size, 3), dtype=np.uint8)
    chunk_size = 256

    for start in range(0, cube_size, chunk_size):
        stop = min(start + chunk_size, cube_size)
        uu, vv = np.meshgrid(axis, axis[start:stop])
        x, y, z = face_vectors(face, uu, vv)
        norm = np.sqrt(x * x + y * y + z * z)
        longitude = np.arctan2(x, z)
        latitude = np.arcsin(y / norm)

        xf = (longitude / (2.0 * math.pi) + 0.5) * source_width - 0.5
        yf = (0.5 - latitude / math.pi) * source_height - 0.5
        face_array[start:stop] = bilinear_sample(source, xf, yf)

    return Image.fromarray(face_array, "RGB")


def save_multires_tiles(face: Image.Image, face_letter: str, max_level: int, cube_size: int) -> None:
    size = cube_size
    level_face = face

    for level in range(max_level, 0, -1):
        level_dir = PANORAMA_DIR / str(level)
        level_dir.mkdir(parents=True, exist_ok=True)

        if level < max_level:
            level_face = face.resize((size, size), Image.Resampling.LANCZOS)

        tiles = math.ceil(size / OUTPUT_TILE_SIZE)
        for row in range(tiles):
            for col in range(tiles):
                left = col * OUTPUT_TILE_SIZE
                upper = row * OUTPUT_TILE_SIZE
                right = min(left + OUTPUT_TILE_SIZE, size)
                lower = min(upper + OUTPUT_TILE_SIZE, size)
                tile = level_face.crop((left, upper, right, lower))
                tile.save(
                    level_dir / f"{face_letter}{row}_{col}.jpg",
                    quality=JPEG_QUALITY,
                    optimize=True,
                    progressive=True,
                )

        size = max(1, size // 2)


def save_fallback(face: Image.Image, face_letter: str) -> None:
    fallback_dir = PANORAMA_DIR / "fallback"
    fallback_dir.mkdir(parents=True, exist_ok=True)
    fallback = face.resize((1024, 1024), Image.Resampling.LANCZOS)
    fallback.save(
        fallback_dir / f"{face_letter}.jpg",
        quality=JPEG_QUALITY,
        optimize=True,
        progressive=True,
    )


def write_config(cube_size: int, max_level: int) -> None:
    config = {
        "type": "multires",
        "multiRes": {
            "basePath": "/assets/panorama",
            "path": "/%l/%s%y_%x",
            "fallbackPath": "/fallback/%s",
            "extension": "jpg",
            "tileResolution": OUTPUT_TILE_SIZE,
            "maxLevel": max_level,
            "cubeResolution": cube_size,
        },
    }

    (PANORAMA_DIR / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")


def main() -> None:
    Image.MAX_IMAGE_PIXELS = None

    print("Downloading Street View source tiles...")
    download_tiles()

    print("Stitching 16K equirectangular panorama...")
    equirectangular = stitch_equirectangular()
    PREVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)
    equirectangular.resize((1600, 800), Image.Resampling.LANCZOS).save(
        PREVIEW_PATH,
        quality=86,
        optimize=True,
        progressive=True,
    )

    if PANORAMA_DIR.exists():
        shutil.rmtree(PANORAMA_DIR)
    PANORAMA_DIR.mkdir(parents=True, exist_ok=True)

    cube_size = 8 * int((equirectangular.width / math.pi) / 8)
    max_level = int(math.ceil(math.log(float(cube_size) / OUTPUT_TILE_SIZE, 2))) + 1
    source = np.asarray(equirectangular, dtype=np.uint8)

    print(f"Generating Pannellum multires faces at {cube_size}px, max level {max_level}...")
    for face_letter in ("f", "b", "u", "d", "l", "r"):
        print(f"  face {face_letter}")
        face = equirectangular_to_face(source, face_letter, cube_size)
        save_fallback(face, face_letter)
        save_multires_tiles(face, face_letter, max_level, cube_size)

    write_config(cube_size, max_level)
    print(f"Done. Netlify publish directory: {PUBLIC_DIR}")


if __name__ == "__main__":
    main()
