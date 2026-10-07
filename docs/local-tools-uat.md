# Local compression, PDF page selection and sticker migration

Implemented for the October 7, 2026 request after the user confirmed that the earlier black-preview issue was fixed. Video Studio's application scripts, styles, HTML and standalone offline page are unchanged from `0f412f8`.

## Delivered behavior

- **PDF Merge:** each source has a typed page range and paged, selectable thumbnails. `2-14` selects those thirteen pages; descending ranges and repeats retain their existing meaning. File reordering preserves the selection. The selected-page preview and downloaded PDF use the same order. A built-PDF preview allows another download of the same result.
- **Image Compressor:** JPEG, PNG and still WebP inputs; KiB/MiB limits; original/result previews. The search measures encoded bytes and compares decoded candidates at common dimensions. Auto keeps transparency and considers suitable formats. PNG uses a dimension search; JPEG/WebP consider quality and dimensions. The best measured candidate under the limit is offered. An already fitting original is retained byte for byte. Unreachable limits are reported without offering an oversized result as a success.
- **PDF Compressor:** optimizes supported RGB/grayscale image streams first while preserving PDF page objects, text, vectors and links. Alpha masks are preserved. Unsupported colour mappings and image representations remain intact. If that cannot meet the budget, the result is explicitly labelled above the limit. The optional page-image fallback runs only after the user enables it and clearly explains that text, links, forms and accessibility structure will be flattened in that copy.
- **Lightweight Video Compressor:** a separate tool with resolution, FPS and encoding controls. Available browser encoders are detected. It retains the full duration and audio tracks, rejects conversions that would discard a track, and checks output track counts and duration before offering a download. The result reports its actual size; conversion is not guaranteed to shrink every input.
- **Sticker Builder:** migrates the supplied HTML to the shared site header, theme and responsive layout. It retains the eleven initial layers, space/ring/text editing, colours, glow, spacing, text rotation, preview backgrounds/scale, layer ordering/removal and transparent PNG export. The original source is retained in `tests/new-tools/fixtures/sticker-original.html`.

All five workflows run locally. The four new pages and enhanced merge page have standalone offline HTML. PDF preview workers and the separate video conversion library are bundled locally; no runtime CDN is used.

## Actual Firefox acceptance

`tests/new-tools/uat.cjs` passed **75/75 checks** in headed Firefox 153 on Linux, with zero unhandled browser errors. It uses native file input uploads and downloaded files, including a separate `file:` context for every offline tool. Five layouts were also checked at a 390-pixel viewport.

| Workflow | Observed result |
| --- | --- |
| Image compression | A 1200×800 noisy fixture produced a 34,894-byte WebP under the 35,840-byte limit. FFmpeg decoded the downloaded file. Auto retained alpha; an already fitting original remained byte-identical. |
| PDF merge | First source `2-14` and second source `3-2,2` produced exactly sixteen pages in that order. Text extraction independently checked every output page. Checkbox edits invalidated the old output; invalid ranges disabled merging. |
| PDF image compression | A two-page image PDF produced 183,832 bytes under a 184,320-byte limit. Page count, selectable text, link annotation and transparency over a blue page background remained intact. |
| PDF fallback | The explicitly enabled page-image fallback produced 8,164 bytes under an 8,192-byte limit and labelled the flattened copy. Cancellation left no stale download. |
| Video compression | A 4-second 640×360 stereo fixture produced 320×180 VP9 at 15 FPS, 151,093 bytes versus 1,346,274 bytes originally. FFprobe verified codec, dimensions, FPS, two audio channels and complete duration; FFmpeg decoded the result. Cancel/retry produced VP8 at 24 FPS. |
| Sticker migration | Independently decoded RGBA pixels matched the supplied original exactly. Export remained transparent even with a white preview background. Existing layer editing, ordering and deletion passed. |

Firefox evidence is generated under `build/reports/new-tools/`: the `uat-image-merge-pdf-video-sticker-responsive-offline.json` report, screenshots, generated fixtures and actual downloads. Tests use generated media, not private user files. Codec support and output byte counts can vary across browser/platform versions; the UI checks the actual result.

## Reproduction and regression checks

```sh
npm ci --prefix tests/video-studio
node scripts/build-video-compressor.mjs
node scripts/build-offline.mjs
node scripts/verify-hosted.mjs
node scripts/verify-offline.mjs
FIREFOX_BINARY=/path/to/firefox FIREFOX_HEADED=1 node tests/new-tools/uat.cjs
UAT_TIMEOUT_MS=240000 node scripts/run-browser-uat.mjs
NODE_V8_COVERAGE=build/reports/browser-uat/node node --test tests/video-studio/*.test.cjs tests/new-tools/*.test.cjs
node scripts/merge-node-coverage.mjs
node scripts/verify-coverage.mjs
```

Headed Linux acceptance needs a display and audio output; Xvfb/PulseAudio were used locally. FFmpeg and FFprobe must be installed. Omit `FIREFOX_HEADED=1` for headless runs. `CASES=image,merge,pdf,video,sticker,responsive,offline` selects the cases explicitly.

The Node suites passed **82/82 tests**, including independent PNG/TIFF PDF predictor fixtures and rejection of unsupported/truncated streams. The maintained-source browser suite also checks the new workflows, impossible size limits, corrupt files, explicit raster fallback, JPEG-in-PDF handling, unsupported PDF colour mappings, and an injected unavailable-audio conversion. That injected case verifies refusal to lose sound; the downloaded-video checks above use real encoders.

The final hosted suite passed **556/556 checks**. Combined measured browser/Node coverage is **15,328 / 16,093 lines (95.25%)**, with all maintained source files included; the existing **95% gate passes**. Browser branch coverage is 71.07%. The unchanged `0f412f8` checkout measured 94.45% in a separate worktree. The threshold and source exclusions were not relaxed.

The existing Video Studio browser coverage now also exercises Copy/Paste, project-menu Undo/Redo, independent L/R tracks, preview mute, track enable/disable and media tabs. Transition chooser tests wait for actual painted previews. The browser runner brings the test page forward when download/preview tabs hide it, avoiding background animation suspension.

The conversion bundle rebuild is byte-identical. Two successive offline builds produce identical manifests, and all twenty hosted and offline pages pass validation within the existing 2 MiB standalone-page limit. Generated build reports are intentionally ignored by Git.
