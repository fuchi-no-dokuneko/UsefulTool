# Timeline Video Studio acceptance

Scope: the 22 retained feature numbers in the approved specification, appended clarifications and latest September 14 UAT. That UAT requires linked-by-default original sound and a maximum of three simultaneous audio sources. Features 5 and 10 and microphone narration are removed. The application UI is English. Tests run only local media; no uploads are required.

## Automated evidence

Run `npm test --prefix tests/video-studio`, `npm run --prefix tests/video-studio check:help`, and `npm run --prefix tests/video-studio test:browser` after `node scripts/build-video-studio.mjs`. JSON results and screenshots are generated under `build/reports/video-studio/`.

The latest follow-up also requires `npm run --prefix tests/video-studio test:long-playback` and `npm run --prefix tests/video-studio test:release`. The latter checks the complete thirteen-asset workflow, actual download, 3,399 encoded frames, their timestamps, decoded motion and composited pictures, and stereo pitch-preserving music. See [the current release gate](video-studio-release-gate.md); the September 13 counts below describe the initial run.

The September 13, 2026 Chromium run passed **197/197 video browser checks**, **21/21 model/static checks** and the required-help type check. Browser suites comprise media/recovery (22), rendering/audio (32), complete interface (25), advanced workflows (33), controls (54), gestures/relinking (20), coarse-pointer touch emulation (5), and offline operation (6). Touch checks use browser device emulation; they are not a physical-device study. The standalone Cloudflare configuration also passed Wrangler 4.131.1 `deploy --dry-run` without publishing anything.

| Feature | Implemented behavior | Main automated evidence |
| --- | --- | --- |
| 1 | Versioned `.utvproj`, open/save/copy, 500 ms tab-session autosave, cached media and fingerprint relinking | Model round trip; core IndexedDB and relink cases; UI real reload; controls save/open/new; offline file reload |
| 2 | Title, caption and subtitle presets, typography, time ranges, direct positioning and eight resize handles | UI text creation; advanced pointer/keyboard editing; controls typography; render timed text |
| 3 | Rolling, static and paged credits, structured/reordered groups, Keep speed and Fit duration | Model timing; advanced three templates; controls groups and appearance; render scrolling |
| 4 | Independent music placement, repeat/whole-movie, volume, mute, fades, split and copy | Model independent/whole-movie audio; UI MP3; controls sound controls |
| 6 | PNG/JPG/JPEG/BMP/GIF/WebP still images, thumbnails, dimensions, transparency, 5-second main and 3-second overlay | Core actual decoders; model duration defaults; UI PNG; controls image-only movie and library-only refresh |
| 7 | Six explicitly applied transitions with direction, easing, bounded duration and animated cards | Model adjacent limits; controls all six cards; render endpoints, midpoint, deterministic dissolve and source alpha/fades |
| 8 | Ordered brightness, contrast, saturation, grayscale, vintage and hue effects with editable ranges | Controls gallery/stack/copy/reorder/toggle; render effect ordering |
| 9 | Five AutoMovie templates using local scene differences and audio peak measurements, editable result, Undo | Core scene analysis; advanced all five drafts and wizard/Undo |
| 11 | Three video tracks, timing/trim/vertical movement, explicit main transition allowance for a fourth decoder | Model track/time rules; UI three overlays; advanced direct manipulation; controls conflict recovery |
| 12 | Equal default contributions, explicit alpha presets and visibility interpolation curves | Render exact equal and alpha pixels; controls curve points; UI four-click Groovy |
| 13 | Shared timeline item/layer model, selection, visibility, lock, mute, solo and layer order | Model all-kind round trip; advanced lock; gestures locked ripple/presets; controls layer headers and independent duplicates |
| 14 | Gaussian, Box, Motion and Radial rectangular blur, local range and target | Render four region algorithms, opacity/fades and outside preservation; advanced rectangle drag/resize; controls parameters/target |
| 15 | At most three simultaneous original sounds/music through stereo bus and −1 dB sample limiter | Model boundary/mute/solo/locked correction cases; release four-source warning, correction, Undo and playback/export refusal; render overloaded signal; decoded stereo output |
| 16 | Separate original sound with shared source/linkId identity, timing and rate; linked editing enabled on every import path | Release batch linked Cut/Speed/Trim/Duplicate and saved/recovered linkId; model explicit unlink; controls independent gains |
| 17 | Independent MP3, 0.25×–4× speed, four shortcuts, pitch preservation and repeat/silence | Model time mapping; UI 1.5× MP3; advanced actual 2× export retains a 440 Hz tone |
| 18 | Guided import, sequential videos, Videos/Music/Images categories, progress and named errors | Core actual file/error cases; UI sequential import and Arrange; controls native file inputs and image-only start |
| 19 | Main/Things on top/Sound groups, Add here, 12px handles, Cut here, linked waveform badges, Undo toast and conflict recovery | UI cut; advanced drag/Undo; controls insert, keyboard history and conflict fix |
| 20 | Overlay selection, three presets, editable visibility/range and clear occupied-track message | UI Groovy in four major clicks; controls explicit overlap and three-video limit |
| 21 | On-top cards, shared selection across preview/timeline/inspector, local blur, layer ordering and locks | UI mixed elements; advanced pointer manipulation; controls typography/filter/order |
| 22 | Independent original sound and MP3, sound balance, stereo channels, repeat, speed and optional unlinking | Model audio mapping; controls all audio parameters; advanced measured pitch; UI mixed export |
| 23 | Current-object summary, four-step actions, responsive transport/loading state, recovery, fixed-frame quality presets, progress/cancel, preview/download and retained segment export | Release actual long Seek/Play and 113.3s encoded/downloaded movie; UI complete 1080p flow and reload; advanced cancellation/segments; controls project/export settings; offline downloadable file |
| 24 | Central help registry, required help factory, hover/focus/Escape, disabled explanation, touch info and one body portal | Static factory guard and JSDoc type check; UI focus/disabled/registry checks; advanced timing and geometry; coarse-pointer touch targets and explanation |

The shared-site regression passes **334/334 assertions**, with **95.62% application line coverage** (11,124/11,633 lines) against the unchanged 95% gate. This run includes the pre-existing working-tree tools as well as Video Studio. An isolated copy of exactly the staged files, excluding unrelated uncommitted tools, also passes 325/325 assertions and the 95% gate. Its 15 offline pages rebuild byte-for-byte; hosted and offline verifiers pass.

The 1363 × 936 browser test measures the 64px top bar, 56px stepper, 248px/823px/292px columns, 454px preview and 362px timeline. Responsive checks cover 900px and 390px widths. Rendering tests compare the shared uncompressed frame path; codec output is checked separately for dimensions, finite duration and audible stereo. Lossy encoded pixels are not claimed to be byte-identical to the uncompressed canvas.

## Retained novice study protocol — not executed

The user requested keeping this protocol without organizing participants. Automated tests do not establish its completion rate or completion time.

Recruit five people who have never used video-editing software when a human release decision is needed. Give each the same three video files, a transparent PNG and an MP3. Provide only the application's text, help tooltips and built-in guide. Start timing on the empty editor; stop when the exported file has been downloaded.

1. Import three videos and play the automatically arranged movie.
2. Shorten the second video and use **Cut here** once.
3. Create **Groovy triple** within five major clicks.
4. Set Overlay 1 to 55% and Overlay 2 to 35%.
5. Add text, the transparent PNG and Gaussian blur with different time ranges; position/resize the blur in the preview.
6. Add the MP3 with **Play for whole movie**, mixed with original video sound.
7. Set the MP3 to 1.5×. Set one initially linked picture/sound pair to 2×; also demonstrate that separating sound permits a different audio speed. Resolve any overlapping-sound warning so at most three sounds play together.
8. Export **Standard · 1080p** and download the finished movie.

| Participant | All tasks completed | Time | Groovy clicks | Blocking errors | Unrecovered mistakes | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Pending | — | — | — | — | — |
| 2 | Pending | — | — | — | — | — |
| 3 | Pending | — | — | — | — | — |
| 4 | Pending | — | — | — | — | — |
| 5 | Pending | — | — | — | — | — |

Human release thresholds remain: at least 4/5 complete every task; median time at most eight minutes; no blocking errors; at most one unrecovered mistake per person. The study is pending, with no participants recruited or contacted.

## Long-video playback regression

The follow-up playback fix adds a separate 90-second fixture and complete 60-second timing checks. See [the playback fix record](video-studio-playback-fix.md) for the reproduction, per-criterion evidence and command. Short-video success alone does not establish long-preview stability.

## Practical browser limits

Export uses fixed project timestamps and waits for every frame to be encoded. Formats depend on WebCodecs video and audio encoder support; preview depends on the browser's media decoder. Automated execution uses desktop Chromium, including responsive layouts and the `file:` origin. Other browser engines and physical phones are not represented as tested devices. Full PCM waveform decoding is omitted during import for files over 128 MiB; export decodes required audio and therefore needs memory proportional to the source sound duration. GIF/WebP imports use a stable still frame. The app retains 1 GiB media, 25 MiB image, 33,177,600-pixel output, 80-edit history and 60-segment limits. Missing/evicted cache files require relinking; browser restart recovery is not guaranteed.
