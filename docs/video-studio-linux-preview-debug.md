# Linux black-preview investigation

October 1, 2026. The reported symptom is that a video which worked in the previous release becomes dark after upload on an Ubuntu desktop, without a console error.

## Reproduction and scope

The September 24 build (`097bbeb`) and the reported current build (`f9f2556`) both displayed the same generated 1920×1080 H.264/AAC fixture in stock Firefox 156.0.1 on Ubuntu 24.04.4. Comparisons ran headlessly and in a headed Firefox window on a private Xvfb display. This VM has no physical GPU, and the user's video and desktop configuration were unavailable. These results do **not** establish the exact failure on that desktop.

Two application defects were reproduced:

1. **An unfinished bitmap conversion blocks the first preview.** With only `createImageBitmap` deliberately stalled, the real Firefox video decoder reached `readyState = 4`, but `Engine.prepare` waited indefinitely. After four seconds the engine was still seeking, the 407×229 canvas contained zero colored video pixels, and no browser error was emitted. Rendering the same decoder directly produced the expected picture. This fault-injection test reproduces the application's black-preview behavior; it is not evidence that the user's GPU stalled that API.
2. **Cached page markup collapses under the new grid layout.** The previous page nested its timeline inside the editor workspace. The new stylesheet expected a sibling timeline, while all asset URLs still used `studio-3`. Serving that old markup with current assets reduced the displayed video to 1×1 pixels, with a 2×2 backing canvas and no console error. The decoder remained healthy.

## Changes

- Draw decoded video directly while its first bitmap is pending or unavailable. Bitmap conversion is optional: wait at most 250 ms, then retire the stalled converter for that clip. Failed surface copies also use the native video path. Late bitmaps are discarded, and snapshots are closed on timeout/cancellation.
- Keep the existing bitmap optimization when it succeeds. A failed optional `VideoFrame` copy or timestamp sample cannot prevent native rendering.
- Support the previous nested timeline structure in the desktop grid and advance runtime asset URLs to `studio-4`.
- Preserve the preview canvas when its viewport is temporarily hidden instead of resizing it to 2×2 pixels.
- Rebuild the standalone offline page and its manifest.

## Verification

**Passed: 40 targeted Firefox checks, 56 full Firefox preview checks, 73 Node tests, and the help type check.** Both Firefox suites ran headed on the private Xvfb display, with no browser errors. Desktop and phone screenshots were inspected. All owned Firefox processes and the temporary Xvfb/PulseAudio helpers were stopped after testing.

The new `firefox-linux-preview.cjs` suite uses a real file-input upload and the real Firefox media decoder. It separates normal playback, cached markup, a deliberately stalled conversion, a rejected surface copy, and unavailable bitmap/VideoFrame APIs. It checks actual canvas pixels against a direct rendering of the decoder, seeking, moving playback pixels, and visible previews at 1920×1080, 1366×768, 1024×768, 390×844, and 2560×1440. It also checks hiding and restoring the preview viewport.

The existing preview UAT runs the online and standalone `file:` workflows through upload, Play/Pause, seeking, frame stepping, independent L/R tracks, track switches, export, and Play/Space after export. It includes a separate Firefox process with a missing audio socket to verify startup cancellation and silent preview recovery.

Run with FFmpeg and a working audio output:

```sh
node scripts/build-video-studio.mjs
npm test --prefix tests/video-studio
npm run check:help --prefix tests/video-studio
FIREFOX_HEADED=1 npm run test:firefox-linux-preview --prefix tests/video-studio
FIREFOX_HEADED=1 npm run test:firefox-preview --prefix tests/video-studio
```

`FIREFOX_HEADED=1` requires an X/Wayland display. Omit it for headless runs. `FIREFOX_BINARY` overrides `~/UAT-firefox/firefox/firefox`. `SCENARIOS=stalled` isolates the conversion test, and `REPORT_NAME` preserves a named report. The runners close Firefox in `finally` and terminate remaining owned descendants.

Local evidence under the ignored build directory: [failure before the fix](../build/reports/video-studio/linux-preview-regression/before-stalled.json), [regression report](../build/reports/video-studio/linux-preview-regression/firefox-regressions.json), [screenshots and old/current comparisons](../build/reports/video-studio/linux-preview-regression/), [complete preview UAT](../build/reports/video-studio/firefox-preview/report.json), and [process cleanup](../build/reports/video-studio/linux-preview-regression/cleanup.json).
