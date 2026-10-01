# Development log

## Standing user constraints — Video Studio (2026-10-01)

These requirements persist for future work unless the user explicitly changes them:

- Preserve every existing feature and its behavior. Do not remove or redesign features to work around a bug.
- Preserve the current UI design, layout, controls, and workflows.
- Until the Linux Firefox black-screen preview bug is resolved, add no features. Changes must address that bug or verify that the fix preserves existing behavior.
- Do not report the affected-desktop bug as fixed based only on tests on another machine. Distinguish reproduced failures, tested corrections, and remaining uncertainty.

User instruction: “DO NOT REMOVE OR EDIT ANY CURRENT FEATURE AND DO NOT LET THE UI DESIGB CHANGE> ONLY FIX BUG> MARK IN YOU dev-log for ever !”

User instruction: “until you fix the vlack screen dont add feature”

## Black-preview correction under test — 2026-10-01

Request software-backed canvas surfaces before their first context creation on desktop Linux Firefox. This applies to preview/compositing surfaces and UI canvases so the application avoids creating accelerated surfaces during upload and resize. Keep the existing compositor, controls, layout, editing behavior, and project format. The HTML changes only the cache versions of the three modified scripts; the stylesheet is unchanged.

Verify actual displayed screenshots without first reading canvas pixels, then run existing playback, export, stereo-editing, and effects checks. The user's affected NVIDIA desktop remains the final verification environment; local passing checks alone do not establish that its black screen is resolved.

Validation: 411 Firefox checks and 75 Node tests passed. All 17 measured layouts exactly match the previous build. See [the investigation and evidence](docs/video-studio-linux-preview-debug.md#software-canvas-compatibility-correction).
