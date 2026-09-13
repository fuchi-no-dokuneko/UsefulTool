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

Each substantial validated batch is committed using explicitly scoped paths. This document records the contract, not a claim that any batch is already complete.
