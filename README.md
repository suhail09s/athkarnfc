# AthkarNFC

A small Arabic prayer reader and audio player opened from an NFC tag. Built with HTML, CSS and vanilla JavaScript; no runtime framework or build step. The interface is Arabic by default and can be switched to English, and every option is stored in the browser. The site is published to GitHub Pages by GitHub Actions.

## Use

On opening, autoplay selects morning prayers before the switch hour and evening prayers from it, using the device's local time. The switch hour is 12:00 noon unless it is changed in Settings. Autoplay is enabled by default and can be turned off in Settings. Only one recording plays at a time. Both normal and car modes offer ten-second seeking, playback speed, keyboard-accessible progress sliders, and repetition buttons with reset. Normal mode adds Previous and Next prayer buttons, which move one prayer at a time from the card being read, even while the text is still scrolling into place. Counts are stored as numbers in the prayer data; display labels do not determine behavior. The interface language is a setting: Arabic by default, English on request. It also sets the page direction, so English mode reads left to right, while the prayer text and the car-mode tab names stay Arabic and right to left.

NFC tags can point to:

- `/` — normal reader.
- `/car.html` — larger controls.
- `/?autoplay=travel`, `/?autoplay=morning`, `/?autoplay=evening`.
- `/car.html?autoplay=auto` — morning before the switch hour in the device's local time, otherwise evening.

When autoplay is enabled, playback is attempted on opening, but browsers may require pressing Play after navigation. A saved autoplay opt-out is respected even when an NFC URL contains `autoplay=...`; that URL still selects the requested prayer. Explicit travel/morning/evening links override both the time-based selection and the saved prayer to open, without changing either preference. Invalid query values fall back to the normal startup behavior. No unrelated tap starts audio. The app does not interrupt an ongoing session when the switch hour arrives. The time-based selection is a convenience, not a calculation of local prayer times.

## Synchronized text and fallbacks

Each recitation has a synchronized dataset and a reading-only fallback:

| Track | Synchronized | Reading fallback |
| --- | --- | --- |
| Morning | `assets/athkar/morning_v2.json` | `assets/athkar/morning.json` |
| Evening | `assets/athkar/evening_audio.json` | `assets/athkar/evening.json` |

The synchronized datasets follow the recording, so they contain what the reciter actually recites. `evening_audio.json` keeps the three spoken cycles of Al-Ikhlas, Al-Falaq and An-Nas as separate cards and sets every count to one, while the reading fallback keeps the longer classical list with its 3, 4, 7, 10 and 100 repetitions. The two lists are therefore not interchangeable: when a synchronized dataset fails to load, the reading list is used and the player says so above the text. Morning and evening load independently, and the app never generates one track's prayers by rewriting the other's text.

## Saved preferences

The Settings button stays available in both modes, including the focused reader, and the dialog groups its options into appearance, reading and opening. Preferences are stored locally in this browser and shared across normal and car modes.

Interface and appearance:

- Language: Arabic (default) or English. It sets the page direction and every label, message and accessible name.
- Theme: dark (default) or light.
- Accent colour: violet (default), teal, amber or rose.
- Prayer text size: small, normal (default), large or extra large.
- Prayer font: Amiri (default), Naskh or the system font.

Reading and playback:

- Playback speed: 1x (default), 1.25x, 1.5x or 2x.
- Keep screen awake while playing (default: on, where supported).
- Vibrate when counting (default: on, where supported).
- Follow synchronized prayer text automatically (default: on).

When opening:

- Autoplay when opening (default: on).
- The hour when evening prayers begin, 00:00 to 23:00 (default: 12:00), in the device's local time.
- Prayer to open: by time of day (default), the last opened prayer, or one fixed prayer.

**Reset to defaults** clears the saved record, so the values above apply again and any later change to those defaults is picked up.

Every value is validated when it is read: an unknown or out-of-range value falls back to its default, so a corrupt or older record cannot break the app. Changes apply immediately, except autoplay, which applies on the next opening. Changing speed in the player also updates the saved setting, and existing speed preferences from older versions are preserved. With the prayer to open set to by time of day and autoplay off, opening the app restores the last selected prayer without playing it; an explicit NFC selection takes precedence. Preferences are not synced across browsers or devices and are lost if site storage is cleared. Unavailable browser storage falls back to session-only settings with a visible message. Settings changes in another open tab update the controls without starting audio.

Changing the language does not rebuild the prayer cards, so repetition counts survive it. Counts still reset on a page reload, and playback position is not persisted. Screen wake lock is requested only during playback when enabled and released on pause, close or completion where the browser supports it.

## Offline use

Serve through HTTPS (localhost also works). The service worker saves the pages, styles, scripts and prayer data. Audio is **not** downloaded automatically.

Press **Save offline** for each recording you want. Wait for **Audio available offline** before disconnecting. The button then lets you remove the stored audio. Saved recordings support seeking offline: the worker answers HTTP byte-range requests from the saved copy, reusing the stored body instead of re-reading the whole file on every seek. Browser storage can be cleared or evicted, so check availability before relying on it.

The worker uses versioned shell caches. After an update installs, close all app tabs/windows and reopen to activate it. Increment the shell cache version when changing cached application assets. Registration uses `updateViaCache: 'none'`, so the worker and the scripts it imports are always revalidated rather than served from an HTTP cache that a static host may keep for minutes. External Google Fonts are optional; system fonts remain available offline.

## Local development

Use Node.js 22 or newer:

```sh
npm ci
npm run serve
```

Open `http://127.0.0.1:4173`. The development server supports audio range requests. Alternatively use any static HTTP server. Do not open the HTML as a `file://` URL.

To try it on a phone on the same network, run `HOST=0.0.0.0 npm run serve` and open `http://<your-computer-ip>:4173`. A LAN address over plain HTTP is not a secure context, so the service worker and **Save offline** stay unavailable there; use an HTTPS tunnel (for example `cloudflared tunnel --url http://127.0.0.1:4173`) when you need to test offline saving or installation on a device.

```sh
npm run check
npx playwright install chromium webkit
npm run test:browser
npm run stage
```

`npm run stage` builds the published site into `_site` exactly as the deployment workflow does. Checks cover data validation, repetition counts, fallback loading and reporting, byte ranges, deployment completeness, playback controls, blocked autoplay, mobile layout, and offline playback in Chromium and emulated mobile WebKit. Offline tests shut down the actual local origin server; Chromium additionally uses browser offline emulation. WebKit's offline emulation rejected cached requests in the macOS test environment, so server shutdown is used to verify cache-only behavior there. CI runs the same suite. These browser tests do not replace physical iPhone/Android NFC, Bluetooth, steering-wheel or lock-screen testing.

## Files

- `index.html`, `style.css`: normal reader.
- `car.html`, `car.css`: car-mode layout.
- `player.js`, `player.css`: shared player and interaction behavior.
- `shared.js`: track configuration, data validation and reusable helpers.
- `assets/athkar/`: prayer text, numeric repetition counts and transcript segments.
- `assets/audio/`: three recordings and `SOURCES.md` attribution.
- `assets/icons/`: SVG icon and the generated PNG icons used for installation and home screens.
- `sw.js`: app-shell caching and user-requested offline audio.
- `deploy/files.txt`: explicit publication allowlist.
- `deploy/stage.cjs`: builds the Pages artifact from that allowlist.
- `.github/workflows/`: continuous checks and the Pages deployment.
- `tests/`: data, asset and browser regression tests.
- `work/`: the local Whisper transcript builder and its output. Only the builder script is committed; the 275 MB of model weights beside it stay out of git and out of the published site.

The evening recording was transcribed locally with Whisper and manually aligned at prayer boundaries to reviewed text from the existing collection. Its audio includes three spoken cycles of Al-Ikhlas, Al-Falaq and An-Nas plus two invocations absent from the previous evening list, so the synchronized cards follow the recording rather than the older list's order. `evening.json` remains the fallback. This engineering update does not constitute religious certification; the two newly added invocations and all timestamp boundaries should receive human review before publication.

## Deployment (GitHub Pages)

The site is static, so it publishes straight from the repository. One-time setup:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Keep `CNAME` (`nfc.tajseed3d.com`) in the repository and at the root of the published artifact. Point the domain's DNS at GitHub Pages (a `CNAME` record for the subdomain, A/AAAA records for an apex domain), then enable **Enforce HTTPS** once the certificate is issued.
3. Push to `main`. The `Deploy to GitHub Pages` workflow runs `npm run check`, stages the site with `node deploy/stage.cjs _site`, and uploads that directory as the Pages artifact.

Only the paths listed in `deploy/files.txt`, plus everything under the directories listed there, are published. Staging skips `.DS_Store`, `Thumbs.db` and `.gitkeep`; `.git`, `node_modules`, `tests`, `deploy` and `work` never reach the site. The empty `.nojekyll` file is published so Pages copies the site verbatim instead of running Jekyll, and a failing `npm run check` stops the deployment before it starts.

Notes that are specific to this host:

- Response headers are not configurable. The service worker therefore accepts a host that serves audio as `application/octet-stream`, and audio saved for offline use is served from the cache with byte ranges, so seeking works without any server support. GitHub Pages does support range requests for uncached audio and serves `.mp3` as `audio/mpeg`.
- The recordings (about 38 MB) are stored in git because the artifact is built from the checkout. Pages allows 1 GB per repository and asks for under 100 GB of traffic per month. Git LFS is deliberately not used, because the published artifact needs the actual bytes.
- Subdirectory hosting also works, because every asset path in the pages and scripts is relative.

## Audio attribution and rights

The evening recording is Mishary Alafasy's 1434 AH edition, downloaded from [IslamHouse](https://islamhouse.com/ar/audios/327603/). Exact source, checksum and rights status are in [audio sources](assets/audio/SOURCES.md). Redistribution permission was not established; confirm it before publicly publishing the bundled media. The original README identified the code as MIT; audio recordings are separate works and are not covered by that statement.

Only the evening recording has a documented reciter, so `TRACKS` in `shared.js` records an artist for that track alone. The player shows that credit and publishes it as Media Session metadata; the other two recordings deliberately carry no artist rather than an unverified one. `SOURCES.md` remains the record of provenance, not a grant of rights.
