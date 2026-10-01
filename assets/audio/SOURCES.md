# Audio sources

## track3.mp3 — evening remembrances

- Reciter: Mishary bin Rashid Alafasy (مشاري بن راشد العفاسي).
- Edition: 1434 AH evening remembrances.
- Publisher listing: https://islamhouse.com/ar/audios/327603/
- Original download: https://d1.islamhouse.com/data/ar/ih_sounds/chain_01/Mishari_Raashid/Azkar_AlSba7_w_AlMsa/ar_1434_Azkar_AlMsa.mp3
- Retrieved: 2026-09-23.
- Original file retained without transcoding or editing.
- Duration reported by ffprobe: 601.578900 seconds.
- File size: 24,109,982 bytes.
- SHA-256: `6d579e4002a8cd21effcd3aa94c50455c96f275265ae645081bb354ec9f085a0`.
- Validation: embedded artist/title agree with the publisher listing; full file decoded with ffmpeg without errors.

The listing provides an MP3 download. No explicit redistribution license was found on the listing. The site's disclaimer does not grant a general copyright license: https://d1.islamhouse.com/html/disclaimer.htm. Do not treat this recording as MIT-licensed code. Confirm redistribution permission before publishing the bundled recording publicly. This source record documents provenance, not a grant of rights.

The existing evening reading collection has not been aligned or audited against this recording. The UI labels it as independent reading and uses ten-second seeking instead of suggesting synchronized chapters.

## track2.mp3 — morning remembrances

- Reciter: Mishary bin Rashid Alafasy (مشاري بن راشد العفاسي), per the file's own tags.
- Edition: 1434 AH morning remembrances (`أذكار الصباح - إصدار عام 1434هـ`).
- Publisher: IslamHouse, per the file's own tags (`TAG:publisher=www.islamhouse.com`).
- Original download: https://d1.islamhouse.com/data/ar/ih_sounds/chain_01/Mishari_Raashid/Azkar_AlSba7_w_AlMsa/ar_1434_Azkar_AlSba7.mp3
- Retrieved: 2026-10-02.
- Original file retained without transcoding or editing.
- Duration reported by ffprobe: 832.172400 seconds (13:52).
- File size: 33,333,722 bytes.
- SHA-256: `40aef2e20056f97d6c18a18366f9dac4db832e541c352427bc6748029d8a05a5`.
- Audio: MP3, 320 kbps, 44,100 Hz, stereo.
- Validation: the whole file decoded with ffmpeg without errors, and its embedded tags agree with the edition (artist `القارئ: مشاري بن راشد العفاسي`, album and title `أذكار الصباح - إصدار عام 1434هـ`, date `1434`).

This file replaces the previous `track2.mp3`, which the original repository shipped without any documented source. The old file is not deleted from the project's history, and a copy is kept locally outside version control with the previous `morning_v2.json`.

No dedicated IslamHouse listing page for the morning recording was found: it sits in the same publisher directory as the evening file, and the neighbouring identifier `https://islamhouse.com/ar/audios/327604/` is an unrelated item. Identification therefore rests on the file's own tags, its directory and its content, not on a listing page. Attribution is verified for the file as downloaded; the same rights caution as for the evening recording applies.

`morning_audio.json` was synchronized to this recording: its timings come from a machine transcript (OpenAI Whisper, `small` model, Arabic) that was used only to locate the spoken boundaries. The displayed text is never the machine transcript — every dhikr card carries the reviewed wording of `morning.json` verbatim, and every Quran card carries the text already verified for the evening dataset. The transcript itself is not published.

## Existing track1.mp3

Retained unchanged from the original repository. Its original download source and redistribution permissions were not documented there.
