# AthkarNFC

A small Arabic prayer reader and audio player opened from an NFC tag. Built with HTML, CSS and vanilla JavaScript; no runtime framework or build step.

## Use

On opening, autoplay selects morning prayers before 12:00 noon and evening prayers from 12:00 noon, using the device’s local time. Autoplay is enabled by default and can be turned off in Settings. Only one recording plays at a time. Both normal and car modes offer ten-second seeking, playback speed, keyboard-accessible progress sliders, and repetition buttons with reset. Counts are stored as numbers in the prayer data; display labels do not determine behavior.

NFC tags can point to:

- `/` — normal reader.
- `/car.html` — larger controls.
- `/?autoplay=travel`, `/?autoplay=morning`, `/?autoplay=evening`.
- `/car.html?autoplay=auto` — morning from 00:00 through 11:59 in the device's local time, otherwise evening.

When autoplay is enabled, playback is attempted on opening, but browsers may require pressing Play after navigation. A saved autoplay opt-out is respected even when an NFC URL contains `autoplay=...`; that URL still selects the requested prayer. Explicit travel/morning/evening links override the time-based selection without changing the saved preference. Invalid query values fall back to the normal startup behavior. No unrelated tap starts audio. The app does not interrupt an ongoing session when noon arrives. The time-based selection is a convenience, not a calculation of local prayer times.

## Saved preferences

The Settings button stays available in both modes, including the focused reader. Preferences are stored locally in this browser and shared across normal and car modes:

- Autoplay when opening (default: on).
- Playback speed: 1x, 1.25x, 1.5x or 2x (default: 1x).
- Keep screen awake while playing (default: on, where supported).
- Vibrate when counting (default: on, where supported).
- Follow synchronized prayer text automatically (default: on).

Changes apply immediately except autoplay, which applies on the next opening. Changing speed in the player also updates the saved setting. Existing speed preferences from older versions are preserved. With autoplay off, opening the app restores the last selected prayer without playing it; an explicit NFC selection takes precedence. Preferences are validated, and unavailable browser storage falls back to session-only settings with a visible message. Settings changes in another open tab update controls without starting audio.

Preferences are not synced across browsers or devices and are lost if site storage is cleared. Counts reset on a page reload; playback position is not persisted. Screen wake lock is requested only during playback when enabled and released on pause, close or completion where the browser supports it.

## Offline use

Serve through HTTPS (localhost also works). The service worker saves the pages, styles, scripts and prayer data. Audio is **not** downloaded automatically.

Press **Save offline** for each recording you want. Wait for **Audio available offline** before disconnecting. The button then lets you remove the stored audio. Saved recordings support seeking offline, including HTTP byte-range responses. Browser storage can be cleared or evicted, so check availability before relying on it.

The worker uses versioned shell caches. After an update installs, close all app tabs/windows and reopen to activate it. Increment the shell cache version when changing cached application assets. External Google Fonts are optional; system fonts remain available offline.

## Local development

Use Node.js 22 or newer:

```sh
npm ci
npm run serve
```

Open `http://127.0.0.1:4173`. The development server supports audio range requests. Alternatively use any static HTTP server. Do not open the HTML as a `file://` URL.

```sh
npm run check
npx playwright install chromium webkit
npm run test:browser
```

Checks cover data validation, repetition counts, fallback loading, byte ranges, deployment completeness, playback controls, blocked autoplay, mobile layout, and offline playback in Chromium and emulated mobile WebKit. Offline tests shut down the actual local origin server; Chromium additionally uses browser offline emulation. WebKit’s offline emulation rejected cached requests in the macOS test environment, so server shutdown is used to verify cache-only behavior there. CI runs the same suite. These browser tests do not replace physical iPhone/Android NFC, Bluetooth, steering-wheel or lock-screen testing.

## Files

- `index.html`, `style.css`: normal reader.
- `car.html`, `car.css`: car-mode layout.
- `player.js`, `player.css`: shared player and interaction behavior.
- `shared.js`: track configuration, data validation and reusable helpers.
- `assets/athkar/`: prayer text, numeric repetition counts and transcript segments. `evening_audio.json` follows the evening recording's spoken order and timing; `evening.json` remains its reading-only fallback.
- `assets/audio/`: three recordings and `SOURCES.md` attribution.
- `sw.js`: app-shell caching and user-requested offline audio.
- `deploy/files.txt`: explicit publication allowlist.
- `tests/`: data, asset and browser regression tests.

Morning and evening text load independently. If the synchronized morning dataset fails, the separate morning reading collection is used. The app never generates morning prayers by rewriting evening text. The evening recording was transcribed locally with Whisper and manually aligned at prayer boundaries to reviewed text from the existing collection. Its audio includes three spoken cycles of Al-Ikhlas, Al-Falaq and An-Nas plus two invocations absent from the previous evening list, so the synchronized cards follow the recording rather than the older list's order. `evening.json` remains the fallback. This engineering update does not constitute religious certification; the two newly added invocations and all timestamp boundaries should receive human review before publication.

## Deployment

The site works on a static HTTPS host. Publish the entries in `deploy/files.txt`; exclude `.git`, `node_modules`, tests and development files. Subdirectory hosting is supported through relative asset paths.

For the existing GCP/Nginx setup, configure `gcloud` and run:

```sh
VM_NAME=athkarnfc-vm VM_ZONE=us-central1-a REMOTE_DIR=/var/www/athkarnfc bash deploy/deploy.sh
```

The script stages all published files through the SSH user's home, then copies them into the served directory with sudo. It does not change DNS, Nginx or TLS configuration and does not delete unrelated remote files. The SSH user needs the required VM access and sudo privileges. Set the static server's `.mp3` content type to `audio/mpeg` and retain byte-range support. Serve `sw.js` with revalidation/no-cache headers so browsers can discover updates.

## Audio attribution and rights

The evening recording is Mishary Alafasy's 1434 AH edition, downloaded from [IslamHouse](https://islamhouse.com/ar/audios/327603/). Exact source, checksum and rights status are in [audio sources](assets/audio/SOURCES.md). Redistribution permission was not established; confirm it before publicly publishing the bundled media. The original README identified the code as MIT; audio recordings are separate works and are not covered by that statement.
