#!/usr/bin/env python3

from __future__ import annotations

import argparse
import concurrent.futures
import json
import math
import shutil
import time
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

SOURCE_ZOOM = 5
SOURCE_COLS = 32
SOURCE_ROWS = 16
SOURCE_TILE_SIZE = 512
OUTPUT_TILE_SIZE = 512
JPEG_QUALITY = 92

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "public"
DEFAULT_OUT_DIR = PUBLIC_DIR / "assets" / "panorama"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


def cache_dir(panoid: str) -> Path:
    return ROOT / ".cache" / "streetview" / panoid / f"z{SOURCE_ZOOM}"


def tile_url(panoid: str, x: int, y: int) -> str:
    return (
        "https://streetviewpixels-pa.googleapis.com/v1/tile"
        f"?cb_client=maps_sv.tactile&panoid={panoid}&zoom={SOURCE_ZOOM}&x={x}&y={y}"
    )


def download_tile(panoid: str, x: int, y: int) -> None:
    scene_cache_dir = cache_dir(panoid)
    scene_cache_dir.mkdir(parents=True, exist_ok=True)
    destination = scene_cache_dir / f"{x}_{y}.jpg"

    if destination.exists() and destination.stat().st_size > 1000:
        return

    last_error = None
    for attempt in range(5):
        request = urllib.request.Request(tile_url(panoid, x, y), headers=HEADERS)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = response.read()
            break
        except Exception as error:
            last_error = error
            time.sleep(1.5 * (attempt + 1))
    else:
        raise last_error

    destination.write_bytes(data)


def probe_tile_brightness(panoid: str, x: int, y: int) -> float:
    request = urllib.request.Request(tile_url(panoid, x, y), headers=HEADERS)
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read()
    if len(data) <= 1000:
        return 0.0
    from PIL import Image as PILImage

    with PILImage.open(__import__("io").BytesIO(data)) as tile:
        gray = tile.convert("L")
        histogram = gray.histogram()
        total = sum(histogram)
        if not total:
            return 0.0
        return sum(index * count for index, count in enumerate(histogram)) / total


def check_full_coverage(panoid: str) -> None:
    print("Probing panorama coverage...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        means = list(executor.map(lambda x: probe_tile_brightness(panoid, x, SOURCE_ROWS // 2), range(SOURCE_COLS)))
    dark = [x for x, mean in enumerate(means) if mean < 3.0]
    if dark:
        raise SystemExit(
            f"Panorama {panoid} has no imagery in {len(dark)}/{SOURCE_COLS} tile columns "
            f"(x={dark[0]}..{dark[-1]}); it is a partial capture. Pick another panorama ID."
        )
    print("Full 360-degree coverage confirmed.")


def download_tiles(panoid: str) -> None:
    coords = [(x, y) for y in range(SOURCE_ROWS) for x in range(SOURCE_COLS)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        list(executor.map(lambda item: download_tile(panoid, *item), coords))


def stitch_equirectangular(panoid: str) -> Image.Image:
    width = SOURCE_COLS * SOURCE_TILE_SIZE
    height = SOURCE_ROWS * SOURCE_TILE_SIZE
    panorama = Image.new("RGB", (width, height))
    scene_cache_dir = cache_dir(panoid)

    for y in range(SOURCE_ROWS):
        for x in range(SOURCE_COLS):
            tile = Image.open(scene_cache_dir / f"{x}_{y}.jpg").convert("RGB")
            panorama.paste(tile, (x * SOURCE_TILE_SIZE, y * SOURCE_TILE_SIZE))

    return panorama


def load_equirectangular(panoid: str) -> Image.Image:
    check_full_coverage(panoid)
    print("Downloading Street View source tiles...")
    download_tiles(panoid)
    print("Stitching 16K equirectangular panorama...")
    return stitch_equirectangular(panoid)


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


def save_multires_tiles(
    face: Image.Image,
    face_letter: str,
    max_level: int,
    cube_size: int,
    panorama_dir: Path,
) -> None:
    size = cube_size
    level_face = face

    for level in range(max_level, 0, -1):
        level_dir = panorama_dir / str(level)
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


def save_fallback(face: Image.Image, face_letter: str, panorama_dir: Path) -> None:
    fallback_dir = panorama_dir / "fallback"
    fallback_dir.mkdir(parents=True, exist_ok=True)
    fallback = face.resize((1024, 1024), Image.Resampling.LANCZOS)
    fallback.save(
        fallback_dir / f"{face_letter}.jpg",
        quality=JPEG_QUALITY,
        optimize=True,
        progressive=True,
    )


def url_base(out_dir: Path) -> str:
    out_dir = out_dir.resolve()
    if out_dir == PUBLIC_DIR or PUBLIC_DIR in out_dir.parents:
        return "/" + out_dir.relative_to(PUBLIC_DIR).as_posix()
    return out_dir.as_posix()


def write_config(
    yaw: float,
    pitch: float,
    panorama_dir: Path,
    cube_size: int,
    max_level: int,
) -> None:
    config = {
        "startYaw": yaw,
        "startPitch": pitch,
        "type": "multires",
        "multiRes": {
            "basePath": url_base(panorama_dir),
            "path": "/%l/%s%y_%x",
            "fallbackPath": "/fallback/%s",
            "extension": "jpg",
            "tileResolution": OUTPUT_TILE_SIZE,
            "maxLevel": max_level,
            "cubeResolution": cube_size,
        },
    }

    (panorama_dir / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")


def build_scene(
    equirectangular: Image.Image,
    yaw: float,
    pitch: float,
    out_dir: Path,
) -> None:
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    equirectangular.resize((1600, 800), Image.Resampling.LANCZOS).save(
        out_dir / "preview.jpg",
        quality=86,
        optimize=True,
        progressive=True,
    )

    cube_size = 8 * int((equirectangular.width / math.pi) / 8)
    max_level = int(math.ceil(math.log(float(cube_size) / OUTPUT_TILE_SIZE, 2))) + 1
    source = np.asarray(equirectangular, dtype=np.uint8)

    print(f"Generating Pannellum multires faces at {cube_size}px, max level {max_level}...")
    for face_letter in ("f", "b", "u", "d", "l", "r"):
        print(f"  face {face_letter}")
        face = equirectangular_to_face(source, face_letter, cube_size)
        save_fallback(face, face_letter, out_dir)
        save_multires_tiles(face, face_letter, max_level, cube_size, out_dir)

    write_config(yaw, pitch, out_dir, cube_size, max_level)


def main() -> None:
    Image.MAX_IMAGE_PIXELS = None

    parser = argparse.ArgumentParser(
        description="Generate Pannellum panorama assets for a geo-OSINT challenge "
        "from Google Street View tiles. You will be prompted for the panorama ID."
    )
    parser.add_argument("--yaw", type=float, default=0.0, help="initial horizontal view")
    parser.add_argument("--pitch", type=float, default=0.0, help="initial vertical view")
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help=f"output directory (default: {DEFAULT_OUT_DIR})",
    )
    args = parser.parse_args()

    panoid = input("Google Street View panorama ID: ").strip()
    if not panoid:
        parser.error("a panorama ID is required")

    equirectangular = load_equirectangular(panoid)
    build_scene(equirectangular, args.yaw, args.pitch, args.out)

    print(f"Done. Wrote panorama assets to: {args.out}")


if __name__ == "__main__":
    main()