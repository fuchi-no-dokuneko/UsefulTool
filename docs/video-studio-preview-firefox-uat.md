# Firefox preview regression UAT

September 29, 2026. Tested with the downloaded stock Firefox 156.0.1 at `~/UAT-firefox/firefox/firefox`, running headlessly. This follow-up was prompted by a report that the video preview appeared dead.

## Reproduced defects and fixes

| Reproduction | Observed failure | Fix |
| --- | --- | --- |
| Import a video, export it, then press the timeline Play button or Space. | The timeline and hidden canvas advanced while the visible exported video remained paused. | Starting timeline playback pauses/hides the exported player and restores the live canvas. Seeking uses the same preview switch. |
| Start playback without an available audio output. | Firefox left `AudioContext.resume()` pending indefinitely; the picture stayed at its first frame with “Preparing playback…”. | Audio startup is bounded and cancellable. If output is unavailable, the picture plays with an explicit “Audio unavailable · silent preview” status. The next Play retries audio. Recording does not silently drop audio on this error. |
| Toggle a video or sound track while playing. | Every On/Off click forcibly stopped the whole movie. | Track switches preserve running playback. While paused, switching a track refreshes the frame at the current playhead. |

## Verification

- **56 Firefox preview checks passed:** real file upload, changing visible canvas pixels and playhead, live audio, Pause, seeking, frame stepping, independent ears, video/sound track switches during playback, UI export, and Play/Space after export. The full workflow runs both over HTTP and from the standalone offline HTML through `file:`. Playback also runs at 1440×900, 3840×2160, 820×1180, 320×568, and 720×500 with 2× pixel density (200% display scaling). A separate Firefox process with a nonexistent audio socket verifies the actual audio-startup failure and cancellation without mocking playback.
- **50 Firefox stereo-editing checks passed:** L/R offsets, drag, real Ctrl+C/Ctrl+V, Undo/Redo, persistence, MP3 playback, interval labels and layout. FFmpeg independently verifies the encoded 15-second ear offset, and FFprobe verifies frame count and stereo channels.
- **215 existing browser checks passed in Firefox:** core 22, rendering 33, UI 25, advanced 35, controls 54, gestures 20, regressions 21, offline 5. The full 1080p UI export exceeded the old 20-second test deadline while continuing to encode. Its completion wait now allows 120 seconds; export assertions remain intact, and the complete workflow passes.
- **68 Node tests and the help type check passed.** New engine cases cover unavailable audio, retry, cancellation, and refusing silent recording after audio startup failure.

No application errors occurred in the dedicated preview or stereo-editing UAT. Desktop, phone and post-export screenshots were inspected. Both Firefox runners close their browsers in `finally` and terminate remaining owned descendants. The temporary PulseAudio null output used for this VM's normal audio checks was also stopped after testing.

Run after `npm ci --prefix tests/video-studio` with FFmpeg/FFprobe installed and a working audio output:

```sh
node scripts/build-video-studio.mjs
npm test --prefix tests/video-studio
npm run check:help --prefix tests/video-studio
npm run test:firefox-preview --prefix tests/video-studio
npm run test:firefox-ears --prefix tests/video-studio
npm run test:firefox --prefix tests/video-studio
```

Set `FIREFOX_BINARY` to override the downloaded Firefox path. On this VM, the normal audio tests used `PULSE_SERVER=unix:/home/vmadmin/UAT-firefox/audio/native` with the private null output running. The preview runner overrides that socket only for its unavailable-audio test.

Local evidence (generated under the ignored build directory): [preview report](../build/reports/video-studio/firefox-preview/report.json), [preview screenshots](../build/reports/video-studio/firefox-preview/), [stereo report](../build/reports/video-studio/firefox-ears/report.json), and [existing suite reports](../build/reports/video-studio/firefox-regressions/).
