// Paste into the editor console to compare the September 24 desktop layout.
// This diagnostic is not loaded by the application. Refresh or UT_LAYOUT.restore() to undo.
(() => {
  if (!window.UsefulToolVideoEditor?.ready)
    throw new Error("Open the video editor first.");
  if (innerWidth < 760)
    throw new Error(
      "This comparison needs the desktop layout (at least 760 CSS pixels wide).",
    );
  window.UT_LAYOUT?.restore();
  const workspace = document.querySelector(".editor-workspace");
  const timeline = document.querySelector(".timeline-card");
  const parent = timeline.parentNode,
    next = timeline.nextSibling;
  const changed = [...document.styleSheets]
    .flatMap((s) => [...s.cssRules])
    .filter(
      (r) =>
        r.media &&
        r.media.mediaText.includes("min-width: 760px") &&
        (r.media.mediaText === "(min-width: 760px)" ||
          r.cssText.includes(".timeline-card") ||
          r.media.mediaText.includes("max-height: 599px")),
    )
    .map((rule) => ({ rule, media: rule.media.mediaText }));
  if (changed.length !== 3)
    throw new Error(
      "This page does not match the expected current layout; nothing was changed.",
    );
  const style = document.createElement("style");
  style.textContent =
    "@media(min-width:760px){#editorRoot{height:calc(100vh - 120px)}#editorRoot .preview-card{grid-template-columns:none}#stageHead,.stage-title{min-width:auto}}";
  const log = (mode) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const c = document.getElementById("previewCanvas"),
          r = c.getBoundingClientRect();
        console.log(
          "LAYOUT_COMPARISON",
          JSON.stringify({
            mode,
            viewport: [innerWidth, innerHeight],
            dpr: devicePixelRatio,
            backing: [c.width, c.height],
            display: [r.x, r.y, r.width, r.height],
          }),
        );
      }),
    );
  window.UT_LAYOUT = {
    old() {
      if (innerWidth < 760)
        throw new Error(
          "Keep the desktop viewport at least 760 CSS pixels wide.",
        );
      for (const { rule } of changed) rule.media.mediaText = "not all";
      document.head.append(style);
      workspace.append(timeline);
      UsefulToolVideoEditor.renderAll();
      log("September 24 preview layout; current application code");
    },
    restore() {
      for (const { rule, media } of changed) rule.media.mediaText = media;
      parent.insertBefore(timeline, next);
      style.remove();
      UsefulToolVideoEditor.renderAll();
      log("Current layout");
    },
  };
  UT_LAYOUT.old();
})();
