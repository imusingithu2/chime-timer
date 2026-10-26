# Chime Timer

A countdown timer that looks like the iPhone Clock timer, plus **Chimes**: extra rings at any moment inside the total time.
Example: total 2:00, chime at 1:00 rings 3 s, the end at 2:00 rings 3 s again.

Free PWA: static files only, hosted on GitHub Pages, installed with Safari > Share > Add to Home Screen.

## Known limitations (iOS)
- iOS cannot run web apps in the background. Chimes ring only while the app is open and the screen is on.
  The app asks iOS to keep the screen awake; also set Settings > Display & Brightness > Auto-Lock to Never while timing.
- If the app was frozen past a chime by more than 2 s, that chime is shown as "Missed" and does not ring late.
- The silent switch / volume follow iOS media rules. Use Settings > Quick demo to test sound on your phone.

## Test on your computer
    node --test            # unit + static tests (no dependencies; do NOT add a folder argument)
    node tools/serve.cjs   # then open http://127.0.0.1:8080/chime-timer/

## Deploy (GitHub Pages: branch main, folder / root)
1. Bump `APP_VERSION` in `js/version.js` (every deploy! otherwise phones keep the old cached app).
2. `git add -A`, `git commit -m "Update"`, `git push`
3. Wait about 1-10 minutes. The installed app shows "Updated - tap to reload" next time it opens.

## Update problems / cache reset
- iPhone: delete the Home Screen icon, Settings > Apps > Safari > Advanced > Website Data > remove imusingithu2.github.io, then add it again.
- Desktop Chrome: DevTools > Application > Service Workers > Unregister, then Storage > Clear site data.

## Files
`index.html`, `manifest.webmanifest`, `sw.js` (offline cache), `js/` (engine + UI, classic scripts), `styles/`, `sounds/`, `icons/`
(regenerate with `node tools/generate_sounds.cjs` / `node tools/generate_icons.cjs`), `tests/`.
