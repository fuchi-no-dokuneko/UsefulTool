# Timeline Video Studio implementation contract

The supplied September 13, 2026 specification, appended answers and September 14 follow-up UAT govern this work. The latest UAT supersedes earlier answers where they conflict: imported picture/sound edits start linked, and at most three audio sources may play simultaneously. Changes are confined to the video editor, its tests, documentation, delivery configuration and generated offline page. Other tools and pre-existing working-tree changes are outside this task.

## Accepted clarifications

- Feature numbers remain fixed. Features 5 and 10 and microphone narration are removed; the remaining 22 numbered features are in scope.
- Project JSON save/open/copy and 500 ms autosave remain. Reloading a tab must restore both edits and imported media. Browser restart recovery is not required. IndexedDB media are scoped by a tab session key; missing media can be relinked.
- Main video, Overlay 1, and Overlay 2 are the three video tracks. Ordinary overlaps do not create transitions. Default overlap contributions are equal and normalized. Users can change visibility and add interpolation points. Named Groovy presets retain their specified explicit alpha values.
- Transitions are created explicitly (including a user-requested AutoMovie). A main-track transition can decode a fourth video while both overlays are active.
- All simultaneous original sounds and music count toward one three-source limit. Conflicting placements remain editable, with a visible explanation and mute/move/trim correction actions; preview and export require the conflict to be resolved. Each imported video creates a separate, initially linked audio item with shared `linkId`, source range, timing and speed. Explicit unlinking permits independent picture/sound edits and speeds. Sound that ends early leaves silence unless Repeat is enabled.
- Blur has a directly editable rectangular region in the preview, plus time and layer targets.
- React is not required. Keep a static browser application suitable for Cloudflare hosting and the self-contained offline page.
- Main-track images last 5 seconds; image overlays last 3 seconds. Image-only movies can enter Arrange.
- The five-person novice usability protocol is retained as a human release gate. The user explicitly does not request recruitment or execution of that study. Automated results must not be represented as human usability results.

## Delivery batches

1. Unified model, editing operations, media identity, session persistence and model tests.
2. Four-step interface, accessible help, multi-layer timeline, direct manipulation and project management.
3. Shared frame/audio engines, effects, transitions, credits, AutoMovie and export.
4. Browser acceptance, offline packaging, compatibility checks and requirement audit.

Each substantial validated batch is committed using explicitly scoped paths.

## Follow-up UAT contract

Export advances through project time in fixed `1 / fps` steps, waits for complete decoded source frames, invokes the shared compositor, and submits every output frame with an explicit timestamp. WebCodecs encoding uses backpressure and quality latency mode; it cannot silently drop frames to keep up with wall time. Stereo audio uses the shared source mapping, gain and limiter rules, with offline pitch-preserving speed processing. Codec support is probed before offering a format.

The release command exercises thirteen local assets and an actual 113.3-second Standard 1080p export, then verifies all 3,399 frames with FFprobe and decoded pixels/audio with FFmpeg. It also tests linked batch edits, independent Undo boundaries, audio-limit correction, scrolled pointer targets, immediate Play after Seek, complete recovery and the downloaded file. Current evidence and status live in [the release gate](video-studio-release-gate.md).

## Initial implementation evidence — September 13

- Batch 1: unified project model, source identity, editing operations, 80-step history, session IndexedDB media cache, save/open and relinking. Commit `a78350b`.
- Batches 2–3: four-step interface, contextual controls, shared help registry, layered timeline and preview manipulation, frame compositor, stereo bus and limiter, titles, credits, music, images, transitions, effects, AutoMovie, interpolation curves, playback speed and real-time full/segmented export. Commit `aaf54c7`.
- Final batch: malformed-project guards, independent layer duplication, locked-edit protection, exact transition/filter alpha, cancellation, selection/history preservation, decoder seek/disposal races and library-only recovery. All retained requirements are mapped to checks in [the acceptance record](video-studio-acceptance.md).
- Video-specific browser acceptance passes 197 checks: 22 media/recovery, 32 rendering/audio, 25 complete interface, 33 advanced workflow, 54 controls, 20 gestures/relinking, five emulated touch and six offline checks. Nineteen model tests, two static guards and the help-component type check pass.
- The 1363 × 936 region dimensions are measured in the browser. A real 1080p export is decoded and its stereo PCM checked. An actual page reload restores media and exact project objects before a second UI-driven export. A 2× audio export retains a measured 440 Hz pitch. The downloaded HTML is also exercised through the `file:` protocol, including import, refresh recovery and export.
- Shared-site regression includes the video suites and retains the 95% maintained-source coverage gate. Its reader now includes the editor's nested source directory. Existing other-tool source and pre-existing changes remain outside these commits.
- The dedicated offline builder and standalone Cloudflare Workers asset configuration pass local checks. Wrangler 4.131.1 `deploy --dry-run` succeeds; no deployment is performed.
- The five-person novice study remains documented and unexecuted, as requested. Browser-engine and media-size limits are recorded without claiming unperformed human or device validation.
