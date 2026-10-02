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

## Authorized follow-up — six UAT defects (2026-10-02)

The user explicitly requested the fixes in attachment `76a879e2-8066-4277-b84d-5cef5ea759da/pasted-text-1.txt` after committing the preceding change. `811e06c` is committed and pushed. This follow-up is limited to defects VE01–VE06; preserve the existing UI design and features and retain the Linux Firefox preview correction.

- VE01: enforce valid effect intervals and protect/recover valid saved projects.
- VE02: apply linked source trims transactionally and respect item/layer locks.
- VE03: keep inspector callbacks bound to the current project after rejected edits.
- VE04: preserve the zoom slider node, focus, and pointer gesture.
- VE05: invalidate every stale export result and verify actual downloaded outputs.
- VE06: show accepted numeric values on commit while preserving typing drafts.

Acceptance requires native keyboard/pointer reproductions, model/history/recovery agreement, valid Save/Open/relink round trips, and downloaded movie/ZIP verification. Completion is not established by a ready label alone.

Validation completed: 187 native Firefox UAT checks (including 371 numeric edge-case paths), 215 existing Firefox regression checks, 56 preview checks, 50 stereo checks, 71 Linux preview checks, 79 Node tests and 75 Chromium checks passed. Sixteen desktop/mobile UI geometry comparisons match `811e06c` exactly. Save/Open/relink, recovery, actual video downloads, ZIP members and cancellation/retry were verified. The stylesheet is unchanged. See [the fix and evidence report](docs/video-studio-uat-fixes.md). The affected NVIDIA desktop remains unverified; the standing feature freeze is unchanged.
