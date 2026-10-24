# CHIME TIMER - FULL SPECIFICATION

## 0. HOW TO WORK
You are a coding agent running locally with a small-context model. Build the app in the PHASES listed in section 15, one phase at a time. Keep files small (< ~300 lines), modular, and edit them surgically. After each phase: run tests, git commit with a clear message, and report in <= 5 lines. Do not ask questions; decide and document.

## 1. GOAL
Build "Chime Timer", a zero-dependency Progressive Web App for iPhone 17 (iOS 26 and iOS 27), installed via Safari -> Share -> Add to Home Screen ("Open as Web App" ON). It is a countdown timer that looks and feels as close as possible to the Timer in Apple's iPhone Clock app, PLUS one signature feature Apple's app does not have: "Chimes" - extra rings at custom checkpoints inside the total duration.

Signature example: total timer = 2:00. I add a chime "ring at 1:00, ring for 3 seconds". At 1:00 the phone rings for 3 seconds, the timer keeps counting, and at 2:00 (the end) it rings again for 3 seconds. All times are arbitrary (any hours/minutes/seconds), and I can add as many chimes as I want.

## 2. HARD CONSTRAINTS
- 100% free: no paid services, no API keys, no backend, no database, no accounts.
- Static files only. No build step, no frameworks, no npm runtime dependencies, no CDN, no external fonts/images/scripts. After the first load the app must work fully offline.
- Hosting target: GitHub Pages project site on a SUBPATH (https://USER.github.io/REPO/). Every URL must be relative (./x). Never start a URL with "/". Never hardcode the repo name.
- All deployable files live at the repository root (index.html at root). Add an empty .nojekyll. No GitHub Actions workflow (deploy from branch main, / root).
- UI language: English.
- Target: iPhone 17 (about 402x874 CSS px, 3x), iOS 26 and iOS 27, WebKit in standalone web-app mode. Also fine in a normal Safari tab and other iPhones. Use FEATURE DETECTION only; never sniff iOS version numbers.

## 3. PLATFORM FACTS (design for these; do not fight them)
1. A Home Screen web app on iOS cannot run in the background. When the screen locks or the app is switched away, JS is suspended and page audio stops. Therefore chimes can only ring on time while the app is in the foreground with the screen on. Do NOT implement hacks (silent keep-alive audio, fake media sessions) and do NOT implement push notifications in this version.
2. Mitigation: Screen Wake Lock API (works in Home Screen web apps since iOS 18.4). Request on Start/Resume (inside the user gesture); release on pause/cancel/end. It is auto-released when the app is hidden, so listen to 'visibilitychange' and re-request when visible and the timer is running; also listen to the lock's 'release' event. Wrap in try/catch (may throw NotAllowedError, e.g. Low Power Mode). If unsupported/denied show a hint: "Tip: set Settings > Display & Brightness > Auto-Lock to Never while using the timer." Show a small lock icon while the wake lock is active.
3. On iOS 26, AudioContext in installed Home Screen web apps could become permanently silent after relaunch. Do not depend on Web Audio.
4. The Vibration API does not exist on iOS Safari. Do not rely on it.
5. Service worker and Wake Lock need HTTPS (or localhost). Over plain http://LAN-IP they will not work; do not try to work around that.
6. After returning to the app, recompute everything from timestamps immediately.
7. All of the above must be written honestly in README ("Known limitations").

## 4. FEATURES
### 4.1 Timer basics
- Duration picker with three scrolling wheels: hours 0-23, min 0-59, sec 0-59. Minimum 1 s, maximum 23:59:59.
- Buttons like Apple Clock: Cancel (grey circle) + Start (green circle). While running: Cancel + Pause (orange). While paused: Cancel + Resume (green).
- Optional "Label" row (text) and "When Timer Ends" row (end sound + end-ring duration).
- Start is disabled when duration is 0.

### 4.2 Chimes (signature feature)
- Section "Chimes" in an iOS-style grouped list below the picker and the Label / When Timer Ends rows, with an "Add Chime" row (green plus).
- Chime fields: id, mode, time, ringSeconds, sound.
  - mode "fromStart": rings when elapsed time reaches `time` (default).
  - mode "beforeEnd": rings when remaining time reaches `time`.
  - time: arbitrary h/m/s via the same wheel picker.
  - ringSeconds: 1-60, default 3.
  - sound: one of the built-in sounds; default = the end sound.
- Add/edit in a bottom sheet (rounded top corners, dimmed backdrop, "Cancel"/"Done" in header) containing: h/m/s wheel, segmented control ["From start", "Before end"], a "Ring for" stepper in seconds, a "Sound" row with a preview button.
- Rows show a readable summary, e.g. "1:00 after start - 3 s - Bell"; tap to edit; swipe-left (or Edit mode with red minus) to delete.
- Validation:
  - A chime's resolved elapsed time must be > 0 and < total. Otherwise show the row in red with "Outside timer" and skip it at runtime.
  - Re-evaluate all chimes whenever the total changes.
  - Chimes resolving to the same time merge into one ring (use the longer ringSeconds).
  - A chime equal to the total is not allowed (that is the end ring).
- OPTIONAL priority 2 (only if clean): "Every" chime type: rings every N (h/m/s) from the start, at N, 2N, 3N... below total.

### 4.3 End ring
- Rings for `endRingSeconds`. Default 3 s (matches my example). Range 1-60 s, plus "Until I stop it". Sound selectable.
- Full-screen "Timer Ended" state with a big "Stop" button and the label.
- If the end ring starts while a chime ring is playing, stop the chime ring and start the end ring immediately.

### 4.4 While running
- Large SVG progress ring (orange #FF9F0A, depleting), big remaining time in the centre (weight 200, tabular numerals), and an end-time line with a vector bell icon, e.g. "3:42 PM" (draw the bell as SVG, no emoji).
- Each chime is a small white tick on the ring at its position. Below: "Next chime in 0:45" or "No more chimes".
- When a chime rings: brief banner "Chime - 1:00" and a "Stop" button to silence it early.
- Pause stops any ring currently playing. After Resume, chimes keep their position relative to elapsed time.
- Subtle note: "Keep this app open and the screen on for chimes to ring."

### 4.5 Recents
- After Start, save the timer (total, label, chimes, sounds, end ring) to Recents (max 20, newest first, no exact duplicates).
- Row: big duration, small label or chime summary (e.g. "2:00 - rings at 1:00"), round green play button to restart it. Swipe-left to delete.

### 4.6 Persistence
- localStorage (every access in try/catch): current timer state, draft configuration, Recents, Settings.
- Reopening while a timer runs shows the correct remaining time (from timestamps, never from counted ticks).

### 4.7 Settings (row at the bottom of the main list, opens a sheet)
- Default sound, default ring seconds, default end ring.
- "Test sound" button.
- "Keep screen on while running" toggle (default ON).
- "Quick demo" button: starts a 20 s timer with a chime at 10 s, for testing on the phone.
- App version label (e.g. v1.0.0).
- "Reset audio" button (redo the audio unlock).

## 5. TIMER ENGINE (pure logic)
`js/timer-engine.js` is a PURE module (no DOM). Use wall-clock timestamps (Date.now()) so state survives reloads.
State: { status: 'idle'|'running'|'paused'|'ended', totalMs, accumulatedMs, lastResumeAt, chimes[], endRingSeconds, firedChimeIds[], missedIds[], label }.
- elapsedMs(state, now) = accumulatedMs + (running ? now - lastResumeAt : 0), clamped to [0, totalMs]. remainingMs = totalMs - elapsedMs.
- resolveChimes(chimes, totalMs) -> [{ id, atElapsedMs, ringSeconds, sound, valid }] sorted ascending; handles fromStart, beforeEnd, optional every; merges duplicates.
- dueEvents(state, now) -> chimes and the end event that are due and not fired yet.
- Catch-up rule: if an event is at most 2 s late, ring it; if later, mark it fired + "missed" (do NOT ring late) and show a "Missed" tag. If the whole timer ended while the app was hidden, show "Timer Ended" with "Ended at HH:MM" and play no sound.
- Pause: accumulatedMs = elapsed, lastResumeAt = null. Resume: lastResumeAt = now.
- Never count ticks. A 100 ms setInterval (plus requestAnimationFrame for drawing while visible) only READS the clock and calls dueEvents. Also run an immediate tick on visibilitychange, pageshow and focus.

## 6. AUDIO
- Primary playback: preloaded HTMLAudioElement instances (one per sound, created once, kept for the app's lifetime). NOT AudioContext.
- iOS requires a user gesture. On the first pointer/touch gesture (and on every Start/Resume) unlock EVERY element: play it muted inside the gesture handler, then pause and reset. Reuse the same elements at ring time; never create new Audio() objects at ring time.
- A ring of N seconds = loop a short tone pattern (loop = true) and stop after N seconds without an audible click (iOS ignores `volume`, so design the loop and the stop to be clean).
- If play() rejects (NotAllowedError) show a non-blocking banner "Sound blocked - tap anywhere to enable" and retry the unlock on the next tap. "Reset audio" redoes the full unlock.
- Feature-detect `navigator.audioSession`; if present set `navigator.audioSession.type = 'playback'` (try/catch) so sounds can play with the silent switch on.
- Generate ORIGINAL sounds with `tools/generate_sounds.py` (Python standard library only: wave, math, struct); run it and commit the output in `sounds/`. 6 sounds, 44.1 kHz mono 16-bit WAV, each a 1.0-1.5 s pattern that loops seamlessly (start/end at zero crossing): "Bell", "Chime", "Marimba", "Beacon", "Pulse", "Digital". Do NOT imitate Apple's sounds or names. Each file < ~250 KB. Also `sounds/silent.wav` (0.5 s).
- Preview buttons play a sound for about 1.5 s.

## 7. iOS PWA REQUIREMENTS
index.html <head> must include:
- <meta charset="utf-8">
- <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
- <meta name="apple-mobile-web-app-capable" content="yes"> and <meta name="mobile-web-app-capable" content="yes">
- <meta name="apple-mobile-web-app-title" content="Chime Timer">
- <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
- <meta name="theme-color" content="#000000">
- <link rel="manifest" href="./manifest.webmanifest">
- <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png"> (180x180 PNG)
- <link rel="icon" href="./icons/icon-192.png">
manifest.webmanifest: name "Chime Timer", short_name "Chime Timer", id "./", start_url "./", scope "./", display "standalone", orientation "portrait", background_color "#000000", theme_color "#000000", icons 192, 512 and a 512 maskable (PNG, relative paths).
Icons: generate with `tools/generate_icons.py` (Pillow if available, else a small pure-Python PNG encoder). Design: black full-bleed square, orange circular ring with small white tick marks and a small bell/clock motif; original artwork; do not pre-round corners. Commit the PNGs.
CSS rules for native feel: safe-area padding via env(safe-area-inset-*); 100dvh; overscroll-behavior: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; touch-action: manipulation; inputs >= 16px font; tap targets >= 44 px; aria-labels; honour prefers-reduced-motion; pause animation/drawing when the page is hidden.

## 8. VISUAL DESIGN (match Apple Clock's Timer)
- Font: -apple-system, "SF Pro Display", "SF Pro Text", system-ui, sans-serif. Big digits weight 200, font-variant-numeric: tabular-nums, ~76-84 px on the running screen.
- Dark by default (OLED black #000000); also support light mode via prefers-color-scheme.
- Dark tokens: background #000000, grouped card #1C1C1E, separator #38383A, text #FFFFFF, secondary #8E8E93, Cancel fill #333333, Start green #30D158 text on rgba(48,209,88,0.22), Pause/ring orange #FF9F0A on rgba(255,159,10,0.22), destructive red #FF453A.
- Round buttons 80-88 px with a thin outer ring and a 2 px gap, like Apple's.
- Picker: custom scroll-snap wheel (scroll-snap-type: y mandatory), item height 44 px, 5 visible rows, top/bottom fade mask, selection band rgba(255,255,255,0.12) radius 10 px, unit label ("hours", "min", "sec") right of the selected number. Commit values on `scrollend` (fallback: debounced scroll).
- Grouped lists: 12 px rounded cards, 1 px separators, small uppercase grey section headers, chevrons on navigable rows, 17 px text.
- Sheets: slide-up ~300 ms, 16 px rounded top corners, grabber bar, dimmed backdrop, close on backdrop tap.
- Running screen: ring ~300 px centred; Cancel left, Pause/Resume right below; chime list below.
- No tab bar, no fake navigation. Only the Timer experience.

## 9. FILE STRUCTURE (repository root)
index.html, manifest.webmanifest, sw.js (must be at root for scope), .nojekyll, README.md, CLAUDE.md, SPEC.md
styles/: base.css, picker.css, components.css, running.css
js/: main.js, timer-engine.js, audio.js, storage.js, wakelock.js, settings.js, ui-picker.js, ui-main.js, ui-chimes.js, ui-sheet.js, ui-running.js
icons/: apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png
sounds/: 6 WAV files + silent.wav
tools/: generate_sounds.py, generate_icons.py
tests/: engine.test.mjs, check-static.mjs, e2e.mjs (optional)

## 10. SERVICE WORKER, OFFLINE, UPDATES
- `APP_VERSION` constant (start "1.0.0") in js/main.js and sw.js (a test checks they match). Cache name `chime-timer-v${APP_VERSION}`. Precache every file the app needs (relative URLs, resolved against self.registration.scope).
- Fetch: stale-while-revalidate for same-origin GET; navigation requests fall back to cached index.html when offline.
- On activate delete old caches; use skipWaiting() and clients.claim().
- Register with a relative path (`./sw.js`), scope `./`.
- When a new service worker takes control, show a banner "Updated - tap to reload". Show the version in Settings.

## 11. TESTING (run everything yourself)
1. `node --test tests/` for timer-engine.js: the example (total 2:00, chime 1:00 fromStart 3 s, end ring 3 s -> events at 60 s and 120 s); beforeEnd mode; pause/resume shifting; invalid chime outside total; duplicate merge; catch-up (<= 2 s late rings, later = missed); state restored after reload; changing total re-resolves chimes; max duration 23:59:59.
2. `node tests/check-static.mjs`: valid manifest JSON; every file referenced by index.html, the manifest and the precache list exists; no URL starts with "/"; APP_VERSION matches in sw.js and js/main.js; icon sizes correct; every source file < 400 lines.
3. Local dev server for subpath testing: create the project inside a parent folder and serve the PARENT, so the app is at http://localhost:8080/chime-timer/ (e.g. `cd .. && python3 -m http.server 8080`).
4. If possible install Playwright WebKit (`npx playwright install webkit`) as a DEV-ONLY tool (never a runtime dependency; keep node_modules out of git via .gitignore). Emulate 402x874 at deviceScaleFactor 3 and: (a) assert no horizontal overflow and all controls are inside the viewport; (b) with a fast-forwarded clock verify the example fires at the right times; (c) verify offline works after the first load. If your model can view images, take screenshots of idle / chime sheet / running / ended screens and fix visible problems; if not, rely on the DOM assertions.
5. Do not leave test-only code in the shipped app.

## 12. GIT AND DEPLOY
- Commit after every phase. Commit message style: "phase N: <what>".
- Final deploy = push to branch `main` of a public GitHub repo, then enable Pages (Settings -> Pages -> Deploy from a branch -> main / root). If `gh` is installed and authenticated you may run `gh repo create chime-timer --public --source=. --push`; otherwise print the exact commands for me to run.
- README.md must contain: what the app is; deploy steps; install steps on iPhone; how to update (reopen the app twice, check the version in Settings); "Known limitations" (foreground only, screen must stay on, silent switch note, iOS 26 audio issue, no push, LAN http has no SW/Wake Lock); troubleshooting (no sound -> Reset audio, fully close and reopen; stale version -> close from the app switcher and reopen).

## 13. OUT OF SCOPE
Push notifications, accounts, cloud sync, multiple simultaneous timers, other Clock tabs (alarm, stopwatch, world clock), analytics, any server code.

## 14. ACCEPTANCE CHECKLIST
[ ] Works from a subpath; no absolute URLs.
[ ] Installable with correct icon, name and full-screen layout.
[ ] Wheel picker; max 23:59:59; Start disabled at 0.
[ ] Example works (verified by tests with a fake clock).
[ ] Multiple chimes, both modes, per-chime ring length and sound.
[ ] Pause/Resume/Cancel correct; reload while running restores remaining time.
[ ] Catch-up / missed logic tested.
[ ] Wake Lock requested on Start, re-acquired after returning, graceful fallback.
[ ] Audio unlocked by gesture; blocked-audio banner and Reset audio work.
[ ] Recents saves and replays chimes.
[ ] Offline after first load; update banner and version label.
[ ] README complete. All tests pass.

## 15. PHASES
PHASE 1 - Engine: js/timer-engine.js + tests/engine.test.mjs + tests/check-static.mjs skeleton. All engine tests green.
PHASE 2 - Audio: tools/generate_sounds.py (run it), sounds/, js/audio.js (unlock, play N seconds, stop, banner hook), js/storage.js, js/wakelock.js.
PHASE 3 - Main screen UI: index.html, styles/*, js/ui-picker.js, js/ui-main.js, js/ui-sheet.js, js/ui-chimes.js, Recents, Settings sheet, persistence. No running screen yet except a stub.
PHASE 4 - Running + ended screens: js/ui-running.js, ring with chime ticks, banners, pause/resume/cancel, tick loop wired to the engine and audio, wake lock wiring, catch-up UI.
PHASE 5 - PWA: manifest, tools/generate_icons.py (run it), icons, sw.js, update banner, version label, check-static green.
PHASE 6 - QA and delivery: Playwright checks (if possible), fix issues, README, final acceptance walkthrough, git push instructions.
