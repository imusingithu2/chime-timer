# Chime Timer

A zero-dependency Progressive Web App for iPhone that provides a countdown timer with custom "Chime" rings at arbitrary checkpoints.

## Features
- **Apple-style UI**: Familiar wheel pickers and grouped lists.
- **Custom Chimes**: Add as many rings as you want at specific elapsed or remaining times.
- **PWA Ready**: Install via Safari -> Share -> Add to Home Screen.
- **Offline Support**: Works fully offline after the first load.
- **Wake Lock**: Keeps the screen on while the timer is running to ensure chimes ring on time.

## Installation on iPhone
1. Open the app URL in Safari.
2. Tap the **Share** button (square with up arrow).
3. Scroll down and tap **Add to Home Screen**.
4. Ensure "Open as Web App" is ON.

## Deploy Steps (for the developer)
This app is designed for GitHub Pages.
1. Push the code to the `main` branch of a public GitHub repository.
2. Go to **Settings** -> **Pages**.
3. Under **Build and deployment**, set Source to "Deploy from a branch" and select `main` / `/ (root)`.

## Known Limitations
- **Foreground Only**: iOS suspends web apps in the background. The app must be open and the screen on for chimes to ring.
- **Screen Lock**: The app uses the Wake Lock API to prevent sleep, but this may be overridden by "Low Power Mode" or system settings.
- **Silent Switch**: On some iOS versions, the physical silent switch may mute audio.
- **iOS 26 Audio**: In some cases, audio may become silent after relaunching a Home Screen app; use the "Reset audio" button in Settings.
- **LAN/HTTP**: Service Workers and Wake Lock require HTTPS. They will not work over plain http://LAN-IP.

## Troubleshooting
- **No sound?** Try the "Reset audio" button in Settings, or tap anywhere on the screen to unlock audio.
- **Stale version?** Fully close the app from the App Switcher and reopen it. A banner will appear if an update is available.
