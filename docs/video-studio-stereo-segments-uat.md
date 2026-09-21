# Desktop editor and tool regression acceptance

2026-09-21: PASS locally. Existing branch and deployment entry points retained; no deployment.

| Requirements | Current evidence |
| --- | --- |
| 1–2 | Desktop controls use the 1100px breakpoint. Old projects receive stereo/1/1 defaults; existing gain values survive reopening. |
| 3–4 | Actual desktop screenshots show both labelled L/R lanes, three presets and independent 0–100% controls outside collapsed settings. |
| 5–8 | Separate 440/880Hz songs occupy opposite ears. Single-ear routing retains both stereo source channels. Shared graph/export comparison differs by at most 5.97e-8 before encoding; decoded Opus preserves assignments. Three-source limit passes. |
| 9 | Save/open, refresh recovery, Duplicate, Cut, Trim, Undo and Redo preserve routing. |
| 10–15 | Original model reproduces B at 4–8s over no Main frame. Fixed desktop drag moves B and linked sound to 3–7s, preserving source ranges, rate, link and visual/audio properties. |
| 16–17 | A remains beneath B during 3–4s; B is fully visible at 4s. Preview, export preview and decoded frames agree within encoding tolerance. One Undo/Redo restores the entire move. |
| 18–20 | Actual 106s project at 0.1s yields one downloaded ZIP with 1,060 ordered entries. FFmpeg verifies 3,180 VP9 frames and stereo Opus. Progress, cancellation, errors, recovery and zero application console errors pass. |

Reported tool bugs also pass: MP4 erase/inject preserve every decoded audio/video frame in both fixtures; stale tabs preserve drafts; linked sound trim/duplicate reflow Main; deletion removes obsolete transitions; CI expects one ZIP; regex formatting, PDF selection races, PNG alpha, negative powers, gain mode and Unicode captions are corrected.

Validation: 55 unit/static checks, 332 browser regression checks, 40 routing checks, 11 independent routing/ZIP checks, 27 long-playback checks, 37 release checks and 8 independent final-export checks. MP4 passes four comparisons. The unchanged coverage gate passes with measured browser and Node V8 coverage.

Optimizations: reuse sentence segmentation; erase MP4 metadata with one full-file copy; reuse decoded audio across interval exports. Offline artifacts and hosted sources pass verification.

Evidence: `build/reports/video-studio/`, `build/reports/browser-uat/`; portable report and media in `fan-out/uat/`. Run the commands in the root README; also run `test:long-playback`, `test:release`, and `node tests/tool-bugs/verify-media.cjs`.

繁體中文：20 項桌面需求及所列工具問題均通過本機驗證。106 秒影片產生 1060 個片段；聲道、移軌、還原、下載及主控台檢查皆通過。保留原入口與部署方式，未部署。

简体中文：20 项桌面需求及所列工具问题均通过本地验证。106 秒视频产生 1060 个片段；声道、移轨、恢复、下载及控制台检查均通过。保留原入口与部署方式，未部署。
