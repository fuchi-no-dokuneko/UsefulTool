(async () => {
  const checks = [];
  window.TEST_PROGRESS = checks;
  const check = (name, ok) => {
    checks.push({ name, passed: !!ok });
    if (!ok) throw new Error(name);
  };
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (fn) => {
    const start = performance.now();
    while (!fn()) {
      if (performance.now() - start > 20000)
        throw new Error("Control operation timed out");
      await delay(25);
    }
  };
  const frame = document.getElementById("studio");
  let w, d, api, M;
  const q = (s) => d.querySelector(s);
  const click = (id, scope = "#contextPanel", index = 0) => {
    const b = d.querySelectorAll(scope + ' button[data-help-id="' + id + '"]')[
      index
    ];
    if (!b || b.disabled) throw new Error("Unavailable " + id);
    b.click();
  };
  const set = (id, value, scope = "#contextPanel", index = 0) => {
    const f = [
      ...d.querySelectorAll(scope + ' [data-control="' + id + '"]'),
    ].filter(
      (e) =>
        e.tagName === "SELECT" ||
        e.tagName === "TEXTAREA" ||
        e.type !== "range",
    )[index];
    if (!f || f.disabled) throw new Error("Unavailable field " + id);
    if (f.type === "checkbox") f.checked = value;
    else f.value = value;
    f.dispatchEvent(new w.Event("input", { bubbles: true }));
    f.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const key = (target, key, extra = {}) =>
    target.dispatchEvent(
      new w.KeyboardEvent("keydown", { key, bubbles: true, ...extra }),
    );
  const files = (input, values) => {
    const data = new w.DataTransfer();
    values.forEach((f) => data.items.add(f));
    input.files = data.files;
    input.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const close = () => click("close", "#studioDialog");
  const expand = () =>
    d.querySelectorAll("#contextPanel details").forEach((e) => (e.open = true));
  const downloads = [];
  try {
    await wait(() => frame.contentWindow.UsefulToolVideoEditor?.ready);
    w = frame.contentWindow;
    d = frame.contentDocument;
    api = w.UsefulToolVideoEditor;
    M = api.Model;
    d.addEventListener(
      "click",
      (e) => {
        const a = e.target.closest("a[download]");
        if (a) {
          e.preventDefault();
          downloads.push({ name: a.download, url: a.href });
        }
      },
      true,
    );
    click("help", "#topbar");
    check(
      "built-in guide explains all four editing steps",
      q("#studioDialog").textContent.includes("4 · Export"),
    );
    close();
    const source = await (await fetch("fixtures/source.mp4")).blob();
    const chosen = [1, 2].map(
      (i) =>
        new w.File([source], "controls-" + i + ".mp4", { type: "video/mp4" }),
    );
    files(q("#videoFiles"), chosen);
    await wait(
      () =>
        api.project.mainOrder.length === 2 &&
        q("#importProgress").textContent.includes("ready"),
    );
    api.setStep("effects");
    api.selectItem(M.mainItems(api.project)[0].id, false);
    await api.seekTo(0.3);
    const videoId = api.selectedItem.id;
    set("itemName", "Opening scene");
    set("sourceIn", 0.1);
    set("sourceOut", 1.1);
    set("positionX", 3);
    set("positionY", 4);
    set("width", 150);
    set("height", 80);
    set("rotation", 15);
    set("cropX", 2);
    set("cropY", 3);
    set("cropWidth", 150);
    set("cropHeight", 80);
    set("visibility", 70);
    set("fadeIn", 0.1);
    set("fadeOut", 0.2);
    set("blendMode", "alpha");
    check(
      "precise source transform crop visibility and fade controls update the selected picture",
      api.selectedItem.sourceIn === 0.1 &&
        api.selectedItem.sourceOut === 1.1 &&
        api.selectedItem.transform.cropHeight === 80 &&
        api.selectedItem.opacity === 0.7 &&
        api.selectedItem.fadeOut === 0.2 &&
        api.selectedItem.blendMode === "alpha",
    );
    click("rotation", "#contextPanel", 0);
    check(
      "Rotate left applies a quarter turn",
      api.selectedItem.transform.rotation === -75,
    );
    click("rotation", "#contextPanel", 1);
    for (const fit of ["fill", "originalSize", "fit"]) {
      click(fit);
      check(
        fit + " sizes the picture within project coordinates",
        api.selectedItem.transform.width > 0 &&
          api.selectedItem.transform.fit ===
            (fit === "originalSize" ? "original" : fit),
      );
    }
    set("linkAudio", true);
    click("speed", "#contextPanel", 3);
    const sound = api.project.items.find(
      (i) =>
        i.kind === "audio" &&
        i.linkedGroupId === api.selectedItem.linkedGroupId,
    );
    check(
      "linked speed shortcut changes both source durations",
      api.selectedItem.playbackRate === 2 && sound.playbackRate === 2,
    );
    click("selectItem");
    set("volume", 120);
    set("leftGain", 50);
    set("rightGain", 150);
    set("fadeIn", 0.1);
    set("fadeOut", 0.2);
    set("preservePitch", false);
    set("waveformZoom", 2);
    set("muteItem", true);
    check(
      "mute removes only the selected sound from the mix",
      !M.evaluateAudio(api.project, 0.2).some((e) => e.item.id === sound.id),
    );
    set("muteItem", false);
    click("unlinkAudio");
    set("speed", 1);
    set("repeat", true);
    set("repeat", false);
    click("wholeMovie");
    check(
      "sound controls preserve independent pan fades rate and repeat",
      api.selectedItem.audio.volume === 1.2 &&
        api.selectedItem.audio.leftGain === 0.5 &&
        api.selectedItem.audio.rightGain === 1.5 &&
        api.selectedItem.audio.loop &&
        !api.selectedItem.linkEnabled &&
        M.item(api.project, videoId).playbackRate === 2,
    );
    for (const [id, value] of [
      ["videoBalance", 80],
      ["musicBalance", 70],
      ["otherBalance", 60],
    ])
      set(id, value);
    check(
      "three sound balance controls write independent mix gains",
      JSON.stringify(api.project.soundBalance) ===
        JSON.stringify({ video: 0.8, music: 0.7, other: 0.6 }),
    );
    api.selectItem(videoId, false);
    set("speed", 1);
    set("sourceIn", 0);
    set("sourceOut", 1.2);
    await api.seekTo(0.3);
    expand();
    click("curvePoint");
    set("pointTime", 0.1);
    set("pointValue", 20);
    set("easing", "smooth");
    expand();
    let graph = q(".curve-editor");
    graph.scrollIntoView({ block: "center" });
    let r = graph.getBoundingClientRect();
    graph.dispatchEvent(
      new w.MouseEvent("click", {
        bubbles: true,
        clientX: r.left + r.width * 0.75,
        clientY: r.top + r.height * 0.4,
      }),
    );
    key(q(".curve-editor"), "Enter");
    check(
      "curve points can be added positioned and interpolated with keyboard or pointer",
      api.selectedItem.opacityKeys.length === 3 &&
        api.selectedItem.opacityKeys[0].value === 0.2 &&
        api.selectedItem.opacityKeys[0].easing === "smooth",
    );
    click("deletePoint");
    check(
      "Delete point removes the selected curve point",
      api.selectedItem.opacityKeys.length === 2,
    );
    for (const effect of [
      "brightness",
      "contrast",
      "saturation",
      "grayscale",
      "sepia",
      "hue",
    ]) {
      click("addEffect");
      await delay(20);
      check(
        effect + " effect gallery shows live preview cards",
        q("#studioDialog").querySelectorAll("canvas").length === 6,
      );
      click(effect, "#studioDialog");
    }
    set("effectAmount", 1.5);
    set("effectStart", 0.1);
    set("effectEnd", 0.8);
    set("effectEnabled", false);
    check(
      "effect range strength and enabled state affect the evaluated stack",
      api.selectedItem.effects[0].amount === 1.5 &&
        api.selectedItem.effects[0].start === 0.1 &&
        !M.evaluateFrame(api.project, 0.3)
          .items.find((e) => e.item.id === videoId)
          .effects.some((f) => f.id === api.selectedItem.effects[0].id),
    );
    click("duplicateEffect");
    const count = api.selectedItem.effects.length;
    click("effectDown");
    click("effectUp", "#contextPanel", 1);
    click("deleteEffect");
    check(
      "effect copy reorder and delete preserve an editable stack",
      count === 7 && api.selectedItem.effects.length === 6,
    );
    for (const type of [
      "Crossfade",
      "Fade through black",
      "Wipe",
      "Slide",
      "Zoom",
      "Dissolve",
    ]) {
      click("transition", "#timelineContent");
      await delay(30);
      const b = [
        ...q("#studioDialog").querySelectorAll(
          'button[data-help-id="transitionType"]',
        ),
      ].find((b) => b.getAttribute("aria-label") === type);
      b.click();
      click("useMaximum", "#studioDialog");
      set("transitionDuration", 0.2, "#studioDialog");
      set("direction", "right", "#studioDialog");
      set("easing", "ease-out", "#studioDialog");
      click("apply", "#studioDialog");
      await api.seekTo(0.3);
      check(
        type + " transition can be configured and previewed on the main cut",
        api.project.transitions.length === 1 &&
          api.project.transitions[0].duration === 0.2 &&
          api.project.transitions[0].direction === "right",
      );
    }
    click("transition", "#timelineContent");
    click("removeTransition", "#studioDialog");
    check(
      "removing a transition restores contiguous main clips",
      api.project.transitions.length === 0 &&
        M.mainItems(api.project)[1].start === M.mainItems(api.project)[0].end,
    );
    api.setStep("arrange");
    click("addOnTop");
    click("addCredits", "#studioDialog");
    click("creditsTemplate", "#studioDialog", 0);
    set("groupTitle", "Cast list");
    set("groupContent", "Alice\nBob");
    set("creditsMode", "speed");
    set("direction", "down");
    set("creditsSpeed", 120);
    set("fontSize", 18);
    set("lineSpacing", 1.2);
    set("marginTop", 10);
    set("marginBottom", 12);
    set("color", "#eeeeee");
    set("background", "#112233");
    const credit = api.selectedItem,
      group = credit.credits.groups[0].id;
    click("groupDown");
    click("groupUp", "#contextPanel", 1);
    click("deleteGroup", "#contextPanel", 1);
    check(
      "rolling credits keep speed appearance and reordered structured names",
      credit.credits.groups[0].id === group &&
        credit.credits.groups.length === 4 &&
        credit.credits.direction === "down" &&
        credit.credits.speed === 120 &&
        credit.credits.groups[0].content === "Alice\nBob",
    );
    set("creditsTemplate", "pages");
    check(
      "credits template switches to pages",
      api.selectedItem.credits.template === "pages",
    );
    api.addNewItem("text", { preset: "caption" });
    set("textContent", "Accessible caption");
    set("textPreset", "subtitle");
    set("font", "Georgia");
    set("fontSize", 22);
    set("fontWeight", "700");
    set("alignment", "left");
    set("color", "#112233");
    set("background", "#eeeeee");
    set("background", true, "#contextPanel", 1);
    check(
      "text presets font alignment and transparent background remain editable",
      api.selectedItem.text.preset === "subtitle" &&
        api.selectedItem.text.font === "Georgia" &&
        api.selectedItem.text.align === "left" &&
        api.selectedItem.text.background === "transparent",
    );
    const textId = api.selectedItem.id,
      layerId = api.selectedItem.layerId;
    click("moveBehind");
    click("moveFront");
    const layerButton = q(`[data-layer-id="${layerId}"] .track-heading button`);
    layerButton.click();
    set("renameLayer", "Captions", "#studioDialog");
    set("showLayer", false, "#studioDialog");
    set("lockItem", true, "#studioDialog");
    set("muteItem", true, "#studioDialog");
    set("soloLayer", true, "#studioDialog");
    check(
      "layer header controls rename visibility lock mute and solo",
      M.layer(api.project, layerId).name === "Captions" &&
        !M.layer(api.project, layerId).visible &&
        M.layer(api.project, layerId).locked &&
        M.layer(api.project, layerId).muted &&
        M.layer(api.project, layerId).solo,
    );
    set("showLayer", true, "#studioDialog");
    set("lockItem", false, "#studioDialog");
    set("muteItem", false, "#studioDialog");
    set("soloLayer", false, "#studioDialog");
    click("moveBehind", "#studioDialog");
    click("moveFront", "#studioDialog");
    close();
    api.selectItem(textId, false);
    click("showItem");
    check(
      "Hide item removes it from frame evaluation",
      !api.selectedItem.enabled,
    );
    click("showItem");
    click("duplicateItem");
    const dupe = api.selectedItem.id;
    check(
      "Duplicate creates a separate editable visual layer",
      dupe !== textId && api.selectedItem.layerId !== layerId,
    );
    click("deleteItem");
    api.undo();
    await delay(20);
    api.redo();
    await delay(20);
    check(
      "delete Undo and Redo restore then remove the copied item",
      !M.item(api.project, dupe),
    );
    api.addNewItem("filter");
    for (const [type, amount] of [
      ["box", 20],
      ["motion", 60],
      ["radial", 75],
      ["gaussian", 40],
    ]) {
      set("blurType", type);
      set("blurAmount", amount);
      if (type === "motion") set("blurAngle", 135);
      if (type === "radial") {
        set("blurCenterX", 25);
        set("blurCenterY", 75);
      }
      check(
        type + " blur inspector applies its own parameter range",
        api.selectedItem.filter.type === type &&
          api.selectedItem.filter.amount === amount,
      );
    }
    set("blurTarget", "selected-layer");
    set("targetLayer", layerId);
    check(
      "blur can target one selected text layer",
      api.selectedItem.filter.targetLayerId === layerId,
    );
    set("blurTarget", "everything-below");
    api.selectItem(videoId, false);
    await api.seekTo(0.2);
    click("addHere", "#timelineContent");
    q('#studioDialog input[type="radio"]').click();
    click("apply", "#studioDialog");
    check(
      "Add here inserts the chosen library source in Main video",
      api.project.mainOrder.length === 3,
    );
    api.setStep("effects");
    await api.seekTo(0.2);
    click("videoOverlay");
    click("softOverlap", "#studioDialog");
    q("#studioDialog")
      .querySelectorAll(".media-choice input")
      .forEach((i) => (i.checked = true));
    click("apply", "#studioDialog");
    await delay(50);
    click("videoOverlay");
    check(
      "a full overlay interval explains its three-video limit",
      q("#studioDialog").textContent.includes(
        "3 videos are already visible here",
      ),
    );
    click("shortenOverlay", "#studioDialog");
    // Conflict recovery remains available after extending an existing overlay.
    const overlay = api.project.items.find((i) => i.layerId === "overlay-1");
    api.edit(
      () => {
        const dupe = M.duplicateItem(api.project, overlay.id);
        dupe.start = overlay.start + 0.1;
        dupe.end = overlay.end + 0.1;
      },
      "Create a recoverable overlap",
      { context: true },
    );
    api.renderAll();
    let blocked = false;
    try {
      await api.engine.play();
    } catch {
      blocked = true;
    }
    check(
      "same-track conflicts stop playback before extra decoders start",
      blocked && M.videoConflicts(api.project).length > 0,
    );
    click("fixConflict");
    check(
      "Fix automatically puts overlay items in non-overlapping intervals",
      M.videoConflicts(api.project).length === 0,
    );
    // Test real downloadable project bytes and native project file input.
    click("projectMenu", "#topbar");
    check(
      "Project menu offers new open save and copy",
      q("#studioDialog").textContent.includes("Save a copy"),
    );
    click("saveProject", "#studioDialog");
    click("projectMenu", "#topbar");
    click("saveCopy", "#studioDialog");
    const saved = JSON.parse(
        await (await fetch(downloads[downloads.length - 2].url)).text(),
      ),
      copy = JSON.parse(await (await fetch(downloads.at(-1).url)).text());
    check(
      "Save project and Save a copy download versioned JSON with independent copy identity",
      saved.schemaVersion === 1 &&
        copy.id !== saved.id &&
        copy.name.endsWith(" copy"),
    );
    const beforeOpen = api.project;
    files(q("#projectFile"), [
      new w.File([JSON.stringify(saved)], "saved.utvproj", {
        type: "application/json",
      }),
    ]);
    await wait(
      () =>
        api.project !== beforeOpen &&
        !api.loading &&
        api.project.id === saved.id &&
        api.project.assets.every((a) => api.library.has(a.id)),
    );
    await api.seekTo(0);
    check(
      "Open project restores all saved timeline and effect objects",
      api.project.items.length === saved.items.length,
    );
    click("projectMenu", "#topbar");
    click("newProject", "#studioDialog");
    click("saveProject", "#studioDialog");
    await wait(
      () => api.project.items.length === 0 && !q("#studioDialog").open,
    );
    check(
      "Save and start new clears the timeline after producing a project file",
      downloads.length === 3 && api.project.assets.length === 0,
    );
    // A photograph alone enables Arrange, and the card chooses its placement.
    const canvas = w.document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 50;
    canvas.getContext("2d").fillRect(0, 0, 80, 50);
    const photo = new w.File(
      [await new Promise((r) => canvas.toBlob(r))],
      "photo.png",
      { type: "image/png" },
    );
    files(q("#imageFiles"), [photo]);
    await wait(
      () =>
        api.project.assets.length === 1 &&
        q("#importProgress").textContent.includes("ready"),
    );
    await api.store.flush();
    const previousApi = api;
    const refreshed = new Promise((resolve) =>
      frame.addEventListener("load", resolve, { once: true }),
    );
    w.location.reload();
    await refreshed;
    await wait(
      () =>
        frame.contentWindow.UsefulToolVideoEditor?.ready &&
        frame.contentWindow.UsefulToolVideoEditor !== previousApi,
    );
    w = frame.contentWindow;
    d = frame.contentDocument;
    api = w.UsefulToolVideoEditor;
    M = api.Model;
    check(
      "a library-only project offers recovery after refresh",
      Boolean(q("#continueProjectButton")),
    );
    q("#continueProjectButton").click();
    await wait(
      () =>
        !api.loading &&
        api.project.assets.length === 1 &&
        api.library.has(api.project.assets[0].id),
    );
    click("addToMovie", "#mediaPanel");
    check(
      "an image-only movie starts at zero and lasts five seconds",
      api.project.mainOrder.length === 1 &&
        api.project.duration === 5 &&
        !q("#startArrangeButton").disabled,
    );
    click("startArrange");
    api.addNewItem("image", { assetId: api.project.assets[0].id });
    await api.seekTo(0.3);
    const selection = q("#interactionBox");
    key(selection, "ArrowRight");
    key(selection, "ArrowDown", { shiftKey: true });
    key(q('.resize-handle[data-handle="se"] button'), "ArrowRight");
    check(
      "keyboard selection move and resize update project geometry",
      api.selectedItem.transform.x === 1 &&
        api.selectedItem.transform.y === 10 &&
        api.selectedItem.transform.width === 81,
    );
    const item = q(
      '.timeline-item[data-item-id="' + api.selectedItem.id + '"]',
    );
    key(item, "ArrowRight", { shiftKey: true });
    key(item, "Enter");
    check(
      "timeline keyboard movement keeps its selected item",
      api.selectedItem.start > 0,
    );
    await api.seekTo(api.selectedItem.start + 0.5);
    key(d.body, "s");
    key(d.body, "z", { ctrlKey: true });
    await delay(25);
    key(d.body, "y", { ctrlKey: true });
    await delay(25);
    key(d.body, "Delete");
    check(
      "keyboard cut undo redo and delete leave an editable movie",
      api.project.mainOrder.length === 1 && api.history.canUndo,
    );
    api.setStep("export");
    set("quality", "quick");
    set("fps", 24);
    set("bitrate", 4);
    set("format", w.UTStudio.supportedFormats()[0][0]);
    set("includeAudio", false);
    set("segmentInterval", 1);
    set("segmentCuts", true);
    check(
      "export technical settings and interval markers use the project model",
      api.project.exportSettings.fps === 24 &&
        !api.project.exportSettings.includeAudio &&
        d.querySelectorAll(".segment-cut").length > 0,
    );
    set("segmentCuts", false);
    await api.importFiles(
      [new w.File([], "empty.mp4", { type: "video/mp4" })],
      "video",
    );
    check(
      "failed imports show the filename reason and recovery action",
      q("#mediaPanel").textContent.includes("empty.mp4") &&
        q("#mediaPanel").textContent.includes("This file is empty"),
    );
    window.TEST_RESULT = { passed: true, checks };
  } catch (error) {
    window.TEST_RESULT = {
      passed: false,
      checks,
      error: error.stack,
      uiError: q?.("#contextError")?.textContent,
    };
  }
  document.getElementById("result").textContent = JSON.stringify(
    window.TEST_RESULT,
    null,
    2,
  );
})();
