# Vercel CTF Panorama Challenge

This repo serves the final panorama from `/` and checks guesses through a Vercel backend function. The frontend does not contain the target coordinates or flag.

## What Is Included

- Static viewer files in `public/`
- Pannellum multires panorama assets in `public/assets/panorama/`
- Coordinate submission form in `public/assets/app.js`
- Backend validator in `api/guess.js`
- Vercel headers in `vercel.json`

## Required Vercel Environment Variables

Set these in Vercel Project Settings before deploying:

- `CTF_TARGET_LAT`
- `CTF_TARGET_LNG`
- `CTF_FLAG`
- `CTF_SUCCESS_METERS`, optional, defaults to `25`

Do not commit real secret values. The local `.env` file is ignored by Git and can be copied into Vercel Project Settings.

## Cloudflare Access

Cloudflare Access can sit in front of the Vercel deployment if you use a custom domain on Cloudflare. Configure an Access application for the challenge hostname and put the shared access details in the challenge description.

## Vercel Settings

- Framework preset: Other
- Build command: leave blank
- Output directory: leave blank
- Install command: leave blank

Vercel serves files from `public/` at the root route and functions from `api/`.

## Local Preview

Use Vercel locally if you need the `/api/guess` function:

```bash
vercel dev
```

The static viewer alone can still be previewed with:

```bash
python3 -m http.server 4173 --directory public
```

## Regenerate Panorama Assets

The generated assets are already committed. If you need to regenerate them:

```bash
python3 scripts/build_panorama.py
```

The script writes the final scene to `public/assets/panorama/`.
