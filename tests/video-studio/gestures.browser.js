(async () => {
  const checks = [];
  window.TEST_PROGRESS = checks;
  const check = (name, ok) => {
    checks.push({ name, passed: !!ok });
    if (!ok) throw new Error(name);
  };
  const wait = async (fn) => {
    const start = performance.now();
    while (!fn()) {
      if (performance.now() - start > 20000)
        throw new Error("Gesture operation timed out");
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  let w, d, api, M;
  const frame = document.getElementById("studio"),
    q = (s) => d.querySelector(s);
  const pointer = (target, type, x, y, extra = {}) =>
    target.dispatchEvent(
      new w.PointerEvent(type, {
        bubbles: true,
        pointerId: 13,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        clientX: x,
        clientY: y,
        ...extra,
      }),
    );
  const click = (id, scope = "") => {
    const b = q(scope + ' button[data-help-id="' + id + '"]');
    if (!b || b.disabled) throw new Error("Unavailable " + id);
    b.click();
  };
  const drop = (target, data, x = 300, y = 300) => {
    for (const type of ["dragenter", "dragover", "drop"])
      target.dispatchEvent(
        new w.DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
          clientX: x,
          clientY: y,
        }),
      );
  };
  const key = (target, key, extra = {}) =>
    target.dispatchEvent(
      new w.KeyboardEvent("keydown", { bubbles: true, key, ...extra }),
    );
  const dragTo = (id, layer, dx = 0) => {
    const card = q('.timeline-item[data-item-id="' + id + '"]');
    card.scrollIntoView({ block: "nearest" });
    const r = card.getBoundingClientRect(),
      target = q('.track-row[data-layer-id="' + layer + '"]');
    const x = r.left + r.width / 2,
      y = r.top + r.height / 2;
    pointer(card, "pointerdown", x, y);
    // Sound lanes are expanded by default; scroll to reach the destination.
    pointer(d, "pointermove", x, y + 20);
    q('.track-row[data-layer-id="' + layer + '"]').scrollIntoView({
      block: "nearest",
    });
    const tr = q(
      '.track-row[data-layer-id="' + layer + '"]',
    ).getBoundingClientRect();
    pointer(d, "pointermove", x + dx, tr.top + tr.height / 2);
    pointer(d, "pointerup", x + dx, tr.top + tr.height / 2);
  };
  try {
    await wait(() => frame.contentWindow.UsefulToolVideoEditor?.ready);
    w = frame.contentWindow;
    d = frame.contentDocument;
    api = w.UsefulToolVideoEditor;
    M = api.Model;
    const blob = await (await fetch("fixtures/source.mp4")).blob(),
      file = new w.File([blob], "shared.mp4", { type: "video/mp4" });
    const data = new w.DataTransfer();
    data.items.add(file);
    data.items.add(file);
    drop(d.body, data);
    await wait(
      () =>
        api.project.mainOrder.length === 2 &&
        q("#importProgress").textContent.includes("ready"),
    );
    check(
      "file drop imports two timeline uses while deduplicating identical source media",
      api.project.assets.length === 1 &&
        !d.body.classList.contains("is-dragging-file"),
    );
    api.setStep("arrange");
    const id = api.project.mainOrder[0],
      sourceId = api.project.assets[0].id;
    const originalSound = api.project.items.find(
        (i) =>
          i.kind === "audio" &&
          i.linkedGroupId === M.item(api.project, id).linkedGroupId,
      ),
      soundTime = originalSound.start;
    M.setLink(api.project, id, false);
    dragTo(id, "overlay-1", 30);
    check(
      "vertical pointer drag moves a picture from Main video to Overlay 1",
      M.item(api.project, id).layerId === "overlay-1" &&
        api.project.mainOrder.length === 1 &&
        M.item(api.project, originalSound.id).start === soundTime,
    );
    dragTo(id, "overlay-2");
    check(
      "vertical pointer drag changes overlay level",
      M.item(api.project, id).layerId === "overlay-2",
    );
    dragTo(id, "main");
    check(
      "returning a video to Main video restores sequential arrangement",
      M.item(api.project, id).layerId === "main" &&
        api.project.mainOrder.length === 2 &&
        M.mainItems(api.project)[1].start === M.mainItems(api.project)[0].end,
    );
    const transfer = new w.DataTransfer();
    transfer.setData("application/x-utv-asset", sourceId);
    const content = q("#timelineContent").getBoundingClientRect(),
      target = q('.track-row[data-layer-id="overlay-1"]');
    drop(
      target,
      transfer,
      content.left + 170,
      target.getBoundingClientRect().top + 30,
    );
    check(
      "dragging library media onto an overlay creates a separate timed item",
      api.project.items.filter(
        (i) => i.kind === "video" && i.layerId === "overlay-1",
      ).length === 1,
    );
    const selectedId = api.selectedItem.id;
    await api.seekTo(0.4);
    const startHandle = q(
      '.timeline-item[data-item-id="' +
        selectedId +
        '"] .trim-handle.start button',
    );
    const initialIn = api.selectedItem.sourceIn;
    key(startHandle, "ArrowRight");
    check(
      "keyboard trim changes the source start while retaining selection",
      api.selectedItem.id === selectedId &&
        api.selectedItem.sourceIn > initialIn,
    );
    const ruler = q(".timeline-ruler"),
      rr = ruler.getBoundingClientRect();
    pointer(ruler, "pointerdown", rr.left + 220, rr.top + 10);
    pointer(d, "pointermove", rr.left + 250, rr.top + 10);
    pointer(d, "pointerup", rr.left + 250, rr.top + 10);
    await wait(() => api.project.playhead > 0.5);
    const before = api.project.playhead;
    key(q(".timeline-ruler"), "ArrowRight");
    await wait(() => api.project.playhead > before);
    check(
      "pointer scrubbing and ruler keyboard controls update the playhead",
      api.project.playhead > 0.5,
    );
    const afterRuler = api.project.playhead;
    key(d.body, "ArrowLeft");
    await wait(() => api.project.playhead < afterRuler);
    const zoom = q('input[aria-label="Timeline zoom"]');
    zoom.value = 120;
    zoom.dispatchEvent(new w.Event("input", { bubbles: true }));
    check(
      "timeline zoom updates the displayed scale without changing item timing",
      q('input[aria-label="Timeline zoom"]').value === "120" &&
        M.item(api.project, originalSound.id).start === soundTime,
    );
    api.selectItem(selectedId, false);
    await api.seekTo(api.selectedItem.start + 0.2);
    const box = q("#interactionBox"),
      br = box.getBoundingClientRect(),
      position = api.selectedItem.transform.x;
    pointer(box, "pointerdown", br.left + 30, br.top + 30);
    pointer(d, "pointermove", br.left + 55, br.top + 35);
    pointer(d, "pointercancel", br.left + 55, br.top + 35);
    check(
      "pointer cancellation rolls back an unfinished preview drag",
      api.selectedItem.transform.x === position,
    );
    const handle = q('.resize-handle[data-handle="nw"] button'),
      hr = handle.getBoundingClientRect(),
      width = api.selectedItem.transform.width;
    pointer(handle, "pointerdown", hr.left + 20, hr.top + 20);
    pointer(d, "pointermove", hr.left + 30, hr.top + 30);
    pointer(d, "pointerup", hr.left + 30, hr.top + 30);
    check(
      "top-left resizing adjusts the box while keeping the opposite corner",
      api.selectedItem.transform.width < width &&
        api.selectedItem.transform.x > position,
    );
    api.selectItem(null, false);
    const stage = q("#stageMedia").getBoundingClientRect();
    pointer(
      q("#previewCanvas"),
      "pointerdown",
      stage.left + stage.width / 2,
      stage.top + stage.height / 2,
    );
    pointer(
      d,
      "pointerup",
      stage.left + stage.width / 2,
      stage.top + stage.height / 2,
    );
    check(
      "clicking the composed preview selects the top visible picture",
      !!api.selectedItem && api.selectedItem.layerId === "overlay-1",
    );
    // Simulate browser cache eviction, then use the actual Relink file action.
    await api.store.flush();
    const saved = M.copy(api.project);
    await api.store.clear();
    await api.engine.dispose();
    api.library.dispose();
    await api.replaceProject(saved);
    check(
      "missing source media shows Relink file cards and disables export",
      q("#mediaPanel").textContent.includes("Original file needed"),
    );
    api.setStep("export");
    check("missing media cannot be exported", q("#exportButton").disabled);
    const nativeClick = w.HTMLInputElement.prototype.click;
    let chooser;
    w.HTMLInputElement.prototype.click = function () {
      if (this.type === "file") chooser = this;
      else nativeClick.call(this);
    };
    try {
      click("relink", "#mediaPanel");
      const wrong = new w.DataTransfer();
      wrong.items.add(
        new w.File(["wrong"], "shared.mp4", { type: "video/mp4" }),
      );
      chooser.files = wrong.files;
      chooser.dispatchEvent(new w.Event("change", { bubbles: true }));
      await wait(() =>
        q("#contextError").textContent.includes("does not match"),
      );
      check(
        "relink rejects changed bytes without replacing the missing source",
        !api.library.has(sourceId),
      );
      click("relink", "#mediaPanel");
      const correct = new w.DataTransfer();
      correct.items.add(file);
      chooser.files = correct.files;
      chooser.dispatchEvent(new w.Event("change", { bubbles: true }));
      await wait(
        () => api.library.has(sourceId) && !q("#exportButton").disabled,
      );
      check(
        "matching filename size and hash relinks every use of the source",
        api.project.items.filter((i) => i.assetId === sourceId).length >= 6,
      );
      click("projectMenu", "#topbar");
      click("openProject", "#studioDialog");
      check(
        "Open project invokes the project picker",
        chooser.id === "projectFile",
      );
    } finally {
      w.HTMLInputElement.prototype.click = nativeClick;
    }
    // Ensure manual reordering and source-start extension respect independent audio.
    const first = M.mainItems(api.project)[0];
    M.reorderMain(api.project, first.id, 1);
    check(
      "main reordering preserves independent sound timing",
      M.item(api.project, originalSound.id).start === soundTime &&
        api.project.mainOrder[1] === first.id,
    );
    const visual = api.project.items.find((i) => i.layerId === "overlay-1");
    M.trimItem(api.project, visual.id, "start", visual.start + 0.1);
    M.trimItem(api.project, visual.id, "start", visual.start - 0.05);
    check(
      "trim-start can both shorten and restore available source frames",
      visual.sourceIn >= 0 && M.span(visual) > 0,
    );
    const ordered = M.mainItems(api.project),
      fixed = ordered[1],
      fixedStart = fixed.start,
      firstEnd = ordered[0].end;
    api.edit(() => {
      fixed.locked = true;
    }, "Lock the later clip");
    api.edit(
      () => M.trimItem(api.project, ordered[0].id, "end", firstEnd - 0.1),
      "Attempt a ripple trim",
    );
    check(
      "ripple edits cannot move a locked later clip",
      M.item(api.project, fixed.id).start === fixedStart &&
        M.item(api.project, ordered[0].id).end === firstEnd &&
        q("#contextError").textContent.includes("Unlock"),
    );
    const beforePreset = JSON.stringify(api.project.items);
    api.edit(
      () =>
        M.applyOverlayPreset(api.project, [ordered[0].id, fixed.id], "groovy"),
      "Attempt an overlap preset",
    );
    check(
      "overlap presets cannot change a locked picture or partially edit other pictures",
      JSON.stringify(api.project.items) === beforePreset &&
        q("#contextError").textContent.includes("Unlock"),
    );
    window.TEST_RESULT = { passed: true, checks };
  } catch (error) {
    window.TEST_RESULT = {
      passed: false,
      checks,
      error: error.stack,
      uiError: d?.getElementById("contextError")?.textContent,
    };
  }
  document.getElementById("result").textContent = JSON.stringify(
    window.TEST_RESULT,
    null,
    2,
  );
})();
