# Video Studio follow-up UAT release gate

Status: **PASS**

The September 14 UAT supersedes the earlier independent-by-default picture/sound behavior and unlimited audio concurrency. Features 5 and 10 remain removed; retained scope is 1–4, 6–9 and 11–24.

| Requirement | Required evidence | Status |
| --- | --- | --- |
| Standard 1080p exports use project time and deliver every frame | Actual 113.3s WebM: about 3,399 frames, 1920×1080, VP9, Opus stereo, 30fps timestamps, synchronized duration; FFprobe plus decoded content | PASS |
| All video insertion paths initialize linked original sound | Batch import; shared linkId/source range/time/rate; linked Cut, Speed, Trim, Duplicate; explicit unlink remains available | PASS |
| No more than three simultaneous audio sources | One model rule used by placement, preview and export; four-source case; visible explanation and correction action | PASS |
| Each committed field edit has its own Undo entry | Enter, change and blur; Trim then Duplicate must undo and redo separately | PASS |
| Timeline hit targets remain inside its viewport and behind fixed labels | Pointer hit-testing after horizontal and vertical scroll; Main video settings opens layer settings | PASS |
| Seek keeps transport responsive and communicates loading | Long-source seek followed immediately by Play; cancellation and repeated seeks; actual pointer interaction | PASS |
| Project persistence preserves the complete edit | Thirteen assets and all items, times, layer order, effects, parameters and linkId compared after save/open and refresh recovery | PASS |
| Previously passed features remain intact | Groovy fixed values, blur ranges, MP3 speed/pitch/stereo, −1dB limiter, tooltips, accessibility, responsive layout and offline use | PASS |

The completed-file and browser checks pass. The engineering release gate is PASS. The five-person novice study remains recorded separately; no recruitment is requested.

## Completed-file evidence

The report did not include the original media binaries. The reproducible release fixture contains thirteen matching media types: three short H.264/AAC clips, a 90-second 1280×720 H.264/AAC clip, three MP3 files and six image formats. Its project has thirteen assets, nineteen timeline items and ten layers. Save/open and same-session refresh recovery compare the complete serialized edit, including links, order, effects and parameters.

The release command passes **37 browser/download checks** and **7 independent exported-file checks**. The retained `build/reports/video-studio/release-standard.webm` contains:

- **3,399 VP9 frames**, 1920×1080, 30/1 fps, with every frame on the 1/30-second project clock.
- **Opus stereo at 48kHz**, 113.32 seconds reported by FFprobe for the 113.3-second project, 60,956,226 bytes.
- The 2,550 decoded long-source frames contain 2,549 consecutive changes and no repeated slideshow frames.
- Eight decoded reference frames cover Crossfade, overlays, blur, text and credits. Mean RGB error is 1.64–2.92%, below the 4% encoded-frame threshold.
- The final repeating 1.5× MP3 remains audible in both channels with its 660Hz pitch preserved.

SHA-256: `24fd6661683284b7e61c0b2762cc2a1a62da47a0c2b3185c92e16fc801ae718d`. Two complete exports produced identical bytes while processing took approximately 217 and 224 seconds. Processing speed does not reduce the encoded frame rate. The actual Download video file matches the independently decoded artifact.

The full release run measured **43.8ms** for Play after a long-source seek and **0.5ms** for Pause. Numeric-edit, duplicate, linked cut/speed/trim, four-source correction, scrolled hit-target and project-recovery checks pass.

## Regression evidence

The established browser suite passes **218/218**, including a resized-source crop check. The model/playback/frame-resource/static suite passes **38/38**, and help typing passes. Long previews pass **25/25**; detailed timing and sampling corrections are documented in [the playback follow-up](video-studio-playback-fix.md#september-14-follow-up). Generated reports and media are local artifacts and are not served by the site.

The exact scoped source archive also passes **347/347 shared-site checks** with **95.09% maintained-source line coverage** (11,522/12,117). Its fifteen offline pages, manifest and codec bundle reproduce byte-for-byte. The current worktree, including the existing additional tool page, passes **356/356 checks**, **95.06% coverage** (11,757/12,368), and all sixteen hosted/offline page checks. The 95% coverage threshold is unchanged.

Publication targets the existing `usefultool` Pages project through its documented direct-deployment procedure. The isolated static artifact preserves the current worktree's other tools. Final publication verification compares live bytes on both the stable and deployment-specific URLs and exercises hosted import, playback and fixed-frame export.
