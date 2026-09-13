# Long-video preview playback fix

The report in the supplied `Long-video Preview Playback Stall` task defines this regression. The fix is confined to Video Studio, its generated offline artifact and its tests.

## What changed

Playback uses a monotonic clock and a synchronous animation callback. New media are prepared ahead of their timeline start; seek/play promises are tracked separately and cannot suspend the playhead or other playing tracks. Pause cancels preparation, and a newer seek can replace an abandoned target as soon as metadata is available, without first waiting for obsolete decoded pixels.

Full-source music repeats through the browser decoder. Trimmed repeats retain their own source bounds. Small decoder-clock differences are corrected gradually with pitch preservation, instead of repeatedly resetting a media element. Audio mixing no longer overwrites that timing correction on every frame.

The transport publishes the current clock after composition, so a late frame does not leave the displayed position behind. Preview resolution follows its displayed size, and the compositor writes directly to its output canvas to avoid a redundant full-frame copy. Export dimensions and the shared effects/composition path are retained. Asset query versions advance to `studio-2` so cached clients receive the corrected scripts on the next deployment.

## Reproduction and evidence

Before the change, a generated long project exposed a stopped background-music element being sought repeatedly: 387 audio seeks in the 60-second layered run, with paused audio in 52 of its 60 samples. The separate 45-second run produced 311 seeks and paused audio in 41 samples. The single main video ran steadily on this machine; that observation alone did not clear the reported blocker.

A controlled 1,200ms incoming-decoder delay reproduces a whole one-second interval with zero playhead progress in the previous engine (`f8045ae`). A delayed-composition case also reproduces an outdated transport clock. Those regression cases pass with the new engine, along with cancellation, continuous music and trimmed-repeat bounds.

The real browser checks run at **1363 × 936** in desktop Chromium with a **90-second, 1280 × 720, 30 fps H.264/AAC** file containing generated visible timecode. The provided report did not include its original binary; the reproducible generated fixture is 26.1 MiB, compared with the report's 25.9 MiB. The same generated file is used before and after the fix. FFprobe metadata and SHA-256 values are saved in `build/reports/video-studio/long-fixtures/manifest.json`.

The 101.3-second mixed project contains an explicit Crossfade, two video overlays, text, a local Gaussian blur, rolling credits, associated original sound and a repeating MP3. Runs include 60 seconds from position 12 in both the main-only and layered projects, then 45 seconds from position 45 in the layered project.

Timing results are recorded in `build/reports/video-studio/long-playback.json`, including every one-second sample, source positions, video-frame presentation timestamps, audio levels, decoder events and composition timings. `requestVideoFrameCallback` provides actual presented frame timestamps rather than relying only on the video's advancing clock; see the [Chrome team's API explanation](https://web.dev/articles/requestvideoframecallback-rvfc). The music check reads the actual stereo graph after the track gain, separately from original sound.

Each observation schedules its next sample one second later. The earlier absolute catch-up schedule produced a false failure after a delayed timer: 0.878 seconds of media progress over only 0.879 real seconds. That report is retained locally as `long-playback-sampling-catchup.json`. The corrected sampler records actual elapsed intervals and keeps the original 0.9–1.1-second progress and 100ms drift/synchronization limits.

## Verified results

Desktop Chromium 152 passed all **22 long-playback checks** on the final code. Values below come from the retained report; elapsed time includes ordinary timer scheduling variation.

| Scenario | Samples / elapsed | Media progress per sample | Total drift | Start / pause | Max source / presented-frame error |
| --- | --- | --- | --- | --- | --- |
| main video from 12s | 60 / 59.993s | 0.984–1.011s | -4.8ms | 9.1 / 1.0ms | 17.2 / 51.0ms |
| layered movie from 12s | 60 / 60.502s | 0.990–1.060s | -3.6ms | 21.1 / 1.2ms | 51.4 / 75.3ms |
| layered movie from 45s | 45 / 45.055s | 0.987–1.026s | -11.5ms | 26.9 / 1.3ms | 48.3 / 76.4ms |

The Node checks passed **27/27**, including six targeted playback regressions; help typing passed. The established browser suite passed **197/197**, including decoded 1080p export, stereo PCM, pitch-preserving speed, responsive controls and downloaded offline-file import/recovery/export.

## Required gates

| Requirement | Verification |
| --- | --- |
| Continuous 60-second playback of a 90-second asset | Two complete 60-second browser runs using the verified long fixture |
| Every one-second sample advances 0.9–1.1 media seconds | All 165 one-second intervals are checked individually |
| Total drift below 100ms over 60 seconds | Both 60-second runs compare movie progress with real elapsed time |
| Playback start below 300ms | Measured from Play to the first advancing rendered-frame callback |
| Pause below 100ms | Measured through the actual control, then verifies fixed time and paused decoders |
| Audio, video and playhead stay aligned | Every sample checks source clocks and presented video-frame timestamps within 100ms |
| Overlays, blur, credits and repeating music | Active in the mixed project; music output must remain audible after every repeat |

## Commands

```sh
node scripts/build-video-studio.mjs
npm test --prefix tests/video-studio
npm run --prefix tests/video-studio check:help
npm run --prefix tests/video-studio test:browser
npm run --prefix tests/video-studio test:long-playback
```

The long command generates and validates its local fixtures with FFmpeg/FFprobe; media are not checked into Git. The dedicated Video Studio CI runs this command after the other browser checks. Reports include JSON and screenshots. No media are uploaded and no deployment is performed.

An isolated archive of the staged source also passed **325/325 shared-site checks** with **95.56% maintained-source line coverage** (11,024/11,536), exceeding the existing 95% gate. Rebuilding that archive reproduced all 15 offline artifacts and their manifest byte-for-byte; hosted and offline verifiers passed. This check excludes unrelated uncommitted workspace changes. Its report is retained in `build/reports/video-studio/playback-staged-site/`. The original five-person novice study remains separate and unexecuted as requested.
