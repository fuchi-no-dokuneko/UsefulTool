# Timeline Video Studio implementation contract

The supplied September 13, 2026 specification and the user's appended answers govern this work. Changes are confined to the video editor, its tests, documentation, and its generated offline page. Other tools and pre-existing working-tree changes are outside this task.

## Accepted clarifications

- Feature numbers remain fixed. Features 5 and 10 and microphone narration are removed; the remaining 22 numbered features are in scope.
- Project JSON save/open/copy and 500 ms autosave remain. Reloading a tab must restore both edits and imported media. Browser restart recovery is not required. IndexedDB media are scoped by a tab session key; missing media can be relinked.
- Main video, Overlay 1, and Overlay 2 are the three video tracks. Ordinary overlaps do not create transitions. Default overlap contributions are equal and normalized. Users can change visibility and add interpolation points. Named Groovy presets retain their specified explicit alpha values.
- Transitions are created explicitly (including a user-requested AutoMovie). A main-track transition can decode a fourth video while both overlays are active.
- Audio concurrency has no artificial three-item cap. Each imported video creates a separate audio item with source/group identity. Picture and sound can be edited independently, including different speeds. Optional linked editing is available. Sound that ends early leaves silence unless Repeat is enabled.
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

## Implemented and checked

- Batch 1: unified project model, source identity, editing operations, 80-step history, session IndexedDB media cache, save/open and relinking. Commit `a78350b`.
- Batches 2–3: four-step interface, contextual controls, shared help registry, layered timeline and preview manipulation, frame compositor, stereo bus and limiter, titles, credits, music, images, transitions, effects, AutoMovie, interpolation curves, playback speed and real-time full/segmented export.
- The video-only browser suite currently covers 11 media/recovery checks, 28 pixel/audio checks and 25 complete interface checks. Sixteen pure model tests and the help-component type check pass. The 1363 × 936 region dimensions are measured in the browser. A real 1080p export is decoded and its stereo PCM checked, then a real page reload restores media and exact project objects before a second UI-driven export.
- Fixed concurrent media-seek waits: a decoder temporarily returning to metadata-only readiness after a seek must also wake on `canplay`/`seeked`, rather than wait for a second `loadeddata` event. This addresses a recovery/export race exposed by the browser suite.
- Video-only offline builder and standalone Cloudflare Workers asset configuration are prepared. Hosted and offline static verifiers pass. No deployment has been performed.
- Batch 4 continues with malformed-project, pointer/touch, responsive, AutoMovie, cancellation and offline-browser checks. The human usability protocol remains a separate unexecuted release gate.
