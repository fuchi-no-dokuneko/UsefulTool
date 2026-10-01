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

## Comparison with the September 24 release

The subsequent desktop report showed nonblack pixels in the decoder, cached bitmap and preview canvas, while the displayed picture depended on the DevTools divider position. This does not match the stalled-bitmap reproduction above. Browser graphics failures in `about:support` were not correlated to the application's failure and do not establish its cause. The original black-frame regression remains unresolved on the affected desktop.

The September 29 update (`16ee098`) left `renderer.js`, `media.js` and `engine.js` unchanged from September 24 (`097bbeb`). It changed the desktop grid, timeline placement and resize observers. Comparing those layouts reproduced a separate application defect: at a 1024-pixel-wide viewport, reducing the height from 600 to 599 pixels enlarged the portrait preview from 88 to 204 pixels. The old release stayed at 138 pixels. The short-window rule forced the editor shell to 600 pixels tall even though the two grid rows only needed 480 pixels.

The fix keeps the viewport-derived shell height and sets its minimum to the combined 480-pixel row minimum. The preview now stays at about 88 pixels across the breakpoint, while the page can scroll to the timeline. The stylesheet URL is advanced to `studio-5`; unchanged JavaScript assets retain `studio-4`. The offline page is rebuilt.

The Firefox regression suite now checks heights 601, 600, 599 and 598 at device scales 1 and 0.8. The new assertion failed on the previous stylesheet and passes after the change. All **42 targeted Firefox checks, 56 online/offline Firefox preview checks and 73 Node tests passed**. Both Firefox suites ran headed in Firefox 153.0 and covered import, playback, seeking, track controls, export and post-export playback. This establishes the layout correction, not a fix for the reported black frames.

For the affected desktop, [preview-layout-probe.js](../tests/video-studio/preview-layout-probe.js) is a console-only comparison. After importing a video, paste its contents into the page console. It restores the old desktop grid rules and timeline nesting without changing the project or browser preferences. `UT_LAYOUT.restore()` returns to the current layout; `UT_LAYOUT.old()` repeats the comparison. Refresh also removes it. Keep the viewport at least 760 CSS pixels wide.

The probe was compared against the actual September 24 and October 1 builds in headed Firefox 153.0 on Xvfb: **64 displayed-picture checks** across eight desktop sizes and two device scales. The restored preview geometry matched the old build, project JSON remained unchanged, and restoring the current layout recovered its original geometry. These checks capture screenshots before reading canvas pixels. One earlier capture was black while another Firefox UAT window was running on the same display; it is retained as inconclusive evidence. The final comparison ran alone with the tested page brought to the foreground. This VM has no NVIDIA GPU, so the probe still needs the affected-desktop result.

Local evidence: [breakpoint failure before the correction](../build/reports/video-studio/linux-preview-regression/before-short-viewport.json), [checks after the correction](../build/reports/video-studio/linux-preview-regression/after-short-viewport.json), and [baseline/layout comparison](../build/reports/video-studio/layout-comparison/report.json).
