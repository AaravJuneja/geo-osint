# Final Panorama Handoff

This repo is trimmed to the final selected version and serves it from the root route.

## What Is Included

- Static Netlify site in `public/`
- Final route at `/`
- Pannellum multires panorama assets in `public/assets/panorama/`
- Guess map UI with `sike` / `wrong` result output

## Netlify Settings

- Branch: `main`
- Base directory: leave blank
- Build command: leave blank
- Publish directory: `public`
- Functions directory: leave blank

## Local Preview

```bash
python3 -m http.server 4173 --directory public
```

Open `http://127.0.0.1:4173/`.

## Regenerate Panorama Assets

The generated assets are already committed. If you need to regenerate them:

```bash
python3 scripts/build_panorama.py
```

The script writes the final scene to `public/assets/panorama/`.

## Implementation Notes

- `public/assets/app.js` initializes Pannellum and the guess checker.
- `public/assets/styles.css` contains only minimal fullscreen viewer and map overlay styles.
- Adjustable viewer settings are commented at the top of `public/assets/app.js`.
- Adjustable source / tile generation settings are commented at the top of `scripts/build_panorama.py`.
- The answer tolerance is controlled by `SUCCESS_METERS` in `public/assets/app.js`.
- The final target point and viewer start angle are centralized in `app.js` and `scripts/build_panorama.py` for easy replacement by the developer.
