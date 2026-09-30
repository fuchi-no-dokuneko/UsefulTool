# Ear tracks and timeline editing acceptance

September 28, 2026. Changes are confined to the video editor, its generated offline page, tests and this record.

Follow-up: the [September 29 Firefox preview UAT](video-studio-preview-firefox-uat.md) reproduced and fixed preview switching after export, unavailable audio startup, and track switches stopping playback. Its checks assert actual moving preview pixels.

| Request | Implemented behavior and evidence |
| --- | --- |
| Left/right sound in **Your movie** | Sound is expanded initially. Stereo segments display separate labelled L/R waveforms. Decoupled ears have independent named tracks. Firefox upload and media-library drop checks exercise the actual interface. |
| Temporarily disable video/audio tracks | Each timeline track has an **On/Off** button. Picture and sound can be disabled separately, including each ear. Preview and export use these states; segments and timing remain intact. |
| Decouple video or MP3 and offset ears | Select the video or sound, click **Decouple L/R**, then drag either ear or edit **Starts at (sec)**. Left at 0 and Right at 15 makes Left play 15 seconds earlier. Original stereo source channels, trims, speed, fades, volume and looping are preserved. Undo restores the original stereo segment. |
| Copy and paste video/audio segments | **Ctrl+C / Ctrl+V** and **Command+C / Command+V**, plus Copy/Paste buttons. Click the ruler or an empty track area to choose the paste time. Main video splits at an interior playhead and shifts later clips; gaps allow pasting beyond its end. Audio and overlay segments retain the chosen time. Video copies include linked sound; copying sound copies only that sound. Native text-field clipboard behavior is preserved. |
| Show interval indices | **Show interval cuts** adds a separate sticky row numbered from **#1**, matching export order and the final partial segment. Dense cuts show spaced labels; every interval retains its full accessible index/time label. Zoom reveals more labels. |
| Timeline alignment and responsive rendering | On desktop/tablet, the timeline extends beneath the preview and the right settings panel to its right edge. Toolbar controls wrap. The ruler stays visible when scrolling through tracks. Narrow screens retain horizontally scrollable tracks and a bottom inspector. |

## Validation

Run `npm ci --prefix tests/video-studio`, `node scripts/build-video-studio.mjs`, `npm test --prefix tests/video-studio`, and `npm run test:firefox-ears --prefix tests/video-studio`. The Firefox runner uses `~/UAT-firefox/firefox/firefox` (override with `FIREFOX_BINARY`) and requires FFmpeg/FFprobe. Download the Linux binary from Mozilla if that path is missing:

```sh
mkdir -p ~/UAT-firefox
curl -fL 'https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=en-US' -o ~/UAT-firefox/firefox.tar.xz
tar -xJf ~/UAT-firefox/firefox.tar.xz -C ~/UAT-firefox
```

Firefox 156.0.1 passed all 50 headless acceptance checks. All 65 Node tests, 199 existing video browser checks and the help type check pass. This VM has no audio hardware, so live playback used a private PulseAudio null output under `~/UAT-firefox/audio/` via `PULSE_SERVER`; the test did not mock the playback engine. The runner closes its browser and terminates any remaining owned descendants in `finally`. The virtual audio server is also stopped after testing.

Firefox coverage includes native upload, media-library drop, independent ear drag and timing, track toggles, real keyboard copy/paste, Undo/Redo, refresh recovery, MP3 playback, and opening/decoupling in the standalone offline HTML through `file:`.

Rendered and inspected viewport sizes: 320×568, 390×844, 820×1180, 844×390, 1024×768, 1366×768, 1440×1000, 1920×1080, 2560×1080 and 3840×2160. Also tested 1440×1000 at 2× pixel density and 720×500 at 2× density, equivalent to a 1440×1000 display with 200% scaling. Assertions check toolbar collisions, controls escaping their bounds, page-width overflow, interval-label collisions, and timeline/settings alignment.

A stereo fixture contains 440 Hz only on the left and 880 Hz only on the right. After decoupling and delaying Right by 15 seconds, the preview graph and export PCM differ by less than 6×10⁻⁸. A real 17-second Firefox export is independently decoded with FFmpeg: the right ear is silent before 15 seconds and correctly audible afterward; neither source leaks into the wrong ear. FFprobe verifies all 255 video frames and stereo audio.

The existing video-only rendering, UI, advanced, controls, gestures, regression, touch and offline browser suites also pass. Node checks cover source routing, exact offset, copying after source deletion, repeated pastes, main insertion/gaps, locked edits, overlays, persistence and Undo/Redo. The help type check passes.

Evidence is in [`build/reports/video-studio/firefox-ears/`](../build/reports/video-studio/firefox-ears/): `report.json`, desktop/phone/high-density screenshots, `phone-ear-inspector.png`, `offline-ears.png`, and `ears-15-second-offset.webm`. This is implementation and automated/visual review evidence; no external human sign-off is claimed.
