# Video Studio UAT corrections — 2 October 2026

Scope: fix the six defects in the user's 1 October UAT report, preserve existing features and UI design, and retain the Linux Firefox preview correction in `811e06c`. No feature was added or removed. The stylesheet is unchanged; the hosted page changes only JavaScript cache versions. The offline page is regenerated from those sources.

## Reproduction and changes

The native Firefox baseline reproduced all six failures before the corrections. Evidence is in `build/reports/video-studio/uat-report/before/`.

| Finding | Correction | Verification |
| --- | --- | --- |
| VE01: inverted effect timing makes recovery fail | Resolve item/effect IDs against the current project; validate endpoints together. Inspector bounds follow the current paired endpoint, and committed values show the accepted range. Validate saves before replacing recovery data, retain the preceding valid snapshot, and narrowly repair finite inverted ranges before strict parsing. | Both endpoint orders with Enter, Tab and click-away; renderer intervals; undo/redo; actual downloaded project; Open in a fresh storage context, media relink and reload; invalid-save preservation; backup fallback; repaired legacy session; downloaded video effect timing. |
| VE02: source trim changes locked linked sound | A model operation validates the selected item, linked items, item/layer locks, source bounds and downstream ripple constraints before writing. A rejected trim leaves the live model untouched. | Video and sound selected in turn; opposite item/layer locked; both source endpoints; repeated rejections preserve project, history and autosave; unlocked trims, undo/redo and reload stay synchronized; a valid export remains downloadable after rejection. |
| VE03: edits after an error target discarded objects | Restore the project and rebuild inspector bindings after failure, preserving selection, expanded sections, relevant focus and the error. Timing and transform callbacks resolve stable IDs. | Repeated speed and source-trim rejections followed by X, width, opacity and effect edits without reselection; preview, history, received project file and reload agree. |
| VE04: zoom loses focus after the first key | Keep the timeline header and range input mounted while rebuilding timeline geometry; update existing buttons' availability. | Repeated arrows to both limits, Home/End, continuous pointer dragging, keyboard after drag, scroll position, selected item and unchanged playhead. |
| VE05: stale ready card downloads old output | Invalidation clears results, result cards, completion text and exported preview together without replacing the technical input. Each result carries its generating project/settings revision; retained stale callbacks cannot download old data or discard a newer valid export. | FPS, bitrate, codec, audio and content changes; actual downloads decoded independently; segmented ZIP extraction; cancel/retry; input focus and preview cleanup. |
| VE06: displayed numeric value disagrees with the model | Commit handling restores invalid drafts or displays the accepted value, with existing announcement feedback. Keep partial negative and decimal input intact. Read back model-normalized timing and speed values. | Width zero via all three commit methods; 53 numeric inspector/export fields, each with seven bounds/draft/finite-value cases; transition timing and Use maximum; reselection and strict project parsing. |

Source ranges shorter than one project frame are rejected. Invalid inspector effect endpoints clamp visibly to their current paired endpoint; the model rejects inverted or non-finite ranges. Shortening an item clips valid effect ranges to its new span. Recovery swaps only finite nonnegative inverted endpoints, then runs the unchanged strict parser. Other malformed data must pass strict validation or fall back to a previous valid snapshot.

The larger native-input sweep also reproduced decimal loss in the number input paired with an effect-strength slider (`1.5` became `3`). Its typing/commit handling is corrected. Exponent drafts are deferred until commit so typing a non-finite value such as `1e999` cannot temporarily expand an audio timeline to billions of seconds. The transition dialog reads its local accepted duration so changing another field cannot overwrite the displayed Use maximum value.

## Evidence

The fixture is a six-second 640 × 360 H.264 video with audio. Tests use stock Firefox 153.0 on Linux; the main UAT run uses a headed X11 session on Xvfb. Each runner closes its browser processes. Reports, screenshots and downloaded artifacts are local under `build/reports/video-studio/` and are excluded from Git.

- `uat-report/verified-headed/`: native input, storage recovery, received `.utvproj`, independent Open/relink, exported movie/ZIP files and FFprobe assertions.
- `uat-report/numeric-fields-fixed/numeric-field-coverage.json`: 53 numeric fields and 371 native edge-case paths; the same sweep is included in the final headed run.
- `uat-report/transition/`: transition duration, normalization and Use maximum interaction.
- `uat-ui-preservation/`: control and panel rectangles match `811e06c` exactly in 16 states (empty, uploaded video, expanded inspector and export at four desktop/mobile viewports), with before/after screenshots.
- `linux-preview-regression/uat-fixes.json`: 71 Linux Firefox checks, including displayed screenshot checks before canvas readback, small viewport changes, seek/play and bitmap fallback paths.
- Existing Firefox and Chromium regression reports cover editing, effects, transitions, gestures, playback and the offline page. Node checks include model/history/serialization, playback, media frames, archive integrity and offline source parity.

Downloaded files are inspected with FFprobe and FFmpeg, not accepted from a ready label. Tests check 640 × 360 pictures, exact frame counts at 24/25/30 fps, VP9/VP8 codec selection, stereo 48 kHz audio or its absence, edited picture position, and effect activity only inside its saved interval. All three numbered two-second ZIP members are extracted, CRC-checked and independently decoded. The current target bitrate is also checked at encoder configuration; actual compressed bitrate varies with content.

An earlier effect-export assertion expected a large mean-brightness increase from doubling already saturated test-pattern colours. The final check uses brightness `0.5` instead: independent decoded-frame ratios were about `0.995`, `0.499`, and `0.996` at 0, 2 and 4 seconds. Intermediate failed reports remain available for investigation.

Final results: **187/187 native UAT checks, 215/215 existing Firefox regressions, 56/56 preview, 50/50 stereo, 71/71 Linux-preview, 79/79 Node and 75/75 Chromium checks passed**. The 53-field native sweep includes 371 individual edge-case paths. All 16 UI geometry comparisons matched the baseline. Hosted/offline verification and the help/type check also passed.

## Limits

These checks do not reproduce the user's NVIDIA RTX 4090 D desktop. Passing the Linux/Xvfb tests establishes the tested behavior and retention of the software-canvas compatibility path, not a guarantee that the reported hardware-specific black screen cannot recur. Long/4K media and every possible browser/driver combination are outside this six-defect test matrix.

## Repeat

```sh
node scripts/build-video-studio.mjs
npm test --prefix tests/video-studio
FIREFOX_BINARY=/path/to/firefox npm run test:firefox-uat-report --prefix tests/video-studio
FIREFOX_BINARY=/path/to/firefox npm run test:firefox --prefix tests/video-studio
```

For headed UAT, provide a working display/audio environment and set `FIREFOX_HEADED=1`. `REPORT_NAME` selects an evidence directory; `CASES` optionally selects comma-separated case names. The default runs all cases, including storage, export preservation, numeric-field and transition regressions.
