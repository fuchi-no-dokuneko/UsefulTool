/* Browser-only Timeline Video Studio. Model, playback and UI share one project. */
(function (root) {
  "use strict";
  const {
    Model: M,
    Media,
    Help: H,
    SessionStore,
    Renderer,
    Audio,
    Engine,
    AutoMovie,
  } = root.UTStudio;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls = "", text = "") => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== "") node.textContent = text;
    return node;
  };
  const named = (value) =>
    value?.text?.content?.split("\n")[0] ||
    value?.name ||
    (value?.kind === "filter"
      ? "Blur area"
      : value?.kind === "credits"
        ? "Credits"
        : "Untitled item");
  const time = (value) => M.formatTime(value, project.exportSettings.fps);
  const bytes = (value) =>
    value >= 1048576
      ? (value / 1048576).toFixed(1) + " MiB"
      : (value / 1024).toFixed(1) + " KiB";
  let project = M.createProject(),
    history = new M.History(project),
    library = new Media.MediaLibrary(),
    renderer,
    mixer,
    engine;
  let selectedId = null,
    mediaTab = "video",
    zoom = 70,
    soundExpanded = false,
    exporting = false,
    importing = false,
    projectLoading = false,
    showCuts = false;
  let results = [],
    importErrors = [],
    saveStatus = "Ready on this device",
    importStatus = "",
    errorMessage = "",
    toastTimer,
    drawRequest = 0,
    dialogCleanup = null;
  let insertIndex = null,
    dialogReturn = null,
    drag = null,
    waveZoom = 1,
    assetSelected = null;
  const store = new SessionStore((status, error) => {
    saveStatus = status;
    const node = $("saveStatus");
    if (node) node.textContent = status;
    if (error) report(error);
  });
  const selected = () => M.item(project, selectedId);
  function B(helpId, label, onClick, options = {}) {
    const wrapper = H.button({
      helpId,
      label,
      onClick: (event) => {
        try {
          const result = onClick?.(event);
          if (result?.catch) result.catch(report);
        } catch (error) {
          report(error);
        }
      },
      disabled: options.disabled || projectLoading,
      disabledReason:
        (projectLoading
          ? "Wait for the project and its media to finish opening."
          : "") ||
        options.reason ||
        (options.disabled
          ? exporting
            ? "Finish or cancel the export to use this control."
            : "Select an unlocked item with an available action to enable this control."
          : ""),
      className: options.primary ? "primary" : options.className || "",
      id: options.id,
      icon: options.icon || Boolean(options.symbol),
    });
    if (options.symbol) wrapper.firstElementChild.textContent = options.symbol;
    if (options.wrapperClass)
      wrapper.classList.add(...options.wrapperClass.split(" "));
    return wrapper;
  }
  function report(error) {
    errorMessage = error.message || String(error);
    $("announcer").textContent = errorMessage;
    const panel = $("contextError");
    if (panel) {
      panel.textContent = errorMessage;
      panel.hidden = false;
    } else renderContext();
  }
  function announce(text) {
    $("announcer").textContent = text;
  }
  function group(title, ...children) {
    const node = el("section", "section");
    if (title) node.append(el("h3", "", title));
    node.append(...children.filter(Boolean));
    return node;
  }
  function row(...children) {
    const node = el("div", "button-row");
    node.append(...children.filter(Boolean));
    return node;
  }
  function details(title, ...children) {
    const node = el("details", "details");
    const summary = el("summary", "", title);
    H.attach(summary, "moreSettings");
    node.append(summary);
    const body = el("div", "details-body");
    body.append(...children.filter(Boolean));
    node.append(body);
    return node;
  }
  function field(label, helpId, value, setter, options = {}) {
    const reason = () =>
      exporting
        ? "Finish or cancel the export to change this setting."
        : options.disabled
          ? options.reason || "Unlock this item to change this setting."
          : "";
    const node = el("label", "field" + (options.wide ? " wide" : "")),
      heading = H.label(helpId, label, reason);
    const input = el(
      options.options ? "select" : options.multiline ? "textarea" : "input",
    );
    if (options.options)
      for (const entry of options.options) {
        const option = el(
          "option",
          "",
          Array.isArray(entry) ? entry[1] : entry,
        );
        option.value = Array.isArray(entry) ? entry[0] : entry;
        input.append(option);
      }
    else if (!options.multiline) input.type = options.type || "number";
    if (options.min !== undefined) input.min = options.min;
    if (options.max !== undefined) input.max = options.max;
    if (!options.options && !options.multiline && input.type === "number")
      input.step = options.step ?? 0.01;
    if (options.multiline || input.type === "text")
      input.maxLength = options.maxLength || 12000;
    input.value = value ?? "";
    input.dataset.control = helpId;
    input.setAttribute("aria-label", label);
    if (options.id) input.id = options.id;
    H.attach(input, helpId, reason);
    input.disabled = Boolean(options.disabled || exporting || projectLoading);
    const update = (commit) => {
      if (
        input.type === "number" &&
        (!input.value || !Number.isFinite(input.valueAsNumber))
      )
        return;
      const next =
        input.type === "number"
          ? M.clamp(
              input.valueAsNumber,
              options.min ?? -1e9,
              options.max ?? 1e9,
            )
          : input.value;
      setter(next, commit);
    };
    input.addEventListener("input", () => {
      if (!options.options) update(false);
    });
    input.addEventListener("change", () => update(true));
    node.append(heading, input);
    return node;
  }
  function range(label, helpId, value, min, max, step, setter, options = {}) {
    const reason = () =>
      exporting
        ? "Finish or cancel the export to change this setting."
        : options.disabled
          ? options.reason || "Unlock this item to change this setting."
          : "";
    const node = el("div", "range-field"),
      heading = el("div", "range-heading"),
      number = el("input"),
      slider = el("input");
    number.type = "number";
    slider.type = "range";
    for (const input of [number, slider]) {
      input.min = min;
      input.max = max;
      input.step = step;
      input.value = value;
      input.setAttribute("aria-label", label);
      input.dataset.control = helpId;
      input.disabled = Boolean(options.disabled || exporting || projectLoading);
      H.attach(input, helpId, reason);
    }
    const update = (source, commit) => {
      if (source.value === "") return;
      const next = M.clamp(source.value, min, max);
      number.value = next;
      slider.value = next;
      setter(next, commit);
    };
    for (const input of [number, slider]) {
      input.addEventListener("input", () => update(input, false));
      input.addEventListener("change", () => update(input, true));
    }
    heading.append(H.label(helpId, label, reason), number);
    node.append(heading, slider);
    return node;
  }
  function check(label, helpId, value, setter, disabled = false) {
    const node = el("label", "check-field"),
      input = el("input");
    input.type = "checkbox";
    input.checked = value;
    input.disabled = disabled || exporting || projectLoading;
    input.dataset.control = helpId;
    input.setAttribute("aria-label", label);
    const reason = () =>
      exporting
        ? "Finish or cancel the export to change this setting."
        : disabled
          ? "Unlock this item to change this setting."
          : "";
    H.attach(input, helpId, reason);
    input.addEventListener("change", () => setter(input.checked));
    node.append(input, H.label(helpId, label, reason));
    return node;
  }
  function edit(fn, message = "Change saved", options = {}) {
    if (exporting || projectLoading) return;
    const before = M.copy(project);
    try {
      fn(project);
      M.normalize(project);
      project.selectedItemId = M.item(project, selectedId) ? selectedId : null;
      if (options.commit !== false) history.push(project);
      errorMessage = "";
      store.schedule(project);
      clearResults();
      if (options.timeline !== false) renderTimeline();
      if (options.context) renderContext();
      updateHistory();
      updateSelectionBox();
      requestPaint();
      if (options.toast) toast(message);
    } catch (error) {
      project = before;
      report(error);
    }
  }
  function setter(fn, label, refresh = false) {
    return (value, commit) =>
      edit(() => fn(value), label, { commit, context: commit && refresh });
  }
  function toast(message) {
    clearTimeout(toastTimer);
    const node = $("undoToast");
    node.replaceChildren(el("span", "", message), B("undo", "Undo", undo));
    node.hidden = false;
    toastTimer = setTimeout(() => {
      node.hidden = true;
    }, 8000);
    announce(message);
  }
  function clearResults() {
    if (!results.length) return;
    for (const result of results) URL.revokeObjectURL(result.url);
    results = [];
    $("outputVideo").pause();
    $("outputVideo").removeAttribute("src");
    $("outputVideo").hidden = true;
    $("previewCanvas").hidden = false;
  }
  function setupEngine() {
    renderer = new Renderer(library);
    mixer = new Audio.AudioMixer(library);
    engine = new Engine(
      () => project,
      library,
      renderer,
      mixer,
      $("previewCanvas"),
      onFrame,
      (state, error) => {
        renderTransport();
        if (state === "error") report(error);
        if (state === "paused" && !exporting && !projectLoading)
          store.schedule(project);
      },
    );
  }
  function requestPaint() {
    if (drawRequest) return;
    drawRequest = requestAnimationFrame(() => {
      drawRequest = 0;
      if (!engine.playing) engine.paint(project, project.playhead);
      updateSelectionBox();
    });
  }
  function resizePreview() {
    const size = project.canvas,
      box = $("stageViewport"),
      availableWidth = box.clientWidth - 24,
      availableHeight = box.clientHeight - 24,
      scale = Math.min(
        availableWidth / size.width,
        availableHeight / size.height,
      );
    const stage = $("stageMedia");
    stage.style.width = Math.max(1, size.width * scale) + "px";
    stage.style.height = Math.max(1, size.height * scale) + "px";
    stage.style.aspectRatio = size.width + "/" + size.height;
    // Match the displayed preview instead of compositing a 960px bitmap into
    // a ~608px viewport. Export resolution is selected independently.
    const resolution = Math.min(
      1,
      960 / Math.max(size.width, size.height),
      scale * Math.min(root.devicePixelRatio || 1, 1.5),
    );
    const preview = $("previewCanvas");
    const w = Math.max(2, Math.round(size.width * resolution)),
      h = Math.max(2, Math.round(size.height * resolution));
    if (preview.width !== w || preview.height !== h) {
      preview.width = w;
      preview.height = h;
    }
    requestPaint();
  }
  function onFrame(t, plan, peak) {
    const label = $("stageFacts");
    if (label)
      label.textContent =
        time(t) +
        " / " +
        time(project.duration) +
        " · " +
        plan.visibleVideoLayers +
        " video layers";
    const playhead = $("timelinePlayhead");
    if (playhead) playhead.style.left = 140 + t * zoom + "px";
    const seek = $("seek");
    if (seek) seek.value = t;
    const transportTime = $("timeLabel");
    if (transportTime) transportTime.textContent = time(t);
    const meter = $("audioMeter");
    if (meter) meter.style.width = Math.min(100, peak * 100) + "%";
    const cut = $("splitButton"),
      value = selected();
    if (cut)
      H.setDisabled(
        cut,
        exporting ||
          projectLoading ||
          !value ||
          M.isLocked(project, value) ||
          t <= value.start + M.MIN ||
          t >= value.end - M.MIN,
        exporting
          ? "Finish or cancel the export first."
          : "Select an unlocked item and move the playhead inside it.",
      );
    updateSelectionBox();
  }
  async function seekTo(value, duringLoad = false) {
    if (projectLoading && !duringLoad) return;
    $("outputVideo").pause();
    $("outputVideo").hidden = true;
    $("previewCanvas").hidden = false;
    await engine.seek(value);
    store.schedule(project);
    renderTransport();
    renderTimeline();
  }
  function selectItem(id, seek = true) {
    selectedId = id;
    project.selectedItemId = id;
    errorMessage = "";
    renderContext();
    renderTimeline();
    updateSelectionBox();
    if (innerWidth < 760) $("contextPanel").classList.add("is-open");
    const value = selected();
    if (seek && value && !M.active(value, project.playhead))
      seekTo(value.start).catch(report);
    else requestPaint();
  }
  function undo() {
    if (exporting) return;
    engine.stop();
    const previous = history.undo();
    if (previous) {
      project = previous;
      selectedId = M.item(project, project.selectedItemId)
        ? project.selectedItemId
        : M.item(project, selectedId)
          ? selectedId
          : project.items[0]?.id;
      store.schedule(project);
      clearResults();
      renderAll();
      seekTo(project.playhead).catch(report);
      toast("Change undone");
    }
  }
  function redo() {
    if (exporting) return;
    engine.stop();
    const next = history.redo();
    if (next) {
      project = next;
      selectedId = M.item(project, project.selectedItemId)
        ? project.selectedItemId
        : M.item(project, selectedId)
          ? selectedId
          : project.items[0]?.id;
      store.schedule(project);
      clearResults();
      renderAll();
      seekTo(project.playhead).catch(report);
    }
  }
  function updateHistory() {
    const old = $("historyButtons");
    if (old)
      old.replaceChildren(
        B("undo", "Undo", undo, {
          id: "undoButton",
          symbol: "↶",
          icon: true,
          disabled: !history.canUndo || exporting,
          reason: "Make an edit before using Undo.",
        }),
        B("redo", "Redo", redo, {
          id: "redoButton",
          symbol: "↷",
          icon: true,
          disabled: !history.canRedo || exporting,
          reason: "Undo an edit before using Redo.",
        }),
      );
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob),
      link = el("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function filename(name) {
    return (name || "Untitled movie")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
      .slice(0, 120);
  }
  function saveProject(copy = false) {
    const data = M.copy(project);
    if (copy) {
      data.id = M.id("project");
      data.name += " copy";
      data.createdAt = Date.now();
    }
    download(
      new Blob([M.serialize(data)], { type: "application/json" }),
      filename(data.name) + ".utvproj",
    );
    announce(copy ? "Project copy downloaded" : "Project downloaded");
  }
  function closeDialog() {
    H.close();
    if (dialogCleanup) {
      dialogCleanup();
      dialogCleanup = null;
    }
    $("studioDialog").close();
    dialogReturn?.focus?.();
  }
  function dialog(title, build) {
    closeDialog();
    dialogReturn = document.activeElement;
    const node = $("studioDialog");
    node.replaceChildren();
    const head = el("header", "dialog-head");
    const titleNode = el("h2", "", title);
    titleNode.id = "dialogTitle";
    head.append(
      titleNode,
      B("close", "Close", closeDialog, { symbol: "×", icon: true }),
    );
    const body = el("div", "dialog-body"),
      foot = el("footer", "dialog-foot");
    node.append(head, body, foot);
    build(body, foot);
    node.showModal();
    return node;
  }
  async function replaceProject(next) {
    if (projectLoading)
      throw new Error("Wait for the current project to finish opening.");
    projectLoading = true;
    renderAll();
    try {
      engine.stop();
      const files = new Map();
      for (const a of next.assets) {
        const existing = project.assets.find(
          (old) =>
            old.name === a.name &&
            old.size === a.size &&
            old.contentHash === a.contentHash,
        );
        if (existing && library.has(existing.id))
          files.set(a.id, library.assets.get(existing.id).file);
      }
      await engine.dispose();
      library.dispose();
      library = new Media.MediaLibrary();
      project = next;
      selectedId = next.selectedItemId || M.mainItems(next)[0]?.id || null;
      assetSelected = M.item(next, selectedId)?.assetId || null;
      const selectedAsset = next.assets.find((a) => a.id === assetSelected);
      mediaTab =
        selectedAsset?.kind ||
        (next.assets.some((a) => a.kind === mediaTab)
          ? mediaTab
          : next.assets[0]?.kind || "video");
      setupEngine();
      for (const a of next.assets)
        if (files.has(a.id)) {
          await library.attach(a, files.get(a.id));
          await store.putFile(a, files.get(a.id));
        }
      await store.restore(project, library);
      history = new M.History(project);
      clearResults();
      store.schedule(project);
      await seekTo(project.playhead, true);
    } finally {
      projectLoading = false;
      renderAll();
    }
  }
  async function startNew() {
    closeDialog();
    await engine.dispose();
    library.dispose();
    await store.clear();
    project = M.createProject();
    history = new M.History(project);
    library = new Media.MediaLibrary();
    selectedId = null;
    assetSelected = null;
    mediaTab = "video";
    importErrors = [];
    importStatus = "";
    setupEngine();
    clearResults();
    renderAll();
  }
  function newProject() {
    if (!project.items.length) {
      startNew().catch(report);
      return;
    }
    dialog("Start a new project", (body, foot) => {
      body.append(
        el(
          "p",
          "muted",
          "Save an editable project file if you want to return to this movie later.",
        ),
      );
      foot.append(
        B("cancel", "Cancel", closeDialog),
        B("newProject", "Start new project", startNew),
        B(
          "saveProject",
          "Save project and start new",
          () => {
            saveProject();
            return startNew();
          },
          { primary: true },
        ),
      );
    });
  }
  function projectMenu() {
    dialog("Project", (body, foot) => {
      body.append(
        B("newProject", "New project", newProject, {
          wrapperClass: "full-width",
        }),
        B(
          "openProject",
          "Open project",
          () => {
            closeDialog();
            $("projectFile").click();
          },
          { wrapperClass: "full-width" },
        ),
        B(
          "saveProject",
          "Save project",
          () => {
            saveProject();
            closeDialog();
          },
          { wrapperClass: "full-width" },
        ),
        B(
          "saveCopy",
          "Save a copy",
          () => {
            saveProject(true);
            closeDialog();
          },
          { wrapperClass: "full-width" },
        ),
      );
      foot.append(
        B(
          "undo",
          "Undo",
          () => {
            closeDialog();
            undo();
          },
          {
            disabled: !history.canUndo || exporting,
            reason: "Make an edit before using Undo.",
          },
        ),
        B(
          "redo",
          "Redo",
          () => {
            closeDialog();
            redo();
          },
          {
            disabled: !history.canRedo || exporting,
            reason: "Undo an edit before using Redo.",
          },
        ),
        el("small", "", saveStatus),
      );
    });
  }
  function helpGuide() {
    dialog("Your movie, in four steps", (body, foot) => {
      for (const [title, description] of [
        [
          "1 · Add media",
          "Add videos to build a sequence. Music and images are stored in your library.",
        ],
        [
          "2 · Arrange",
          "Select anything to edit it. Drag an edge to shorten it, or move the blue playhead and choose Cut here.",
        ],
        [
          "3 · Add effects",
          "Place videos, text, images and blur on top. Every item has its own time range. Sound is independently editable.",
        ],
        [
          "4 · Export",
          "Review your movie and choose a quality. Keep this tab visible while the browser records the movie.",
        ],
      ])
        body.append(group(title, el("p", "muted", description)));
      const shortcuts = el("dl", "shortcut-list");
      for (const [key, result] of [
        ["Space", "Play / pause"],
        ["S", "Cut here"],
        ["Delete", "Delete selected item"],
        ["Ctrl / Command + Z", "Undo"],
        ["Ctrl + Y / Command + Shift + Z", "Redo"],
        ["← / →", "Move one frame; move a focused selection by one pixel"],
        ["Escape", "Close a panel or explanation"],
      ])
        shortcuts.append(el("dt", "", key), el("dd", "", result));
      body.append(shortcuts);
      foot.append(B("close", "Got it", closeDialog, { primary: true }));
    });
  }
  function setStep(step) {
    if (exporting) return;
    project.workflow = step;
    store.schedule(project);
    $("mediaPanel").classList.remove("is-open");
    if (step === "effects" && !selectedId)
      selectedId = M.mainItems(project)[0]?.id;
    renderAll();
  }
  function renderTopbar() {
    const brand = el("a", "brand");
    brand.href = "index.html";
    brand.append(
      el("span", "brand-mark", "UT"),
      el("span", "brand-name", "Video Studio"),
    );
    H.attach(brand, "home");
    const title = el("div", "project-title"),
      input = el("input");
    input.type = "text";
    input.value = project.name;
    input.id = "projectName";
    input.maxLength = 180;
    input.setAttribute("aria-label", "Project name");
    H.attach(input, "projectName");
    input.addEventListener("input", () => {
      project.name = input.value || "Untitled movie";
      store.schedule(project);
    });
    input.addEventListener("change", () => history.push(project));
    title.append(input);
    const saved = el("span", "save-status", saveStatus);
    saved.id = "saveStatus";
    saved.setAttribute("role", "status");
    const undoRow = el("div", "button-row tight");
    undoRow.id = "historyButtons";
    const offline = $("offlineStudioLink");
    if (!offline.dataset.helpId) H.attach(offline, "offline");
    const actions = el("div", "topbar-actions");
    actions.append(
      offline,
      B("help", "Help", helpGuide),
      B(
        "mediaDrawer",
        "Media",
        () => {
          $("mediaPanel").classList.toggle("is-open");
        },
        { wrapperClass: "drawer-action" },
      ),
      B(
        "contextDrawer",
        "Edit",
        () => {
          $("contextPanel").classList.toggle("is-open");
        },
        { wrapperClass: "drawer-action" },
      ),
    );
    $("topbar").replaceChildren(
      brand,
      B("projectMenu", "Project ▾", projectMenu, { id: "projectMenuButton" }),
      title,
      saved,
      undoRow,
      actions,
    );
    updateHistory();
  }
  function renderStepper() {
    const node = $("workflowStepper");
    node.replaceChildren();
    [
      ["media", "Add media", "mediaStep"],
      ["arrange", "Arrange", "arrangeStep"],
      ["effects", "Add effects", "effectsStep"],
      ["export", "Export", "exportStep"],
    ].forEach(([key, label, helpId], i) => {
      if (i) node.append(el("span", "step-connector"));
      const button = B(helpId, label, () => setStep(key), {
        id: "step-" + key,
        disabled:
          exporting ||
          (key !== "media" &&
            !project.items.some(
              (v) => v.kind !== "audio" && v.kind !== "filter",
            )),
        reason: "Add a video or place an image in Main video first.",
        className: project.workflow === key ? "is-active" : "",
      });
      button.firstElementChild.prepend(
        el("span", "step-number", String(i + 1)),
      );
      if (project.workflow === key)
        button.firstElementChild.setAttribute("aria-current", "step");
      node.append(button);
    });
    $("editorRoot").dataset.step = project.workflow;
  }
  function renderTransport() {
    if (!engine) return;
    const disabled = !project.duration || exporting;
    const playback = engine.playing && !exporting;
    const seek = el("input", "seek-field");
    seek.type = "range";
    seek.min = 0;
    seek.max = project.duration;
    seek.step = 1 / project.exportSettings.fps;
    seek.value = project.playhead;
    seek.id = "seek";
    seek.disabled = disabled;
    seek.setAttribute("aria-label", "Movie playhead");
    H.attach(seek, "seek");
    seek.addEventListener("input", () =>
      seekTo(Number(seek.value)).catch(report),
    );
    const label = el("span", "timecode", time(project.playhead));
    label.id = "timeLabel";
    $("transport").replaceChildren(
      B("backOneSecond", "Back 1s", () => seekTo(project.playhead - 1), {
        symbol: "−1s",
        disabled,
        id: "skipBackButton",
        reason: "Add media before moving the playhead.",
      }),
      B(
        playback ? "pause" : "play",
        playback ? "Pause" : "Play",
        () => (playback ? engine.stop() : engine.play()),
        {
          id: "playButton",
          disabled,
          className: "play-button",
          reason: "Add media before playing the movie.",
        },
      ),
      B("forwardOneSecond", "Forward 1s", () => seekTo(project.playhead + 1), {
        symbol: "+1s",
        disabled,
        id: "skipForwardButton",
      }),
      B(
        "frameBack",
        "Previous frame",
        () => seekTo(project.playhead - 1 / project.exportSettings.fps),
        { symbol: "‹", disabled, wrapperClass: "transport-frame" },
      ),
      B(
        "frameForward",
        "Next frame",
        () => seekTo(project.playhead + 1 / project.exportSettings.fps),
        { symbol: "›", disabled, wrapperClass: "transport-frame" },
      ),
      seek,
      label,
      B(
        "previewMute",
        mixer.muted ? "Unmute preview" : "Mute preview",
        () => {
          mixer.setMuted(!mixer.muted);
          renderTransport();
        },
        { symbol: mixer.muted ? "◌" : "♪", id: "muteButton" },
      ),
      B(
        "fullscreen",
        "Fullscreen",
        () =>
          document.fullscreenElement
            ? document.exitFullscreen()
            : $("stageViewport").requestFullscreen(),
        { symbol: "⛶", id: "fullscreenButton" },
      ),
    );
  }
  function drawWaveform(c, source, value = null, gain = 1) {
    c.width = Math.min(
      1600,
      Math.max(80, Math.round(parseFloat(c.style.width) || 320)),
    );
    c.height = 60;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0d6b4f";
    ctx.lineWidth = 1;
    const peaks = source?.waveform || [];
    ctx.beginPath();
    for (let x = 0; x < c.width; x++) {
      let fraction = x / c.width;
      if (value)
        fraction =
          M.sourceTimeAt(value, value.start + fraction * M.span(value)) /
          (source.duration || 1);
      const peak =
        (peaks[
          Math.min(peaks.length - 1, Math.floor(fraction * peaks.length))
        ] || 0) * gain;
      const half = Math.max(0.5, Math.min(29, peak * 28));
      ctx.moveTo(x, 30 - half);
      ctx.lineTo(x, 30 + half);
    }
    ctx.stroke();
  }
  function renderMedia() {
    const node = $("mediaPanel"),
      ready = project.assets.length;
    const actions = el("div", "import-actions");
    actions.append(
      B(
        "addVideos",
        "＋ Add videos",
        () => {
          $("videoFiles").click();
        },
        {
          id: "videoPickerButton",
          primary: project.workflow === "media" && !M.mainItems(project).length,
          disabled: importing || exporting,
          wrapperClass: "full-width",
        },
      ),
    );
    const secondary = el("div", "import-secondary");
    secondary.append(
      B(
        "addMusic",
        "Add music",
        () => {
          $("musicFiles").click();
        },
        { id: "musicPickerButton", disabled: importing || exporting },
      ),
      B(
        "addImages",
        "Add images",
        () => {
          $("imageFiles").click();
        },
        { id: "imagePickerButton", disabled: importing || exporting },
      ),
    );
    actions.append(
      secondary,
      B("autoMovie", "Make a movie for me", autoMovieDialog, {
        id: "autoMovieButton",
        disabled: !project.assets.some((a) => a.kind !== "audio") || exporting,
        reason: "Import videos or images before making a draft.",
        wrapperClass: "full-width",
      }),
    );
    const tabs = el("div", "media-tabs");
    for (const [kind, label] of [
      ["video", "Videos"],
      ["audio", "Music"],
      ["image", "Images"],
    ])
      tabs.append(
        B(
          "mediaTab",
          label,
          () => {
            mediaTab = kind;
            renderMedia();
          },
          { className: mediaTab === kind ? "is-active" : "" },
        ),
      );
    const assets = el("div", "media-assets");
    for (const source of project.assets.filter((a) => a.kind === mediaTab)) {
      const card = el(
        "article",
        "asset-card" + (assetSelected === source.id ? " asset-selected" : ""),
      );
      card.dataset.assetId = source.id;
      card.draggable = true;
      card.addEventListener("dragstart", (e) =>
        e.dataTransfer.setData("application/x-utv-asset", source.id),
      );
      if (source.thumbnail) {
        const image = el("img", "asset-preview");
        image.src = source.thumbnail;
        image.alt = source.name;
        card.append(image);
      } else {
        const wave = el("canvas", "asset-preview");
        drawWaveform(wave, source);
        card.append(wave);
      }
      card.append(
        el("div", "asset-name", source.name),
        el(
          "div",
          "asset-meta",
          (source.mimeType || source.name.split(".").pop())
            .replace(/^(video|audio|image)\//, "")
            .toUpperCase() +
            " · " +
            (source.kind === "image"
              ? source.width +
                " × " +
                source.height +
                " · " +
                (source.transparent ? "Transparency" : "Opaque")
              : time(source.duration)) +
            " · " +
            bytes(source.size),
        ),
      );
      if (!library.has(source.id))
        card.append(
          el("p", "notice error", "Original file needed"),
          B("relink", "Relink file", () => relinkDialog(source), {
            wrapperClass: "full-width",
          }),
        );
      else if (source.kind === "audio")
        card.append(
          B("startHere", "Place music…", () => musicDialog([source.id]), {
            wrapperClass: "full-width",
          }),
        );
      else
        card.append(
          row(
            B("addToMovie", "Add to movie", () => {
              edit(
                () => {
                  const value = M.addMedia(project, source.id);
                  selectedId = value.id;
                },
                "Media added",
                { context: true },
              );
              renderStepper();
            }),
            B(
              source.kind === "image" ? "addImage" : "videoOverlay",
              "On top",
              () =>
                source.kind === "image"
                  ? addNewItem("image", { assetId: source.id })
                  : overlayDialog(source.id),
            ),
          ),
        );
      assets.append(card);
    }
    if (!assets.children.length)
      assets.append(
        el(
          "p",
          "empty-note",
          mediaTab === "video"
            ? "Your videos will appear here. They are added to Main video in the order you choose."
            : mediaTab === "audio"
              ? "Add an MP3 to start your soundtrack."
              : "Add pictures for a slideshow or an image overlay.",
        ),
      );
    const progress = el(
      "p",
      "import-progress",
      importStatus || ready + " files ready",
    );
    progress.id = "importProgress";
    progress.setAttribute("role", "status");
    node.replaceChildren(
      row(el("h2", "", "Your media"), el("span", "badge", String(ready))),
      el("p", "media-intro", "Start with a few favourite moments."),
      actions,
      progress,
      tabs,
      assets,
    );
    for (const failure of importErrors)
      node.append(
        group(
          "",
          el("strong", "", failure.name),
          el("p", "notice error", failure.reason),
          B("addVideos", "Choose another file", () =>
            $(
              failure.kind === "audio"
                ? "musicFiles"
                : failure.kind === "image"
                  ? "imageFiles"
                  : "videoFiles",
            ).click(),
          ),
        ),
      );
    node.append(
      el(
        "p",
        "media-hint",
        "Media is stored here. Drag a file to the timeline, or use its buttons. Your media, edits and exports stay on this device.",
      ),
    );
  }
  async function importFiles(files, kind) {
    if (importing || exporting) return;
    const previousPlayhead = project.playhead;
    const firstMovieImport = M.mainItems(project).length === 0;
    importing = true;
    importErrors = [];
    const added = [];
    engine.stop();
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        importStatus = "Reading file " + (i + 1) + " of " + files.length;
        renderMedia();
        try {
          const descriptor = await library.read(file, kind),
            source = M.addAsset(project, descriptor);
          if (source.id !== descriptor.id) {
            const runtime = library.assets.get(descriptor.id);
            if (!library.has(source.id)) library.assets.set(source.id, runtime);
            else URL.revokeObjectURL(runtime.url);
            library.assets.delete(descriptor.id);
          }
          await store.putFile(source, file);
          added.push(source.id);
          if (source.kind === "video") {
            const value = M.addMedia(project, source.id, {
              index: insertIndex ?? project.mainOrder.length,
            });
            if (insertIndex !== null) insertIndex++;
            selectedId = value.id;
          }
          mediaTab = source.kind;
          store.schedule(project);
          renderAll();
        } catch (error) {
          importErrors.push({ name: file.name, reason: error.message, kind });
        }
      }
      project.selectedItemId = selectedId;
      history.push(project);
      importStatus =
        added.length +
        (added.length === 1 ? " file ready" : " files ready") +
        (importErrors.length
          ? " · " + importErrors.length + " need attention"
          : "");
    } finally {
      importing = false;
      insertIndex = null;
      if (firstMovieImport && M.mainItems(project).length) {
        zoom = M.clamp(
          Math.floor(
            (document.querySelector(".editor-workspace").clientWidth - 200) /
              Math.max(1, project.duration) /
              5,
          ) * 5,
          15,
          150,
        );
      }
      renderAll();
      if (added.length)
        await seekTo(
          firstMovieImport && kind === "video" ? 0 : previousPlayhead,
        );
    }
    if (kind === "audio" && added.length) musicDialog(added);
  }
  function setupFileInputs() {
    const container = $("fileInputs");
    for (const [id, accept, kind] of [
      ["videoFiles", "video/*,.mp4,.webm,.mov,.m4v,.ogv", "video"],
      ["musicFiles", "audio/mpeg,.mp3", "audio"],
      [
        "imageFiles",
        "image/png,image/jpeg,image/bmp,image/gif,image/webp,.png,.jpg,.jpeg,.bmp,.gif,.webp",
        "image",
      ],
      ["projectFile", ".utvproj,application/json", "project"],
    ]) {
      const input = el("input");
      input.type = "file";
      input.id = id;
      input.accept = accept;
      input.multiple = kind !== "project";
      input.addEventListener("change", async () => {
        const files = [...input.files];
        input.value = "";
        if (!files.length) return;
        try {
          if (kind === "project")
            await replaceProject(M.parseProject(await files[0].text()));
          else await importFiles(files, kind);
        } catch (error) {
          report(error);
        }
      });
      container.append(input);
    }
  }
  function relinkDialog(source) {
    const input = el("input");
    input.type = "file";
    input.accept =
      source.kind === "video"
        ? "video/*"
        : source.kind === "audio"
          ? "audio/mpeg,.mp3"
          : "image/*";
    input.addEventListener("change", async () => {
      try {
        if (input.files[0]) {
          await library.relink(source, input.files[0]);
          await store.putFile(source, input.files[0]);
          renderAll();
          await seekTo(project.playhead);
        }
      } catch (error) {
        report(error);
      }
    });
    input.click();
  }
  function renderAll() {
    renderTopbar();
    renderStepper();
    renderMedia();
    renderContext();
    renderTimeline();
    renderTransport();
    $("stageEmpty").hidden = project.items.some(
      (i) => i.kind !== "audio" && i.kind !== "filter",
    );
    $("stageHead").replaceChildren(
      Object.assign(
        el(
          "span",
          "stage-title",
          selected() ? "Editing: " + named(selected()) : "Movie preview",
        ),
        { id: "stageTitle" },
      ),
      Object.assign(el("span", "stage-facts"), { id: "stageFacts" }),
    );
    resizePreview();
    requestPaint();
  }
  function cutSelected() {
    const value = selected();
    if (!value) return;
    engine.stop();
    edit(
      () => {
        const right = M.splitItem(project, value.id, project.playhead);
        if (!right)
          throw new Error(
            "Move the playhead inside the selected item, at least 0.01 seconds from each end.",
          );
        selectedId = right.id;
      },
      "Item cut into two pieces",
      { context: true, toast: true },
    );
  }
  function duplicateSelected() {
    if (!selected()) return;
    engine.stop();
    edit(
      () => {
        const value = M.duplicateItem(project, selectedId);
        if (value) selectedId = value.id;
      },
      "Item duplicated",
      { context: true, toast: true },
    );
  }
  function deleteSelected() {
    const key = selectedId;
    if (!key) return;
    engine.stop();
    edit(
      () => {
        if (M.deleteItem(project, key)) selectedId = null;
      },
      "Item deleted",
      { context: true, toast: true },
    );
  }
  function renderTimeline() {
    const value = selected(),
      locked = value && M.isLocked(project, value),
      canCut =
        value &&
        project.playhead > value.start + M.MIN &&
        project.playhead < value.end - M.MIN;
    const zoomLabel = el("label", "zoom-label");
    zoomLabel.append(H.label("zoom", "Zoom"));
    const zoomInput = el("input");
    zoomInput.type = "range";
    zoomInput.min = 15;
    zoomInput.max = 300;
    zoomInput.step = 5;
    zoomInput.value = zoom;
    zoomInput.setAttribute("aria-label", "Timeline zoom");
    H.attach(zoomInput, "zoom");
    zoomInput.addEventListener("input", () => {
      zoom = Number(zoomInput.value);
      renderTimeline();
    });
    zoomLabel.append(zoomInput);
    $("timelineHead").replaceChildren(
      el("h2", "", "Your movie"),
      row(
        B("cutHere", "Cut here", cutSelected, {
          id: "splitButton",
          disabled: !canCut || locked || exporting,
          reason: locked
            ? "Unlock this item first."
            : "Select an item and move the playhead inside it.",
        }),
        B("duplicateItem", "Duplicate", duplicateSelected, {
          disabled: !value || locked || exporting,
          wrapperClass: "timeline-secondary",
          reason: "Select an unlocked item first.",
        }),
        B("deleteItem", "Delete", deleteSelected, {
          disabled: !value || locked || exporting,
          className: "danger",
          wrapperClass: "timeline-secondary",
          reason: "Select an unlocked item first.",
        }),
        zoomLabel,
      ),
    );
    const content = $("timelineContent");
    const scroll = $("timelineViewport").scrollLeft;
    content.replaceChildren();
    const width = Math.max(720, project.duration * zoom + 250);
    content.style.width = width + "px";
    const ruler = el("div", "timeline-ruler");
    ruler.tabIndex = 0;
    ruler.setAttribute("aria-label", "Movie time ruler");
    H.attach(ruler, "seek");
    ruler.append(el("span", "ruler-label", "Current moment ↓"));
    const interval = zoom > 120 ? 1 : zoom > 45 ? 2 : 5;
    for (let t = 0; t <= (width - 140) / zoom; t += interval) {
      const mark = el("span", "ruler-mark", time(t));
      mark.style.left = 140 + t * zoom + "px";
      ruler.append(mark);
    }
    ruler.addEventListener("pointerdown", (event) => {
      if (event.clientX - content.getBoundingClientRect().left < 140) return;
      beginScrub(event);
    });
    ruler.addEventListener("keydown", (event) => {
      if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        seekTo(
          project.playhead +
            (event.key === "ArrowLeft" ? -1 : 1) / project.exportSettings.fps,
        ).catch(report);
      }
    });
    content.append(ruler);
    addTrackRow(M.layer(project, "main"), M.mainItems(project), 0);
    const tops = el("div", "group-heading");
    tops.append(el("span", "", "Things on top"));
    content.append(tops);
    for (const track of project.layers
      .filter((l) => l.kind !== "sound" && l.id !== "main")
      .sort((a, b) => a.order - b.order))
      addTrackRow(
        track,
        project.items.filter((i) => i.layerId === track.id),
        0,
      );
    const soundGroup = el("div", "group-heading"),
      soundHeading = el("span", "", "Sound");
    soundHeading.append(
      B(
        "expandSound",
        soundExpanded ? "Collapse sound" : "Expand sound",
        () => {
          soundExpanded = !soundExpanded;
          renderTimeline();
        },
        { symbol: soundExpanded ? "▾" : "▸", id: "expandSoundButton" },
      ),
    );
    soundGroup.append(
      soundHeading,
      el(
        "small",
        "",
        project.items.filter((i) => i.kind === "audio").length +
          " independent sounds",
      ),
    );
    content.append(soundGroup);
    if (soundExpanded) {
      for (const track of project.layers
        .filter((l) => l.kind === "sound")
        .sort((a, b) => a.order - b.order)) {
        const packed = [];
        for (const sound of project.items
          .filter((i) => i.layerId === track.id)
          .sort((a, b) => a.start - b.start)) {
          let lane = packed.find(
            (list) => list.at(-1).end <= sound.start + 0.00001,
          );
          if (!lane) {
            lane = [];
            packed.push(lane);
          }
          lane.push(sound);
        }
        if (!packed.length) packed.push([]);
        packed.forEach((list, index) => addTrackRow(track, list, index));
      }
    }
    if (!project.items.length)
      content.append(
        el(
          "p",
          "timeline-tip",
          "Your videos appear here in order. This line shows the current moment. Select anything to edit it.",
        ),
      );
    const playhead = el("div", "timeline-playhead");
    playhead.id = "timelinePlayhead";
    playhead.style.left = 140 + project.playhead * zoom + "px";
    content.append(playhead);
    if (showCuts) {
      try {
        for (const range of M.segmentRanges(
          project.duration,
          project.exportSettings.segmentInterval,
          project.exportSettings.fps,
        ).slice(1)) {
          const mark = el("div", "segment-cut");
          mark.style.left = 140 + range.start * zoom + "px";
          mark.append(el("span", "", time(range.start)));
          content.append(mark);
        }
      } catch {}
    }
    $("timelineViewport").scrollLeft = scroll;
    function addTrackRow(track, items, lane) {
      const line = el(
        "div",
        "track-row" + (track.kind === "sound" ? " audio-row" : ""),
      );
      line.dataset.layerId = track.id;
      line.addEventListener("dragover", (event) => {
        if ([...event.dataTransfer.types].includes("application/x-utv-asset"))
          event.preventDefault();
      });
      line.addEventListener("drop", (event) => {
        const assetId = event.dataTransfer.getData("application/x-utv-asset");
        if (!assetId) return;
        event.preventDefault();
        event.stopPropagation();
        const source = M.asset(project, assetId),
          start = Math.max(
            0,
            (event.clientX - content.getBoundingClientRect().left - 140) / zoom,
          );
        edit(
          () => {
            if (source.kind === "image" && track.id !== "main") {
              const value = M.addLayerItem(project, "image", {
                assetId,
                start,
              });
              selectedId = value.id;
            } else {
              const value = M.addMedia(project, assetId, {
                layerId: source.kind === "audio" ? "music" : track.id,
                start,
              });
              selectedId = value.id;
            }
          },
          "Media placed",
          { context: true, toast: true },
        );
        renderStepper();
      });
      const head = el("div", "track-heading");
      head.append(
        el("span", "track-name", track.name + (lane ? " " + (lane + 1) : "")),
        B(
          "layerSettings",
          "Settings for " + track.name,
          () => layerDialog(track.id),
          { symbol: "⋯" },
        ),
      );
      line.append(head);
      for (const entry of items) {
        const source = M.asset(project, entry.assetId),
          card = el(
            "div",
            "timeline-item item-" +
              entry.kind +
              (selectedId === entry.id ? " is-selected" : "") +
              (!entry.enabled || !track.visible ? " is-disabled" : ""),
          );
        card.dataset.itemId = entry.id;
        card.tabIndex = 0;
        card.setAttribute("role", "option");
        card.setAttribute("aria-selected", String(selectedId === entry.id));
        card.setAttribute(
          "aria-label",
          named(entry) + ", " + time(entry.start) + " to " + time(entry.end),
        );
        H.attach(card, "selectItem");
        card.style.left = 140 + entry.start * zoom + "px";
        card.style.width = Math.max(14, M.span(entry) * zoom) + "px";
        if (source?.thumbnail) {
          const poster = el("div", "clip-poster");
          poster.style.backgroundImage = 'url("' + source.thumbnail + '")';
          card.append(poster);
        }
        card.append(
          el("span", "clip-label", (entry.locked ? "🔒 " : "") + named(entry)),
          el(
            "span",
            "clip-time",
            time(M.span(entry)) +
              (entry.playbackRate !== 1
                ? " · " + entry.playbackRate + "×"
                : ""),
          ),
        );
        if (
          source?.waveform?.length &&
          (entry.kind === "audio" || entry.kind === "video")
        ) {
          const wave = el("canvas", "clip-waveform");
          wave.style.width = Math.max(20, M.span(entry) * zoom - 4) + "px";
          drawWaveform(wave, source, entry.kind === "audio" ? entry : null);
          card.append(wave);
          if (entry.kind === "video") {
            const badge = el(
              "span",
              "clip-time",
              entry.linkEnabled ? "↔ Sound linked" : "↔ Original sound",
            );
            badge.style.position = "absolute";
            badge.style.right = "4px";
            badge.style.bottom = "0";
            card.append(badge);
          }
        }
        for (const fx of entry.effects.filter((f) => f.enabled)) {
          const strip = el("div", "effect-strip");
          strip.style.left = (fx.start / M.span(entry)) * 100 + "%";
          strip.style.width =
            ((Math.min(M.span(entry), fx.end) - fx.start) / M.span(entry)) *
              100 +
            "%";
          card.append(strip);
        }
        for (const edge of ["start", "end"]) {
          const handle = B(
            edge === "start" ? "shortenStart" : "shortenEnd",
            edge === "start" ? "Change the start" : "Change the end",
            null,
            {
              disabled: M.isLocked(project, entry) || exporting,
              reason: "Unlock this item to trim it.",
              wrapperClass: "trim-handle " + edge,
            },
          );
          handle.firstElementChild.textContent = "";
          handle.firstElementChild.addEventListener("pointerdown", (event) => {
            event.stopPropagation();
            beginTimelineDrag(event, entry.id, edge);
          });
          handle.firstElementChild.addEventListener("keydown", (event) => {
            if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              edit(
                () =>
                  M.trimItem(
                    project,
                    entry.id,
                    edge,
                    entry[edge] +
                      (event.key === "ArrowLeft" ? -1 : 1) /
                        project.exportSettings.fps,
                  ),
                "Item shortened",
                { context: true, toast: true },
              );
            }
          });
          card.append(handle);
        }
        card.addEventListener("pointerdown", (event) => {
          if (event.target.closest("button")) return;
          beginTimelineDrag(event, entry.id, "move");
        });
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectItem(entry.id);
          } else if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
            event.preventDefault();
            const delta =
              (event.key === "ArrowLeft" ? -1 : 1) / project.exportSettings.fps;
            edit(
              () => M.moveItem(project, entry.id, entry.start + delta),
              "Item moved",
              { context: true, toast: true },
            );
          }
        });
        line.append(card);
      }
      if (track.id === "main") {
        const ordered = M.mainItems(project);
        if (!ordered.length) {
          const add = B("addHere", "+ Add here", () => addHereDialog(0), {
            wrapperClass: "timeline-add",
          });
          add.style.left = "200px";
          line.append(add);
        }
        for (let i = 0; i < ordered.length; i++) {
          const entry = ordered[i],
            end = entry.end;
          const add = B("addHere", "+ Add here", () => addHereDialog(i + 1), {
            wrapperClass: "timeline-add",
          });
          add.style.left = 140 + end * zoom + "px";
          add.style.top = "37px";
          line.append(add);
          if (i > 0) {
            const transition = project.transitions.find(
                (t) => t.toId === entry.id,
              ),
              control = B(
                "transition",
                transition
                  ? "Edit " + transition.type + " transition"
                  : "Add transition",
                () => transitionDialog(entry.id),
                {
                  symbol: transition ? "◈" : "◇",
                  wrapperClass: "transition-button",
                },
              );
            control.style.left = 140 + entry.start * zoom + "px";
            line.append(control);
          }
        }
      }
      content.append(line);
    }
  }
  function beginTimelineDrag(event, id, mode) {
    if (exporting || event.button !== 0) return;
    const value = M.item(project, id);
    selectedId = id;
    project.selectedItemId = id;
    renderContext();
    if (M.isLocked(project, value)) {
      renderTimeline();
      return;
    }
    event.preventDefault();
    engine.stop();
    H.close();
    drag = {
      type: "timeline",
      id,
      mode,
      x: event.clientX,
      y: event.clientY,
      before: M.copy(project),
      start: value.start,
      end: value.end,
      layerId: value.layerId,
      moved: false,
    };
    renderTimeline();
  }
  function beginScrub(event) {
    event.preventDefault();
    drag = { type: "scrub" };
    updateDrag(event);
  }
  function updateDrag(event) {
    if (!drag) return;
    if (drag.type === "scrub") {
      const timeValue =
        (event.clientX -
          $("timelineContent").getBoundingClientRect().left -
          140) /
        zoom;
      seekTo(timeValue).catch(report);
      return;
    }
    if (drag.type === "timeline") {
      const delta = (event.clientX - drag.x) / zoom;
      drag.moved =
        drag.moved ||
        Math.abs(event.clientX - drag.x) > 3 ||
        Math.abs(event.clientY - drag.y) > 15;
      if (!drag.moved) return;
      project = M.copy(drag.before);
      const value = M.item(project, drag.id),
        raw = (drag.mode === "end" ? drag.end : drag.start) + delta,
        next = event.shiftKey
          ? Math.max(0, raw)
          : M.snapTime(project, raw, drag.id, 8 / zoom);
      try {
        if (drag.mode === "move") {
          const target = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest("[data-layer-id]");
          let layerId = target?.dataset.layerId || drag.layerId;
          if (value.kind === "video" && !M.VIDEO_LAYERS.includes(layerId))
            layerId = drag.layerId;
          if (value.kind !== "video" && value.kind !== "audio")
            layerId = drag.layerId;
          if (
            value.kind === "audio" &&
            M.layer(project, layerId)?.kind !== "sound"
          )
            layerId = drag.layerId;
          M.moveItem(project, value.id, next, layerId);
        } else M.trimItem(project, value.id, drag.mode, next);
        errorMessage = "";
        renderTimeline();
        requestPaint();
        showDragReadout(
          event,
          time(value.start) +
            " – " +
            time(value.end) +
            " · " +
            time(M.span(value)),
        );
      } catch (error) {
        project = M.copy(drag.before);
        showDragReadout(event, error.message);
      }
      const viewport = $("timelineViewport").getBoundingClientRect();
      if (event.clientX > viewport.right - 30)
        $("timelineViewport").scrollLeft += 12;
      if (event.clientX < viewport.left + 160)
        $("timelineViewport").scrollLeft = Math.max(
          0,
          $("timelineViewport").scrollLeft - 12,
        );
    } else if (drag.type === "stage") {
      const value = M.item(project, drag.id);
      if (!value) return;
      const sx = project.canvas.width / $("stageMedia").clientWidth,
        sy = project.canvas.height / $("stageMedia").clientHeight;
      let dx = (event.clientX - drag.x) * sx,
        dy = (event.clientY - drag.y) * sy;
      const tr = M.copy(drag.transform),
        handle = drag.handle;
      drag.moved = true;
      if (!handle) {
        tr.x += dx;
        tr.y += dy;
      } else {
        const angle = (-tr.rotation * Math.PI) / 180,
          localX = dx * Math.cos(angle) - dy * Math.sin(angle),
          localY = dx * Math.sin(angle) + dy * Math.cos(angle);
        dx = localX;
        dy = localY;
        if (handle.includes("e")) tr.width = Math.max(4, tr.width + dx);
        if (handle.includes("s")) tr.height = Math.max(4, tr.height + dy);
        if (handle.includes("w")) {
          const width = Math.max(4, tr.width - dx);
          tr.x += tr.width - width;
          tr.width = width;
        }
        if (handle.includes("n")) {
          const height = Math.max(4, tr.height - dy);
          tr.y += tr.height - height;
          tr.height = height;
        }
        if (value.kind === "text" && handle.length === 2)
          value.text.size = Math.max(
            4,
            drag.fontSize * (tr.height / drag.transform.height),
          );
      }
      value.transform = tr;
      updateSelectionBox();
      requestPaint();
      showDragReadout(
        event,
        Math.round(tr.x) +
          ", " +
          Math.round(tr.y) +
          " · " +
          Math.round(tr.width) +
          " × " +
          Math.round(tr.height),
      );
    }
  }
  function finishDrag() {
    if (!drag) return;
    const finished = drag;
    drag = null;
    $("dragReadout")?.remove();
    if (finished.moved) {
      M.normalize(project);
      history.push(project);
      store.schedule(project);
      clearResults();
      renderTimeline();
      renderContext();
      updateHistory();
      toast(
        finished.type === "stage"
          ? "Position updated"
          : finished.mode === "move"
            ? "Item moved"
            : "Item shortened",
      );
    } else if (finished.type === "timeline") selectItem(finished.id);
  }
  function showDragReadout(event, text) {
    let node = $("dragReadout");
    if (!node) {
      node = el("div", "drag-readout");
      node.id = "dragReadout";
      document.body.append(node);
    }
    node.textContent = text;
    node.style.left =
      Math.max(12, Math.min(innerWidth - 280, event.clientX + 12)) + "px";
    node.style.top = Math.min(innerHeight - 45, event.clientY + 18) + "px";
  }
  function updateSelectionBox() {
    const box = $("interactionBox"),
      value = selected();
    if ($("stageTitle"))
      $("stageTitle").textContent = value
        ? "Editing: " + named(value)
        : "Movie preview";
    const summary = $("contextPanel").querySelector(".selection-summary h2");
    if (summary && value)
      summary.textContent =
        "Editing " +
        (value.kind === "video" ? "" : value.kind + ": ") +
        named(value);
    if (
      !value?.transform ||
      !M.active(value, Math.min(project.playhead, project.duration - 1e-7)) ||
      exporting ||
      !value.enabled
    ) {
      box.hidden = true;
      $("safeArea").hidden = true;
      return;
    }
    const tr = value.transform;
    box.hidden = false;
    box.classList.toggle("filter-selection", value.kind === "filter");
    box.style.left = (tr.x / project.canvas.width) * 100 + "%";
    box.style.top = (tr.y / project.canvas.height) * 100 + "%";
    box.style.width = (tr.width / project.canvas.width) * 100 + "%";
    box.style.height = (tr.height / project.canvas.height) * 100 + "%";
    box.style.transform = "rotate(" + tr.rotation + "deg)";
    box.setAttribute("aria-label", "Move " + named(value));
    box.dataset.itemId = value.id;
    $("safeArea").hidden = !["text", "credits"].includes(value.kind);
    const caption = box.querySelector(".selection-caption");
    if (caption) caption.textContent = named(value).slice(0, 45);
    for (const handle of box.querySelectorAll(".resize-handle"))
      handle.hidden = M.isLocked(project, value);
  }
  function setupStage() {
    const box = $("interactionBox");
    box.tabIndex = 0;
    H.attach(box, "moveSelection");
    box.append(el("span", "selection-caption"));
    for (const direction of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
      const handle = B("resizeItem", "Resize " + direction, null, {
        wrapperClass: "resize-handle",
      });
      handle.dataset.handle = direction;
      handle.firstElementChild.textContent = "";
      handle.firstElementChild.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        beginStage(event, direction);
      });
      handle.firstElementChild.addEventListener("keydown", (event) => {
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
          const value = selected();
          if (!value || M.isLocked(project, value)) return;
          edit(
            () => {
              if (event.key === "ArrowLeft")
                value.transform.width = Math.max(4, value.transform.width - 1);
              if (event.key === "ArrowRight") value.transform.width++;
              if (event.key === "ArrowUp")
                value.transform.height = Math.max(
                  4,
                  value.transform.height - 1,
                );
              if (event.key === "ArrowDown") value.transform.height++;
            },
            "Size updated",
            { context: true },
          );
        }
      });
      box.append(handle);
    }
    box.addEventListener("pointerdown", (event) => {
      if (!event.target.closest("button")) beginStage(event);
    });
    box.addEventListener("keydown", (event) => {
      const value = selected();
      if (!value || M.isLocked(project, value)) return;
      const move = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[event.key];
      if (move) {
        event.preventDefault();
        event.stopPropagation();
        edit(
          () => {
            value.transform.x += move[0] * (event.shiftKey ? 10 : 1);
            value.transform.y += move[1] * (event.shiftKey ? 10 : 1);
          },
          "Position updated",
          { context: true },
        );
      }
    });
    $("previewCanvas").addEventListener("pointerdown", (event) => {
      const rect = $("stageMedia").getBoundingClientRect(),
        x = ((event.clientX - rect.left) / rect.width) * project.canvas.width,
        y = ((event.clientY - rect.top) / rect.height) * project.canvas.height;
      const hit = M.visibleItems(project, project.playhead)
        .reverse()
        .find((value) => {
          if (!value.transform) return false;
          const tr = value.transform,
            angle = (-tr.rotation * Math.PI) / 180,
            dx = x - tr.x - tr.width / 2,
            dy = y - tr.y - tr.height / 2,
            xx = dx * Math.cos(angle) - dy * Math.sin(angle),
            yy = dx * Math.sin(angle) + dy * Math.cos(angle);
          return Math.abs(xx) <= tr.width / 2 && Math.abs(yy) <= tr.height / 2;
        });
      if (hit) selectItem(hit.id, false);
    });
    document.addEventListener("pointermove", updateDrag);
    document.addEventListener("pointerup", finishDrag);
    document.addEventListener("pointercancel", () => {
      if (drag?.before) project = drag.before;
      drag = null;
      $("dragReadout")?.remove();
      renderAll();
    });
    function beginStage(event, handle = null) {
      const value = selected();
      if (
        !value?.transform ||
        M.isLocked(project, value) ||
        exporting ||
        event.button !== 0
      )
        return;
      event.preventDefault();
      engine.stop();
      H.close();
      drag = {
        type: "stage",
        id: value.id,
        handle,
        x: event.clientX,
        y: event.clientY,
        transform: M.copy(value.transform),
        fontSize: value.text?.size,
        before: M.copy(project),
        moved: false,
      };
    }
  }
  function layerDialog(layerId) {
    const track = M.layer(project, layerId);
    dialog(track.name + " settings", (body, foot) => {
      body.append(
        field(
          "Layer name",
          "renameLayer",
          track.name,
          setter((v) => {
            track.name = v;
            renderTimeline();
          }, "Layer renamed"),
          { type: "text", maxLength: 180 },
        ),
        check("Show layer", "showLayer", track.visible, (v) =>
          edit(() => {
            track.visible = v;
          }, "Layer visibility changed"),
        ),
        check("Lock layer", "lockItem", track.locked, (v) =>
          edit(
            () => {
              track.locked = v;
            },
            "Layer lock changed",
            { context: true },
          ),
        ),
        check("Mute layer sound", "muteItem", track.muted, (v) =>
          edit(() => {
            track.muted = v;
          }, "Layer sound changed"),
        ),
        check("Solo layer", "soloLayer", track.solo, (v) =>
          edit(() => {
            track.solo = v;
          }, "Solo changed"),
        ),
      );
      body.append(
        row(
          B("moveFront", "Move in front", () => moveLayer(layerId, 1), {
            disabled: M.VIDEO_LAYERS.includes(layerId),
            reason:
              "Video tracks keep their order. Move video items between tracks instead.",
          }),
          B("moveBehind", "Move behind", () => moveLayer(layerId, -1), {
            disabled: M.VIDEO_LAYERS.includes(layerId),
            reason:
              "Video tracks keep their order. Move video items between tracks instead.",
          }),
        ),
      );
      foot.append(
        B(
          "close",
          "Done",
          () => {
            closeDialog();
            renderContext();
          },
          { primary: true },
        ),
      );
    });
  }
  function moveLayer(layerId, direction) {
    edit(
      () => {
        const track = M.layer(project, layerId),
          ordered = project.layers
            .filter((l) => (l.kind === "sound") === (track.kind === "sound"))
            .sort((a, b) => a.order - b.order),
          index = ordered.indexOf(track),
          other = ordered[index + direction];
        if (!other) return;
        const next = other.order + direction * 0.5;
        track.order = next;
      },
      "Layer order changed",
      { context: true },
    );
  }
  function conflicts() {
    return M.videoConflicts(project);
  }
  function fixConflicts() {
    edit(
      () => {
        for (const key of ["overlay-1", "overlay-2"]) {
          let end = 0;
          for (const value of project.items
            .filter((i) => i.layerId === key && i.kind === "video")
            .sort((a, b) => a.start - b.start)) {
            if (value.start < end) {
              if (M.isLocked(project, value))
                throw new Error(
                  "Unlock the overlapping item before fixing its time.",
                );
              const siblings = M.related(project, value),
                delta = end - value.start;
              if (siblings.some((i) => M.isLocked(project, i)))
                throw new Error(
                  "Unlock the linked item before fixing its time.",
                );
              for (const sibling of siblings) {
                sibling.start += delta;
                sibling.end += delta;
              }
            }
            end = value.end;
          }
        }
      },
      "Time conflicts fixed",
      { context: true, toast: true },
    );
  }
  function addNewItem(kind, options = {}) {
    const previous = selected();
    edit(
      () => {
        const value = M.addLayerItem(project, kind, options);
        if (value.kind === "filter" && previous)
          value.filter.targetLayerId = previous.layerId;
        if (value.text)
          value.text.size =
            project.canvas.height *
            (value.text.preset === "title" ? 0.1 : 0.055);
        selectedId = value.id;
        project.workflow = "effects";
      },
      kind === "filter"
        ? "Blur area added"
        : kind === "credits"
          ? "Credits added"
          : "Item added",
      { context: true, toast: true },
    );
    renderStepper();
    closeDialog();
  }
  function onTopCards() {
    const grid = el("div", "on-top-grid");
    for (const [helpId, title, symbol, description, action] of [
      [
        "videoOverlay",
        "Video",
        "▤",
        "Mix another video over this one.",
        () => overlayDialog(),
      ],
      [
        "addText",
        "Text",
        "T",
        "Add a title, caption or subtitle.",
        () => addNewItem("text"),
      ],
      [
        "addImage",
        "Image",
        "▧",
        "Add a picture or transparent PNG.",
        () => imageDialog(),
      ],
      [
        "blurArea",
        "Blur area",
        "▦",
        "Blur a chosen part of the picture.",
        () => addNewItem("filter"),
      ],
    ]) {
      const button = B(helpId, title, action);
      button.firstElementChild.replaceChildren(
        el("span", "card-symbol", symbol),
        el("strong", "", title),
        el("small", "", description),
      );
      grid.append(button);
    }
    return grid;
  }
  function onTopDialog() {
    dialog("Add on top", (body, foot) => {
      body.append(onTopCards(), B("addCredits", "Credits", creditsDialog));
      foot.append(B("cancel", "Cancel", closeDialog));
    });
  }
  function renderContext() {
    const node = $("contextPanel"),
      scroll = node.scrollTop,
      value = selected(),
      locked = value && M.isLocked(project, value);
    node.replaceChildren();
    const mobile = el("div", "mobile-context-title");
    mobile.append(
      el("strong", "", "Editing controls"),
      B(
        "close",
        "Close editing controls",
        () => node.classList.remove("is-open"),
        { symbol: "×" },
      ),
    );
    node.append(mobile);
    const summary = el("div", "selection-summary");
    summary.append(
      el(
        "h2",
        "",
        value
          ? "Editing " +
              (value.kind === "video" ? "" : value.kind + ": ") +
              named(value)
          : "Choose an item below to edit it",
      ),
      el(
        "p",
        "",
        value
          ? time(value.start) +
              " – " +
              time(value.end) +
              " · " +
              M.layer(project, value.layerId).name
          : project.items.length
            ? "Select anything to edit it."
            : "Add videos to begin.",
      ),
    );
    node.append(summary);
    const error = el("div", "notice error", errorMessage);
    error.id = "contextError";
    error.hidden = !errorMessage;
    error.setAttribute("role", "alert");
    node.append(error);
    if (conflicts().length)
      node.append(
        group(
          "",
          el("p", "notice error", "Two videos share the same overlay track."),
          B("fixConflict", "Fix automatically", fixConflicts),
        ),
      );
    if (project.workflow === "export") {
      renderExportControls(node);
      return;
    }
    const content = el("div", "context-content");
    node.append(content);
    if (project.workflow === "effects")
      content.append(
        group(
          "Add on top",
          onTopCards(),
          B("addCredits", "Credits", creditsDialog, {
            wrapperClass: "full-width",
          }),
        ),
      );
    if (value) {
      const common = row(
        B(
          "showItem",
          value.enabled ? "Hide item" : "Show item",
          () =>
            edit(
              () => {
                value.enabled = !value.enabled;
              },
              "Visibility changed",
              { context: true },
            ),
          { symbol: value.enabled ? "◉" : "○" },
        ),
        B(
          "lockItem",
          locked ? "Unlock item" : "Lock item",
          () =>
            edit(
              () => {
                value.locked = !value.locked;
                if (M.layer(project, value.layerId).locked)
                  M.layer(project, value.layerId).locked = false;
              },
              "Lock changed",
              { context: true },
            ),
          { symbol: locked ? "🔒" : "♙" },
        ),
        B("duplicateItem", "Duplicate", duplicateSelected, {
          disabled: locked,
        }),
        B("deleteItem", "Delete", deleteSelected, {
          disabled: locked,
          className: "danger",
        }),
      );
      content.append(common);
      if (locked)
        content.append(
          el(
            "p",
            "notice",
            "Unlock this item to change its time, position or appearance.",
          ),
        );
      const timing = el("div", "field-grid");
      timing.append(
        field(
          "Starts at (sec)",
          "startsAt",
          value.start,
          setter(
            (v) => {
              engine.stop();
              M.moveItem(project, value.id, v);
            },
            "Item moved",
            true,
          ),
          { min: 0, step: 1 / project.exportSettings.fps, disabled: locked },
        ),
        field(
          "Ends at (sec)",
          "endsAt",
          value.end,
          setter(
            (v) => {
              engine.stop();
              M.trimItem(project, value.id, "end", v);
            },
            "Item shortened",
            true,
          ),
          {
            min: value.start + M.MIN,
            step: 1 / project.exportSettings.fps,
            disabled: locked,
          },
        ),
      );
      content.append(group("Time range", timing));
      if (value.kind === "audio") content.append(audioControls(value, locked));
      else {
        if (value.kind === "text") content.append(textControls(value, locked));
        if (value.kind === "credits")
          content.append(creditsControls(value, locked));
        if (value.kind === "filter")
          content.append(blurControls(value, locked));
        content.append(
          range(
            value.kind === "video"
              ? "Top video visibility (%)"
              : "Visibility (%)",
            "visibility",
            Math.round(value.opacity * 100),
            0,
            100,
            1,
            setter((v) => {
              value.opacity = v / 100;
            }, "Visibility changed"),
            { disabled: locked },
          ),
        );
        const fadeGrid = el("div", "field-grid");
        fadeGrid.append(
          field(
            "Fade in (sec)",
            "fadeIn",
            value.fadeIn,
            setter((v) => {
              value.fadeIn = v;
            }, "Fade changed"),
            { min: 0, max: 5, step: 0.05, disabled: locked },
          ),
          field(
            "Fade out (sec)",
            "fadeOut",
            value.fadeOut,
            setter((v) => {
              value.fadeOut = v;
            }, "Fade changed"),
            { min: 0, max: 5, step: 0.05, disabled: locked },
          ),
        );
        content.append(fadeGrid);
        if (value.kind === "video") {
          content.append(speedControls(value, locked));
          const linked = project.items.find(
            (i) =>
              i.kind === "audio" && i.linkedGroupId === value.linkedGroupId,
          );
          if (linked)
            content.append(
              B(
                "selectItem",
                "Edit original sound",
                () => {
                  soundExpanded = true;
                  selectItem(linked.id);
                },
                { wrapperClass: "full-width" },
              ),
            );
        }
        if (value.transform) content.append(transformControls(value, locked));
        if (value.kind !== "filter")
          content.append(effectControls(value, locked));
        content.append(curveControls(value, locked));
        if (value.layerId !== "main")
          content.append(
            row(
              B(
                "moveFront",
                "Move in front",
                () => moveLayer(value.layerId, 1),
                {
                  disabled: locked || M.VIDEO_LAYERS.includes(value.layerId),
                  reason:
                    "Move videos between Overlay 1 and Overlay 2 using the timeline.",
                },
              ),
              B(
                "moveBehind",
                "Move behind",
                () => moveLayer(value.layerId, -1),
                {
                  disabled: locked || M.VIDEO_LAYERS.includes(value.layerId),
                  reason:
                    "Move videos between Overlay 1 and Overlay 2 using the timeline.",
                },
              ),
            ),
          );
      }
      content.append(
        details(
          "More settings",
          field(
            "Item name",
            "itemName",
            value.name || named(value),
            setter((v) => {
              value.name = v;
            }, "Name changed"),
            { type: "text", disabled: locked },
          ),
          value.linkedGroupId
            ? check(
                "Link picture and sound edits",
                "linkAudio",
                value.linkEnabled,
                (v) =>
                  edit(
                    () => M.setLink(project, value.id, v),
                    "Linked editing changed",
                    { context: true },
                  ),
                locked,
              )
            : null,
          ...sourceControls(value, locked),
        ),
      );
    } else if (project.workflow !== "effects")
      content.append(
        el(
          "p",
          "context-hint",
          project.items.length
            ? "Your movie is ready to play. Select a clip to shorten it, move it or change its sound."
            : "Start by adding your videos. We will put them in order so you can play your first draft straight away.",
        ),
      );
    if (project.items.length) content.append(soundBalanceControls());
    const next = el("div", "next-action");
    if (project.workflow === "media" && M.mainItems(project).length)
      next.append(
        B("startArrange", "Start arranging", () => setStep("arrange"), {
          primary: true,
          id: "startArrangeButton",
          wrapperClass: "full-width",
        }),
      );
    else if (project.workflow === "arrange")
      next.append(
        B("addEffect", "Add an effect", () => setStep("effects"), {
          primary: true,
          wrapperClass: "full-width",
        }),
      );
    else if (project.workflow === "effects")
      next.append(
        B(
          "reviewMovie",
          "Review movie",
          () => {
            engine.stop();
            setStep("export");
            seekTo(0).catch(report);
          },
          { primary: true, wrapperClass: "full-width" },
        ),
      );
    if (project.workflow !== "media" && project.workflow !== "effects")
      next.append(
        B("addOnTop", "Add on top", onTopDialog, {
          wrapperClass: "full-width",
        }),
      );
    node.append(next);
    node.scrollTop = scroll;
  }
  function transformControls(value, locked) {
    const tr = value.transform,
      grid = el("div", "field-grid");
    for (const [key, label, helpId, min] of [
      ["x", "X", "positionX", -100000],
      ["y", "Y", "positionY", -100000],
      ["width", "Width", "width", 1],
      ["height", "Height", "height", 1],
      ["rotation", "Rotation (°)", "rotation", -360],
    ])
      grid.append(
        field(
          label,
          helpId,
          Math.round(tr[key] * 100) / 100,
          setter((v) => {
            tr[key] = v;
          }, "Position changed"),
          {
            min,
            max: key === "rotation" ? 360 : 100000,
            step: 1,
            disabled: locked,
          },
        ),
      );
    const source = M.asset(project, value.assetId),
      fit = source
        ? row(
            ...[
              ["fit", "Fit"],
              ["fill", "Fill"],
              ["original", "Original size"],
            ].map(([mode, label]) =>
              B(
                mode === "original" ? "originalSize" : mode,
                label,
                () =>
                  edit(
                    () => M.fitTransform(project, value, mode),
                    "Picture fitted",
                    { context: true },
                  ),
                { disabled: locked },
              ),
            ),
          )
        : null;
    return details("Position and size", grid, fit);
  }
  function sourceControls(value, locked) {
    if (!["video", "audio", "image"].includes(value.kind)) return [];
    const source = M.asset(project, value.assetId);
    const controls = [];
    if (value.kind !== "image")
      controls.push(
        field(
          "Source in (sec)",
          "sourceIn",
          value.sourceIn,
          setter(
            (v) => sourceBounds(value, v, value.sourceOut),
            "Source range changed",
            true,
          ),
          { min: 0, max: value.sourceOut - M.MIN, disabled: locked },
        ),
        field(
          "Source out (sec)",
          "sourceOut",
          value.sourceOut,
          setter(
            (v) => sourceBounds(value, value.sourceIn, v),
            "Source range changed",
            true,
          ),
          {
            min: value.sourceIn + M.MIN,
            max: source.duration,
            disabled: locked,
          },
        ),
      );
    if (value.transform) {
      const grid = el("div", "field-grid");
      for (const [key, label, maximum] of [
        ["cropX", "Crop X", source.width - 1],
        ["cropY", "Crop Y", source.height - 1],
        ["cropWidth", "Crop width", source.width],
        ["cropHeight", "Crop height", source.height],
      ])
        grid.append(
          field(
            label,
            key,
            value.transform[key],
            setter((v) => {
              value.transform[key] = v;
            }, "Crop changed"),
            {
              min: key.includes("Width") || key.includes("Height") ? 1 : 0,
              max: maximum,
              step: 1,
              disabled: locked,
            },
          ),
        );
      controls.push(
        grid,
        row(
          B(
            "rotation",
            "Rotate left 90°",
            () =>
              edit(
                () => {
                  value.transform.rotation =
                    (value.transform.rotation - 90) % 360;
                },
                "Picture rotated",
                { context: true },
              ),
            { disabled: locked },
          ),
          B(
            "rotation",
            "Rotate right 90°",
            () =>
              edit(
                () => {
                  value.transform.rotation =
                    (value.transform.rotation + 90) % 360;
                },
                "Picture rotated",
                { context: true },
              ),
            { disabled: locked },
          ),
        ),
      );
    }
    return controls;
  }
  function sourceBounds(value, start, end) {
    engine.stop();
    for (const sibling of M.related(project, value)) {
      sibling.sourceIn = start;
      sibling.sourceOut = end;
      if (!sibling.audio?.loop)
        sibling.end = sibling.start + (end - start) / sibling.playbackRate;
    }
    if (M.related(project, value).some((i) => i.layerId === "main"))
      M.reflow(project);
  }
  function speedControls(value, locked) {
    return group(
      "Speed",
      range(
        "Playback speed (×)",
        "speed",
        value.playbackRate,
        0.25,
        4,
        0.05,
        setter(
          (v) => {
            engine.stop();
            M.setSpeed(project, value.id, v);
          },
          "Playback speed changed",
          true,
        ),
        { disabled: locked },
      ),
      row(
        ...[0.5, 1, 1.5, 2].map((speed) =>
          B(
            "speed",
            speed + "×",
            () =>
              edit(
                () => {
                  engine.stop();
                  M.setSpeed(project, value.id, speed);
                },
                "Playback speed changed",
                { context: true },
              ),
            {
              disabled: locked,
              className: value.playbackRate === speed ? "is-active" : "",
            },
          ),
        ),
      ),
    );
  }
  function audioControls(value, locked) {
    const a = value.audio,
      source = M.asset(project, value.assetId),
      wave = el("canvas", "waveform-large");
    drawWaveform(wave, source, value, waveZoom);
    const basic = group(
      "Sound",
      wave,
      range(
        "Volume (%)",
        "volume",
        Math.round(a.volume * 100),
        0,
        200,
        1,
        setter((v) => {
          a.volume = v / 100;
        }, "Volume changed"),
        { disabled: locked },
      ),
      check(
        "Mute this sound",
        "muteItem",
        a.muted,
        (v) =>
          edit(() => {
            a.muted = v;
          }, "Sound muted"),
        locked,
      ),
      check(
        "Repeat",
        "repeat",
        a.loop,
        (v) =>
          edit(() => M.setRepeat(project, value.id, v), "Repeat changed", {
            context: true,
          }),
        locked,
      ),
      B(
        "wholeMovie",
        "Play for whole movie",
        () =>
          edit(
            () => M.setRepeat(project, value.id, true, true),
            "Music fills the movie",
            { context: true },
          ),
        { disabled: locked },
      ),
      speedControls(value, locked),
    );
    const fades = el("div", "field-grid");
    fades.append(
      field(
        "Fade in (sec)",
        "fadeIn",
        a.fadeIn,
        setter((v) => {
          a.fadeIn = v;
        }, "Fade changed"),
        { min: 0, max: M.span(value), step: 0.05, disabled: locked },
      ),
      field(
        "Fade out (sec)",
        "fadeOut",
        a.fadeOut,
        setter((v) => {
          a.fadeOut = v;
        }, "Fade changed"),
        { min: 0, max: M.span(value), step: 0.05, disabled: locked },
      ),
    );
    basic.append(
      details(
        "More sound settings",
        fades,
        range(
          "Left channel (%)",
          "leftGain",
          a.leftGain * 100,
          0,
          200,
          1,
          setter((v) => {
            a.leftGain = v / 100;
          }, "Left channel changed"),
          { disabled: locked },
        ),
        range(
          "Right channel (%)",
          "rightGain",
          a.rightGain * 100,
          0,
          200,
          1,
          setter((v) => {
            a.rightGain = v / 100;
          }, "Right channel changed"),
          { disabled: locked },
        ),
        check(
          "Preserve pitch",
          "preservePitch",
          a.preservePitch,
          (v) =>
            edit(() => {
              a.preservePitch = v;
            }, "Pitch mode changed"),
          locked,
        ),
        field(
          "Waveform zoom",
          "waveformZoom",
          waveZoom,
          (v, commit) => {
            waveZoom = v;
            drawWaveform(wave, source, value, waveZoom);
          },
          { min: 1, max: 10, step: 0.5 },
        ),
        value.linkedGroupId
          ? B(
              "unlinkAudio",
              "Separate sound",
              () =>
                edit(
                  () => M.setLink(project, value.id, false),
                  "Sound can be edited separately",
                  { context: true },
                ),
              {
                disabled: !value.linkEnabled || locked,
                reason: "This sound is already independently editable.",
              },
            )
          : null,
      ),
    );
    return basic;
  }
  function soundBalanceControls() {
    const balance = el("div", "audio-balance");
    for (const [key, label, helpId] of [
      ["video", "Video sound", "videoBalance"],
      ["music", "Music", "musicBalance"],
      ["other", "Other sound", "otherBalance"],
    ])
      balance.append(
        range(
          label + " (%)",
          helpId,
          project.soundBalance[key] * 100,
          0,
          200,
          1,
          setter((v) => {
            project.soundBalance[key] = v / 100;
          }, "Sound balance changed"),
        ),
      );
    const meter = el("div", "audio-meter"),
      level = el("span");
    level.id = "audioMeter";
    meter.append(level);
    return details(
      "Sound balance",
      balance,
      meter,
      el("small", "", "Mixed stereo output · Peak limit −1 dB"),
    );
  }
  function textControls(value, locked) {
    const text = value.text,
      grid = el("div", "field-grid");
    grid.append(
      field(
        "Font",
        "font",
        text.font,
        setter((v) => {
          text.font = v;
        }, "Font changed"),
        {
          options: [
            ["system-ui", "System"],
            ["Arial", "Arial"],
            ["Georgia", "Georgia"],
            ["Verdana", "Verdana"],
            ["monospace", "Monospace"],
          ],
          disabled: locked,
        },
      ),
      field(
        "Size",
        "fontSize",
        text.size,
        setter((v) => {
          text.size = v;
        }, "Text size changed"),
        { min: 4, max: 1000, step: 1, disabled: locked },
      ),
      field(
        "Colour",
        "color",
        text.color,
        setter((v) => {
          text.color = v;
        }, "Colour changed"),
        { type: "color", disabled: locked },
      ),
      field(
        "Weight",
        "fontWeight",
        text.weight,
        setter((v) => {
          text.weight = Number(v);
        }, "Weight changed"),
        {
          options: [
            [400, "Regular"],
            [700, "Bold"],
          ],
          disabled: locked,
        },
      ),
      field(
        "Alignment",
        "alignment",
        text.align,
        setter((v) => {
          text.align = v;
        }, "Alignment changed"),
        {
          options: [
            ["left", "Left"],
            ["center", "Centre"],
            ["right", "Right"],
          ],
          disabled: locked,
        },
      ),
      field(
        "Background",
        "background",
        text.background === "transparent"
          ? "#17201b"
          : text.background.slice(0, 7),
        setter((v) => {
          text.background = v;
        }, "Background changed"),
        { type: "color", disabled: locked },
      ),
    );
    return group(
      "Text",
      field(
        "Preset",
        "textPreset",
        text.preset,
        setter(
          (v) => {
            text.preset = v;
            text.weight = v === "title" ? 700 : 400;
            text.size = project.canvas.height * (v === "title" ? 0.1 : 0.055);
            value.transform.y =
              project.canvas.height * (v === "subtitle" ? 0.78 : 0.35);
            if (v === "subtitle") text.background = "#17201bcc";
          },
          "Text preset changed",
          true,
        ),
        {
          options: [
            ["title", "Title"],
            ["caption", "Caption"],
            ["subtitle", "Subtitle"],
          ],
          disabled: locked,
        },
      ),
      field(
        "Words",
        "textContent",
        text.content,
        setter((v) => {
          text.content = v;
        }, "Text changed"),
        { multiline: true, disabled: locked },
      ),
      grid,
      check(
        "Transparent background",
        "background",
        text.background === "transparent",
        (v) =>
          edit(
            () => {
              text.background = v ? "transparent" : "#17201b";
            },
            "Text background changed",
            { context: true },
          ),
        locked,
      ),
    );
  }
  function blurControls(value, locked) {
    const f = value.filter,
      max = { gaussian: 50, box: 30, motion: 80, radial: 100 }[f.type];
    const result = group(
      "Blur area",
      field(
        "Blur type",
        "blurType",
        f.type,
        setter(
          (v) => {
            f.type = v;
            f.amount = Math.min(
              f.amount,
              { gaussian: 50, box: 30, motion: 80, radial: 100 }[v],
            );
          },
          "Blur type changed",
          true,
        ),
        {
          options: [
            ["gaussian", "Gaussian"],
            ["box", "Box"],
            ["motion", "Motion"],
            ["radial", "Radial"],
          ],
          disabled: locked,
        },
      ),
      range(
        f.type === "radial" ? "Strength (%)" : "Amount (px)",
        "blurAmount",
        f.amount,
        0,
        max,
        1,
        setter((v) => {
          f.amount = v;
        }, "Blur changed"),
        { disabled: locked },
      ),
    );
    if (f.type === "motion")
      result.append(
        range(
          "Angle (°)",
          "blurAngle",
          f.angle,
          0,
          360,
          1,
          setter((v) => {
            f.angle = v;
          }, "Blur angle changed"),
          { disabled: locked },
        ),
      );
    if (f.type === "radial")
      result.append(
        range(
          "Centre X (%)",
          "blurCenterX",
          f.centerX,
          0,
          100,
          1,
          setter((v) => {
            f.centerX = v;
          }, "Blur centre changed"),
          { disabled: locked },
        ),
        range(
          "Centre Y (%)",
          "blurCenterY",
          f.centerY,
          0,
          100,
          1,
          setter((v) => {
            f.centerY = v;
          }, "Blur centre changed"),
          { disabled: locked },
        ),
      );
    result.append(
      field(
        "Apply to",
        "blurTarget",
        f.targetMode,
        setter(
          (v) => {
            f.targetMode = v;
          },
          "Blur target changed",
          true,
        ),
        {
          options: [
            ["everything-below", "Everything below"],
            ["selected-layer", "Selected layer"],
          ],
          disabled: locked,
        },
      ),
    );
    if (f.targetMode === "selected-layer")
      result.append(
        field(
          "Target layer",
          "targetLayer",
          f.targetLayerId,
          setter((v) => {
            f.targetLayerId = v;
          }, "Blur target changed"),
          {
            options: project.layers
              .filter((l) => !["sound", "filter"].includes(l.kind))
              .map((l) => [l.id, l.name]),
            disabled: locked,
          },
        ),
      );
    result.append(
      el(
        "small",
        "",
        "Drag the rectangle in the preview to choose the area. Use its handles to resize it.",
      ),
    );
    return result;
  }
  function creditsControls(value, locked) {
    const c = value.credits;
    const update = (fn, refresh = false) =>
      setter(
        (v) => {
          fn(v);
          M.updateCreditsDuration(project, value);
        },
        "Credits changed",
        refresh,
      );
    const result = group(
      "Credits",
      field(
        "Template",
        "creditsTemplate",
        c.template,
        update((v) => {
          c.template = v;
        }, true),
        {
          options: [
            ["rolling", "Rolling credits"],
            ["static", "Static list"],
            ["pages", "Pages of names"],
          ],
          disabled: locked,
        },
      ),
    );
    if (c.template === "rolling")
      result.append(
        field(
          "Timing",
          "creditsMode",
          c.mode,
          update((v) => {
            c.mode = v;
          }, true),
          {
            options: [
              ["fit", "Fit duration"],
              ["speed", "Keep speed"],
            ],
            disabled: locked,
          },
        ),
        field(
          "Direction",
          "direction",
          c.direction,
          update((v) => {
            c.direction = v;
          }),
          {
            options: [
              ["up", "Up"],
              ["down", "Down"],
            ],
            disabled: locked,
          },
        ),
        field(
          "Pixels per second",
          "creditsSpeed",
          Math.round(c.speed),
          update((v) => {
            c.speed = v;
            c.mode = "speed";
          }, true),
          { min: 1, max: 2000, step: 1, disabled: locked },
        ),
      );
    const settings = el("div", "field-grid");
    for (const [key, label, helpId, min, max, step] of [
      ["fontSize", "Text size", "fontSize", 4, 1000, 1],
      ["lineHeight", "Line spacing", "lineSpacing", 0.5, 4, 0.1],
      ["marginTop", "Top margin", "marginTop", 0, 2000, 1],
      ["marginBottom", "Bottom margin", "marginBottom", 0, 2000, 1],
    ])
      settings.append(
        field(
          label,
          helpId,
          c[key],
          update((v) => {
            c[key] = v;
          }),
          { min, max, step, disabled: locked },
        ),
      );
    settings.append(
      field(
        "Colour",
        "color",
        c.color,
        update((v) => {
          c.color = v;
        }),
        { type: "color", disabled: locked },
      ),
      field(
        "Background",
        "background",
        c.background,
        update((v) => {
          c.background = v;
        }),
        { type: "color", disabled: locked },
      ),
    );
    result.append(details("Credits appearance", settings));
    for (const [index, g] of c.groups.entries()) {
      const card = el("div", "credits-group");
      card.append(
        field(
          "Group title",
          "groupTitle",
          g.title,
          update((v) => {
            g.title = v;
          }),
          { type: "text", disabled: locked },
        ),
        field(
          "Names",
          "groupContent",
          g.content,
          update((v) => {
            g.content = v;
          }),
          { multiline: true, disabled: locked },
        ),
        row(
          B(
            "groupUp",
            "Move up",
            () =>
              edit(
                () => {
                  [c.groups[index - 1], c.groups[index]] = [
                    c.groups[index],
                    c.groups[index - 1],
                  ];
                },
                "Group moved",
                { context: true },
              ),
            { disabled: locked || index === 0 },
          ),
          B(
            "groupDown",
            "Move down",
            () =>
              edit(
                () => {
                  [c.groups[index + 1], c.groups[index]] = [
                    c.groups[index],
                    c.groups[index + 1],
                  ];
                },
                "Group moved",
                { context: true },
              ),
            { disabled: locked || index === c.groups.length - 1 },
          ),
          B(
            "deleteGroup",
            "Delete group",
            () =>
              edit(
                () => {
                  c.groups.splice(index, 1);
                  M.updateCreditsDuration(project, value);
                },
                "Group deleted",
                { context: true },
              ),
            { disabled: locked || c.groups.length === 1 },
          ),
        ),
      );
      result.append(card);
    }
    result.append(
      B(
        "addGroup",
        "Add group",
        () =>
          edit(
            () => {
              c.groups.push({
                id: M.id("group"),
                title: "Custom group",
                content: "Add names here",
              });
              M.updateCreditsDuration(project, value);
            },
            "Group added",
            { context: true },
          ),
        { disabled: locked, wrapperClass: "full-width" },
      ),
    );
    return result;
  }
  function effectControls(value, locked) {
    const result = group(
      "Effects",
      B("addEffect", "Add an effect", () => effectsDialog(value.id), {
        disabled: locked,
        wrapperClass: "full-width",
      }),
    );
    for (const [index, fx] of value.effects.entries()) {
      const card = el("div", "effect-entry");
      const bounds = ["brightness", "contrast", "saturation"].includes(fx.type)
        ? [0, 3, 0.05]
        : fx.type === "hue"
          ? [-180, 180, 1]
          : [0, 1, 0.05];
      card.append(
        el(
          "h3",
          "",
          fx.type === "sepia"
            ? "Vintage"
            : fx.type[0].toUpperCase() + fx.type.slice(1),
        ),
        check(
          "Enabled",
          "effectEnabled",
          fx.enabled,
          (v) =>
            edit(() => {
              fx.enabled = v;
            }, "Effect toggled"),
          locked,
        ),
        range(
          "Strength",
          "effectAmount",
          fx.amount,
          ...bounds,
          setter((v) => {
            fx.amount = v;
          }, "Effect changed"),
          { disabled: locked },
        ),
      );
      const times = el("div", "field-grid");
      times.append(
        field(
          "Starts in item",
          "effectStart",
          fx.start,
          setter((v) => {
            fx.start = v;
          }, "Effect range changed"),
          { min: 0, max: fx.end, disabled: locked },
        ),
        field(
          "Ends in item",
          "effectEnd",
          fx.end,
          setter((v) => {
            fx.end = v;
          }, "Effect range changed"),
          { min: fx.start, max: M.span(value), disabled: locked },
        ),
      );
      card.append(
        times,
        row(
          B(
            "effectUp",
            "Earlier",
            () =>
              edit(
                () => {
                  [value.effects[index - 1], value.effects[index]] = [
                    value.effects[index],
                    value.effects[index - 1],
                  ];
                },
                "Effect order changed",
                { context: true },
              ),
            { disabled: locked || index === 0 },
          ),
          B(
            "effectDown",
            "Later",
            () =>
              edit(
                () => {
                  [value.effects[index + 1], value.effects[index]] = [
                    value.effects[index],
                    value.effects[index + 1],
                  ];
                },
                "Effect order changed",
                { context: true },
              ),
            { disabled: locked || index === value.effects.length - 1 },
          ),
          B(
            "duplicateEffect",
            "Copy",
            () =>
              edit(
                () => {
                  const dupe = M.copy(fx);
                  dupe.id = M.id("effect");
                  value.effects.splice(index + 1, 0, dupe);
                },
                "Effect copied",
                { context: true },
              ),
            { disabled: locked },
          ),
          B(
            "deleteEffect",
            "Delete",
            () =>
              edit(
                () => {
                  value.effects.splice(index, 1);
                },
                "Effect deleted",
                { context: true },
              ),
            { disabled: locked },
          ),
        ),
      );
      result.append(card);
    }
    return result;
  }
  function curveControls(value, locked) {
    const graph = el("canvas", "curve-editor");
    graph.width = 256;
    graph.height = 100;
    graph.tabIndex = 0;
    graph.setAttribute("aria-label", "Visibility curve. Click to add a point.");
    H.attach(graph, "curvePoint");
    const draw = () => {
      const ctx = graph.getContext("2d");
      ctx.clearRect(0, 0, 256, 100);
      ctx.strokeStyle = "#d5ddd7";
      for (let y = 0; y <= 100; y += 25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y);
        ctx.stroke();
      }
      ctx.strokeStyle = "#315efb";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= 256; x++) {
        const y =
          100 - M.curveAt(value.opacityKeys, (x / 256) * M.span(value)) * 100;
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = "#315efb";
      for (const point of value.opacityKeys) {
        ctx.beginPath();
        ctx.arc(
          (point.time / M.span(value)) * 256,
          100 - point.value * 100,
          4,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    };
    draw();
    graph.addEventListener("click", (event) => {
      if (locked) return;
      const box = graph.getBoundingClientRect();
      edit(
        () =>
          M.setKey(
            value,
            ((event.clientX - box.left) / box.width) * M.span(value),
            1 - (event.clientY - box.top) / box.height,
          ),
        "Curve point added",
        { context: true },
      );
    });
    graph.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !locked)
        edit(
          () =>
            M.setKey(
              value,
              M.clamp(project.playhead - value.start, 0, M.span(value)),
              1,
            ),
          "Curve point added",
          { context: true },
        );
    });
    const contents = [
      graph,
      B(
        "curvePoint",
        "Add point at playhead",
        () =>
          edit(
            () =>
              M.setKey(
                value,
                project.playhead - value.start,
                M.curveAt(value.opacityKeys, project.playhead - value.start),
              ),
            "Curve point added",
            { context: true },
          ),
        { disabled: locked },
      ),
    ];
    if (value.kind === "video")
      contents.unshift(
        field(
          "Blend mode",
          "blendMode",
          value.blendMode,
          setter(
            (v) => {
              for (const video of project.items.filter(
                (i) => i.kind === "video",
              ))
                video.blendMode = v;
            },
            "Blend mode changed",
            true,
          ),
          {
            options: [
              ["equal", "Equal contribution"],
              ["alpha", "Layer alpha"],
            ],
            disabled: locked,
          },
        ),
      );
    for (const point of value.opacityKeys) {
      const card = el("div", "curve-point");
      card.append(
        field(
          "Time (sec)",
          "pointTime",
          point.time,
          setter((v) => {
            point.time = v;
            value.opacityKeys.sort((a, b) => a.time - b.time);
            draw();
          }, "Curve point moved"),
          { min: 0, max: M.span(value), disabled: locked },
        ),
        field(
          "Value (%)",
          "pointValue",
          point.value * 100,
          setter((v) => {
            point.value = v / 100;
            draw();
          }, "Curve point changed"),
          { min: 0, max: 100, step: 1, disabled: locked },
        ),
        field(
          "Interpolation",
          "easing",
          point.easing,
          setter((v) => {
            point.easing = v;
            draw();
          }, "Curve interpolation changed"),
          {
            options: [
              ["linear", "Linear"],
              ["smooth", "Smooth"],
              ["ease-in", "Ease in"],
              ["ease-out", "Ease out"],
              ["hold", "Hold"],
            ],
            disabled: locked,
          },
        ),
        B(
          "deletePoint",
          "Delete point",
          () =>
            edit(
              () => {
                value.opacityKeys = value.opacityKeys.filter(
                  (k) => k !== point,
                );
              },
              "Curve point deleted",
              { context: true },
            ),
          { disabled: locked },
        ),
      );
      contents.push(card);
    }
    return details("Visibility curve", ...contents);
  }
  function assetChoice(source, type = "radio", checked = false) {
    const label = el("label", "media-choice"),
      input = el("input");
    input.type = type;
    input.value = source.id;
    input.name = "asset-choice";
    input.checked = checked;
    input.setAttribute("aria-label", source.name);
    H.attach(input, "selectAsset");
    label.append(input);
    if (source.thumbnail) {
      const image = el("img");
      image.src = source.thumbnail;
      image.alt = "";
      label.append(image);
    }
    const copy = el("span", "choice-copy");
    copy.append(
      el("strong", "", source.name),
      el(
        "small",
        "",
        source.kind === "image"
          ? source.width + " × " + source.height
          : time(source.duration),
      ),
    );
    label.append(copy);
    return { label, input };
  }
  function addHereDialog(index) {
    dialog("Add here", (body, foot) => {
      const choices = project.assets.filter(
        (a) => a.kind !== "audio" && library.has(a.id),
      );
      if (!choices.length)
        body.append(
          el("p", "muted", "Import a video or image to place it here."),
        );
      for (const source of choices) {
        const choice = assetChoice(source);
        choice.input.addEventListener("change", () => {
          assetSelected = source.id;
        });
        body.append(choice.label);
      }
      foot.append(
        B("addVideos", "Import videos", () => {
          insertIndex = index;
          closeDialog();
          $("videoFiles").click();
        }),
        B(
          "apply",
          "Add here",
          () => {
            const input = body.querySelector("input:checked");
            if (!input) throw new Error("Choose a video or image first.");
            edit(
              () => {
                const value = M.addMedia(project, input.value, { index });
                selectedId = value.id;
              },
              "Media inserted",
              { context: true, toast: true },
            );
            closeDialog();
            renderStepper();
          },
          { primary: true, disabled: !choices.length },
        ),
      );
    });
  }
  function imageDialog() {
    dialog("Place an image on top", (body, foot) => {
      const choices = project.assets.filter(
        (a) => a.kind === "image" && library.has(a.id),
      );
      for (const [i, source] of choices.entries())
        body.append(assetChoice(source, "radio", i === 0).label);
      if (!choices.length)
        body.append(
          el(
            "p",
            "muted",
            "Add an image to your library first. Transparent PNGs keep their transparency.",
          ),
        );
      foot.append(
        B("addImages", "Add images", () => {
          closeDialog();
          $("imageFiles").click();
        }),
        B(
          "apply",
          "Apply",
          () => {
            const chosen = body.querySelector("input:checked");
            if (!chosen) throw new Error("Choose an image first.");
            addNewItem("image", { assetId: chosen.value });
          },
          { primary: true, disabled: !choices.length },
        ),
      );
    });
  }
  function musicDialog(assetIds) {
    dialog("Place your music", (body, foot) => {
      body.append(
        el(
          "p",
          "muted",
          "Choose where the music starts. Picture and sound can be edited independently.",
        ),
      );
      const place = (mode) => {
        const previous = selected();
        edit(
          () => {
            let cursor =
              mode === "after"
                ? previous?.kind === "audio"
                  ? previous.end
                  : project.playhead
                : mode === "whole"
                  ? 0
                  : project.playhead;
            for (const assetId of assetIds) {
              const sound = M.addMedia(project, assetId, { start: cursor });
              if (mode === "whole") M.setRepeat(project, sound.id, true, true);
              if (mode === "after") cursor = sound.end;
              selectedId = sound.id;
            }
            soundExpanded = true;
          },
          "Music added",
          { context: true, toast: true },
        );
        closeDialog();
        renderMedia();
      };
      body.append(
        B("startHere", "Start here", () => place("here"), {
          wrapperClass: "full-width",
        }),
        B("wholeMovie", "Play for whole movie", () => place("whole"), {
          wrapperClass: "full-width",
          disabled: !M.visualEnd(project),
          reason: "Add a video or image to Main video first.",
        }),
        B("afterSound", "Place after selected sound", () => place("after"), {
          wrapperClass: "full-width",
          disabled: selected()?.kind !== "audio",
          reason: "Select a sound on the timeline first.",
        }),
      );
      foot.append(B("cancel", "Keep in library", closeDialog));
    });
  }
  function overlayDialog(preferred) {
    const main =
      M.mainItems(project).find(
        (i) => M.active(i, project.playhead) && i.kind === "video",
      ) || M.mainItems(project).find((i) => i.kind === "video");
    if (!main) {
      report(
        new Error("Add a video to Main video before creating a video overlap."),
      );
      return;
    }
    const start = Math.max(
        main.start,
        Math.min(project.playhead, main.end - M.MIN),
      ),
      duration = main.end - start,
      choices = project.assets.filter(
        (a) => a.kind === "video" && library.has(a.id),
      );
    let preset = "equal";
    const available = ["overlay-1", "overlay-2"].filter(
      (key) =>
        !project.items.some(
          (i) =>
            i.layerId === key && i.start < start + duration && i.end > start,
        ),
    );
    const preferredIds = preferred
      ? [preferred]
      : choices
          .filter((a) => a.id !== main.assetId)
          .slice(0, 2)
          .map((a) => a.id);
    if (!preferredIds.length && choices.length)
      preferredIds.push(choices[0].id);
    dialog("Video overlay", (body, foot) => {
      body.append(
        el(
          "p",
          "muted",
          "Start at " +
            time(start) +
            " and cover the current main clip. Choose up to two videos.",
        ),
      );
      const presets = el("div", "choice-grid");
      for (const [key, label, helpId, symbol] of [
        ["equal", "Equal mix", "equalMix", "⅓ + ⅓ + ⅓"],
        ["soft", "Soft overlap", "softOverlap", "▧ ▤"],
        ["ghost", "Ghost trail", "ghostTrail", "▥ ▥"],
        ["groovy", "Groovy triple", "groovyTriple", "◩ ◩ ◩"],
      ]) {
        const button = B(
          helpId,
          label,
          () => {
            preset = key;
            for (const old of presets.querySelectorAll("button.is-active"))
              old.classList.remove("is-active");
            button.firstElementChild.classList.add("is-active");
            if (key === "groovy") {
              const inputs = [...body.querySelectorAll(".media-choice input")];
              if (
                inputs.filter((i) => i.checked).length < 2 &&
                inputs.length > 1
              ) {
                inputs.slice(0, 2).forEach((i) => {
                  i.checked = true;
                });
              }
            }
          },
          { className: key === preset ? "is-active" : "" },
        );
        button.firstElementChild.prepend(
          el("span", "preset-illustration", symbol),
        );
        presets.append(button);
      }
      body.append(presets);
      for (const source of choices)
        body.append(
          assetChoice(source, "checkbox", preferredIds.includes(source.id))
            .label,
        );
      if (!available.length)
        body.append(
          el("p", "notice", "3 videos are already visible here"),
          B("shortenOverlay", "Shorten an overlay", () => {
            const overlay = project.items.find(
              (i) => i.layerId === "overlay-2" && M.active(i, start),
            );
            closeDialog();
            if (overlay) selectItem(overlay.id);
          }),
        );
      foot.append(
        B("cancel", "Cancel", closeDialog),
        B(
          "apply",
          "Apply",
          () => {
            let chosen = [
              ...body.querySelectorAll(".media-choice input:checked"),
            ].map((input) => input.value);
            if (!chosen.length) throw new Error("Choose at least one video.");
            if (preset === "groovy" && chosen.length === 1)
              chosen.push(chosen[0]);
            if (chosen.length > available.length)
              throw new Error("Shorten an overlay or choose fewer videos.");
            edit(
              () => {
                const overlayIds = [];
                for (let i = 0; i < chosen.length; i++) {
                  const video = M.addMedia(project, chosen[i], {
                    start,
                    duration,
                    layerId: available[i],
                  });
                  overlayIds.push(video.id);
                }
                const all = [
                  main.id,
                  ...project.items
                    .filter(
                      (i) =>
                        i.kind === "video" &&
                        i.layerId !== "main" &&
                        M.active(i, start),
                    )
                    .sort(
                      (a, b) =>
                        M.layer(project, a.layerId).order -
                        M.layer(project, b.layerId).order,
                    )
                    .map((i) => i.id),
                ];
                M.applyOverlayPreset(project, all, preset);
                selectedId = overlayIds.at(-1);
                project.workflow = "effects";
              },
              "Video overlap added",
              { context: true, toast: true },
            );
            closeDialog();
            renderStepper();
            seekTo(start).catch(report);
          },
          {
            primary: true,
            disabled: !available.length,
            reason: "3 videos are already visible here. Shorten an overlay.",
          },
        ),
      );
    });
  }
  function creditsDialog() {
    dialog("Add credits", (body, foot) => {
      const choices = el("div", "choice-grid");
      for (const [key, label, symbol] of [
        ["rolling", "Rolling credits", "↑"],
        ["static", "Static list", "☷"],
        ["pages", "Pages of names", "▤"],
      ]) {
        const button = B("creditsTemplate", label, () =>
          addNewItem("credits", { template: key }),
        );
        button.firstElementChild.prepend(
          el("span", "preset-illustration", symbol),
        );
        choices.append(button);
      }
      body.append(choices);
      foot.append(B("cancel", "Cancel", closeDialog));
    });
  }
  function effectsDialog(itemId) {
    const value = M.item(project, itemId);
    if (!value || value.kind === "audio") return;
    dialog("Add an effect", (body, foot) => {
      const grid = el("div", "choice-grid"),
        canvases = [];
      for (const type of M.EFFECTS) {
        const label = {
            brightness: "Brightness",
            contrast: "Contrast",
            saturation: "Saturation",
            grayscale: "Grayscale",
            sepia: "Vintage",
            hue: "Hue",
          }[type],
          button = B(type, label, () => {
            edit(() => M.addEffect(value, type), "Effect added", {
              context: true,
              toast: true,
            });
            closeDialog();
          });
        const c = Media.makeCanvas(160, 90);
        button.firstElementChild.prepend(c);
        canvases.push({ c, type });
        grid.append(button);
      }
      body.append(
        grid,
        el(
          "p",
          "muted",
          "Effects are applied in order. Edit their strength and time range in the right panel.",
        ),
      );
      let frame;
      const animate = () => {
        for (const { c, type } of canvases) {
          const ctx = c.getContext("2d");
          ctx.filter = {
            brightness: "brightness(1.35)",
            contrast: "contrast(1.5)",
            saturation: "saturate(1.8)",
            grayscale: "grayscale(1)",
            sepia: "sepia(1)",
            hue: "hue-rotate(60deg)",
          }[type];
          ctx.drawImage($("previewCanvas"), 0, 0, 160, 90);
        }
        frame = requestAnimationFrame(animate);
      };
      animate();
      dialogCleanup = () => cancelAnimationFrame(frame);
      foot.append(B("cancel", "Cancel", closeDialog));
    });
  }
  function transitionDialog(toId) {
    const maximum = M.transitionMaximum(project, toId),
      existing = project.transitions.find((t) => t.toId === toId);
    if (maximum < 0.1) {
      report(
        new Error(
          "These clips are too short for a transition. Extend their source ranges first.",
        ),
      );
      return;
    }
    let type = existing?.type || "crossfade",
      duration = existing?.duration || Math.min(1, maximum),
      direction = existing?.direction || "left",
      easing = existing?.easing || "smooth";
    dialog("Choose a transition", (body, foot) => {
      const grid = el("div", "choice-grid"),
        cards = [],
        labels = {
          crossfade: "Crossfade",
          black: "Fade through black",
          wipe: "Wipe",
          slide: "Slide",
          zoom: "Zoom",
          dissolve: "Dissolve",
        };
      const demo = new Renderer(library),
        from = Media.makeCanvas(160, 90),
        to = Media.makeCanvas(160, 90);
      from.getContext("2d").drawImage($("previewCanvas"), 0, 0, 160, 90);
      const next = M.item(project, toId),
        source = library.assets.get(next.assetId)?.probe;
      if (source?.readyState >= 2)
        to.getContext("2d").drawImage(source, 0, 0, 160, 90);
      else {
        to.getContext("2d").fillStyle = "#7650e8";
        to.getContext("2d").fillRect(0, 0, 160, 90);
      }
      for (const key of M.TRANSITIONS) {
        const button = B(
            "transitionType",
            labels[key],
            () => {
              type = key;
              for (const old of grid.querySelectorAll("button.is-active"))
                old.classList.remove("is-active");
              button.firstElementChild.classList.add("is-active");
            },
            { className: type === key ? "is-active" : "" },
          ),
          c = Media.makeCanvas(160, 90);
        button.firstElementChild.prepend(c);
        cards.push({ c, key });
        grid.append(button);
      }
      body.append(grid);
      const durationField = field(
        "Duration (sec)",
        "transitionDuration",
        duration,
        (v) => {
          duration = v;
        },
        { min: 0.1, max: maximum, step: 0.1 },
      );
      body.append(
        durationField,
        row(
          el("small", "", "Available maximum: " + maximum.toFixed(2) + " sec"),
          B("useMaximum", "Use maximum", () => {
            duration = maximum;
            durationField.querySelector("input").value = maximum;
          }),
        ),
        field(
          "Direction",
          "direction",
          direction,
          (v) => {
            direction = v;
          },
          {
            options: [
              ["left", "Left"],
              ["right", "Right"],
              ["up", "Up"],
              ["down", "Down"],
            ],
          },
        ),
        field(
          "Easing",
          "easing",
          easing,
          (v) => {
            easing = v;
          },
          {
            options: [
              ["linear", "Linear"],
              ["smooth", "Smooth"],
              ["ease-in", "Ease in"],
              ["ease-out", "Ease out"],
            ],
          },
        ),
      );
      let frame;
      const animate = (now) => {
        const progress = M.ease((now % 1800) / 1800, easing);
        for (const card of cards) {
          card.c.getContext("2d").clearRect(0, 0, 160, 90);
          card.c
            .getContext("2d")
            .drawImage(
              demo.transition(
                from,
                to,
                { id: card.key, type: card.key, progress, direction },
                160,
                90,
              ),
              0,
              0,
            );
        }
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
      dialogCleanup = () => {
        cancelAnimationFrame(frame);
        demo.dispose();
      };
      if (existing)
        foot.append(
          B("removeTransition", "Remove transition", () => {
            edit(
              () => M.removeTransition(project, toId),
              "Transition removed",
              { context: true, toast: true },
            );
            closeDialog();
          }),
        );
      foot.append(
        B("cancel", "Cancel", closeDialog),
        B(
          "apply",
          "Apply",
          () => {
            edit(
              () =>
                M.setTransition(project, toId, {
                  type,
                  duration,
                  direction,
                  easing,
                }),
              "Transition added",
              { context: true, toast: true },
            );
            closeDialog();
            seekTo(M.item(project, toId).start).catch(report);
          },
          { primary: true },
        ),
      );
    });
  }
  function autoMovieDialog() {
    let template = "family",
      length = "30",
      musicId = "",
      cancelled = false;
    dialog("Make a movie for me", (body, foot) => {
      const styles = el("div", "choice-grid");
      for (const [key, style] of Object.entries(AutoMovie.styles)) {
        const button = B(
          "autoTemplate",
          style.name,
          () => {
            template = key;
            for (const old of styles.querySelectorAll("button.is-active"))
              old.classList.remove("is-active");
            button.firstElementChild.classList.add("is-active");
          },
          { className: key === template ? "is-active" : "" },
        );
        button.firstElementChild.prepend(
          el(
            "span",
            "preset-illustration",
            { family: "♡", travel: "↗", fast: "»", calm: "≈", music: "♫" }[
              key
            ],
          ),
        );
        styles.append(button);
      }
      body.append(
        styles,
        field(
          "Target length",
          "targetLength",
          length,
          (v) => {
            length = v;
          },
          {
            options: [
              ["30", "30 sec"],
              ["60", "60 sec"],
              ["full", "Full length"],
            ],
          },
        ),
        field(
          "Background music",
          "backgroundMusic",
          musicId,
          (v) => {
            musicId = v;
          },
          {
            options: [
              ["", "No background music"],
              ...project.assets
                .filter((a) => a.kind === "audio")
                .map((a) => [a.id, a.name]),
            ],
          },
        ),
      );
      for (const source of project.assets.filter(
        (a) => a.kind !== "audio" && library.has(a.id),
      ))
        body.append(assetChoice(source, "checkbox", true).label);
      const progress = el("p", "notice");
      progress.hidden = true;
      body.append(progress);
      dialogCleanup = () => {
        cancelled = true;
      };
      foot.append(
        B("cancel", "Cancel", closeDialog),
        B(
          "generateMovie",
          "Make the draft",
          async (event) => {
            const generateButton = event.currentTarget;
            const ids = [
              ...body.querySelectorAll(".media-choice input:checked"),
            ].map((i) => i.value);
            H.setDisabled(
              generateButton,
              true,
              "Wait for the draft to finish, or choose Cancel.",
            );
            progress.hidden = false;
            engine.stop();
            try {
              const next = await AutoMovie.generate(
                project,
                library,
                { template, length, musicId, assetIds: ids },
                (status) => {
                  if (cancelled) throw new Error("Draft cancelled.");
                  progress.textContent =
                    "Analysing " +
                    status.name +
                    " · " +
                    Math.round(status.percent * 100) +
                    "%";
                },
              );
              if (cancelled) return;
              await engine.dispose();
              library.pause();
              for (const element of library.elements.values()) {
                element.utvDisposed = true;
                element.dispatchEvent(new Event("utv-disposed"));
                element.removeAttribute("src");
                element.load();
              }
              library.elements.clear();
              project = next;
              selectedId = M.mainItems(project)[0]?.id;
              project.selectedItemId = selectedId;
              history.push(project);
              setupEngine();
              closeDialog();
              store.schedule(project);
              renderAll();
              await seekTo(0);
              toast("Your editable movie draft is ready");
            } catch (error) {
              if (!cancelled) {
                progress.textContent = error.message;
                H.setDisabled(generateButton, false, "");
              }
            }
          },
          { primary: true },
        ),
      );
    });
  }
  let exportMessage = "",
    exportAbort = null;
  function renderExportControls(node) {
    const settings = project.exportSettings,
      formats = root.UTStudio.supportedFormats();
    if (!formats.some((f) => f[0] === settings.format))
      settings.format = formats[0]?.[0] || "";
    const quality = group(
      "Choose your quality",
      field(
        "Quality",
        "quality",
        settings.quality,
        setter(
          (v) => {
            settings.quality = v;
            settings.bitrate = { quick: 4, standard: 6, high: 12 }[v];
          },
          "Export quality changed",
          true,
        ),
        {
          options: [
            ["quick", "Quick · 720p"],
            ["standard", "Standard · 1080p"],
            ["high", "High · Original size"],
          ],
        },
      ),
    );
    let dimensions;
    try {
      dimensions = M.exportDimensions(project);
    } catch (error) {
      dimensions = { width: 0, height: 0 };
      quality.append(el("p", "notice error", error.message));
    }
    quality.append(
      el(
        "p",
        "export-facts",
        dimensions.width +
          " × " +
          dimensions.height +
          " · " +
          time(project.duration) +
          " · " +
          (settings.includeAudio ? "Mixed stereo sound" : "No sound"),
      ),
    );
    node.append(quality);
    const technical = el("div", "technical-settings");
    technical.append(
      field(
        "Frames per second",
        "fps",
        settings.fps,
        setter((v) => {
          settings.fps = Math.round(v);
        }, "Frame rate changed"),
        { min: 1, max: 60, step: 1 },
      ),
      field(
        "Video Mbps",
        "bitrate",
        settings.bitrate,
        setter((v) => {
          settings.bitrate = v;
        }, "Bitrate changed"),
        { min: 0.25, max: 50, step: 0.25 },
      ),
      field(
        "Format",
        "format",
        settings.format,
        setter((v) => {
          settings.format = v;
        }, "Format changed"),
        { options: formats.map((f) => [f[0], f[1]]) },
      ),
      check(
        "Include mixed stereo audio",
        "includeAudio",
        settings.includeAudio,
        (v) =>
          edit(
            () => {
              settings.includeAudio = v;
            },
            "Sound export changed",
            { context: true },
          ),
      ),
    );
    node.append(
      details("Technical settings", technical),
      soundBalanceControls(),
    );
    if (exporting) {
      const progress = el("div", "export-progress");
      const label = el("strong", "", "Starting export…");
      label.id = "exportPercent";
      const bar = el("progress");
      bar.id = "exportProgress";
      bar.max = 1;
      bar.value = 0;
      bar.setAttribute("aria-label", "Export progress");
      const elapsed = el("p", "muted");
      elapsed.id = "exportProcessed";
      const remaining = el("p", "muted");
      remaining.id = "exportRemaining";
      progress.append(
        label,
        bar,
        elapsed,
        remaining,
        B(
          "cancelExport",
          "Cancel export",
          () => {
            exportMessage = "Export cancelled. Your project is ready to edit.";
            exportAbort?.abort();
            engine.stop();
          },
          { id: "cancelButton", primary: true, wrapperClass: "full-width" },
        ),
      );
      node.append(progress);
      return;
    }
    if (exportMessage) node.append(el("p", "notice", exportMessage));
    if (results.length) {
      const list = el("div", "export-results");
      for (const [i, result] of results.entries()) {
        const card = el("div", "export-result");
        card.append(
          el(
            "strong",
            "",
            results.length === 1 ? "Your movie is ready" : "Segment " + (i + 1),
          ),
          el(
            "p",
            "export-facts",
            result.name +
              " · " +
              bytes(result.blob.size) +
              " · " +
              result.width +
              " × " +
              result.height,
          ),
          B(
            "downloadVideo",
            "Download video",
            () => download(result.blob, result.name),
            {
              id: i === 0 ? "downloadButton" : undefined,
              primary: i === 0,
              wrapperClass: "full-width",
            },
          ),
        );
        if (results.length > 1)
          card.append(B("play", "Preview segment", () => showResult(result)));
        list.append(card);
      }
      node.append(list);
    }
    const next = el("div", "next-action");
    next.append(
      B(
        "exportVideo",
        results.length ? "Export again" : "Export video",
        () => exportMovie(false),
        {
          id: "exportButton",
          primary: !results.length,
          disabled:
            !project.duration ||
            !formats.length ||
            !dimensions.width ||
            project.assets.some(
              (a) =>
                project.items.some((i) => i.assetId === a.id) &&
                !library.has(a.id),
            ),
          reason: !project.duration
            ? "Add a video or image first."
            : "Relink all media and choose a format this browser can record.",
          wrapperClass: "full-width",
        },
      ),
    );
    node.append(next);
    node.append(
      details(
        "Interval cuts and separate files",
        field(
          "Cut every (sec)",
          "segmentInterval",
          settings.segmentInterval,
          setter((v) => {
            settings.segmentInterval = v;
          }, "Interval changed"),
          { min: 0.1, step: 0.1, id: "segmentInterval" },
        ),
        check("Show interval cuts", "segmentCuts", showCuts, (v) => {
          showCuts = v;
          renderTimeline();
        }),
        B("exportSegments", "Export segments", () => exportMovie(true), {
          id: "exportSegmentsButton",
          disabled: !project.duration || !formats.length,
          reason: "Add media and choose a supported recording format.",
        }),
        el(
          "small",
          "",
          "At least 0.1 seconds per segment. Up to 60 downloadable files. A short final remainder stays with the previous segment.",
        ),
      ),
    );
  }
  function showResult(result) {
    $("previewCanvas").hidden = true;
    $("outputVideo").hidden = false;
    $("outputVideo").src = result.url;
    $("outputVideo").load();
    $("interactionBox").hidden = true;
    $("safeArea").hidden = true;
  }
  async function exportMovie(segmented) {
    if (exporting) return;
    engine.stop();
    const ranges = segmented
      ? M.segmentRanges(
          project.duration,
          project.exportSettings.segmentInterval,
          project.exportSettings.fps,
        )
      : [{ start: 0, end: project.duration }];
    clearResults();
    exportMessage = "";
    exporting = true;
    exportAbort = new AbortController();
    document.body.classList.add("is-exporting");
    renderAll();
    const before = project.playhead;
    try {
      await store.flush();
      for (let index = 0; index < ranges.length; index++) {
        if (exportAbort.signal.aborted) break;
        const range = ranges[index],
          result = await engine.recordRange(
            range.start,
            range.end,
            (progress) => {
              const percent = $("exportPercent");
              if (percent)
                percent.textContent =
                  (ranges.length > 1
                    ? "Segment " + (index + 1) + " of " + ranges.length + " · "
                    : "") +
                  Math.round(progress.percent * 100) +
                  "%";
              if ($("exportProgress"))
                $("exportProgress").value = progress.percent;
              if ($("exportProcessed"))
                $("exportProcessed").textContent =
                  "Processed " +
                  time(progress.processed) +
                  " of " +
                  time(progress.total);
              if ($("exportRemaining"))
                $("exportRemaining").textContent =
                  progress.remaining === null
                    ? "Estimating time remaining…"
                    : "About " +
                      Math.ceil(progress.remaining) +
                      " sec remaining";
            },
            exportAbort.signal,
          );
        if (!result) break;
        result.name =
          filename(project.name) +
          (segmented ? "-segment-" + String(index + 1).padStart(3, "0") : "") +
          "." +
          result.extension;
        result.url = URL.createObjectURL(result.blob);
        results.push(result);
      }
      if (results.length === ranges.length)
        exportMessage =
          "Export complete. Preview your movie and download it below.";
    } catch (error) {
      exportMessage = error.message;
      report(error);
    } finally {
      if (exportAbort.signal.aborted) clearResults();
      exportAbort = null;
      exporting = false;
      document.body.classList.remove("is-exporting");
      project.playhead = before;
      renderAll();
      if (results.length) showResult(results[0]);
      else await seekTo(before);
      store.schedule(project);
    }
    return results;
  }
  function setupGlobalEvents() {
    const dialogNode = $("studioDialog");
    dialogNode.addEventListener("cancel", () => {
      if (dialogCleanup) {
        dialogCleanup();
        dialogCleanup = null;
      }
      H.close();
    });
    document.addEventListener("keydown", (event) => {
      if (projectLoading) return;
      if (dialogNode.open) return;
      if (event.target.closest("input,textarea,select,[contenteditable=true]"))
        return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (exporting) return;
      if (event.code === "Space") {
        event.preventDefault();
        engine.playing ? engine.stop() : engine.play().catch(report);
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        cutSelected();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      } else if (
        ["ArrowLeft", "ArrowRight"].includes(event.key) &&
        !event.target.closest(".timeline-item,.interaction-box")
      ) {
        event.preventDefault();
        seekTo(
          project.playhead +
            (event.key === "ArrowLeft" ? -1 : 1) / project.exportSettings.fps,
        ).catch(report);
      }
    });
    let depth = 0;
    document.addEventListener("dragenter", (event) => {
      if ([...event.dataTransfer.types].includes("Files")) {
        event.preventDefault();
        depth++;
        document.body.classList.add("is-dragging-file");
      }
    });
    document.addEventListener("dragover", (event) => {
      if ([...event.dataTransfer.types].includes("Files"))
        event.preventDefault();
    });
    document.addEventListener("dragleave", () => {
      if (--depth <= 0) document.body.classList.remove("is-dragging-file");
    });
    document.addEventListener("drop", async (event) => {
      document.body.classList.remove("is-dragging-file");
      depth = 0;
      if (!event.dataTransfer.files.length) return;
      event.preventDefault();
      const files = [...event.dataTransfer.files];
      for (const kind of ["video", "audio", "image"]) {
        const matches = files.filter((file) => {
          try {
            return Media.fileKind(file) === kind;
          } catch {
            return false;
          }
        });
        if (matches.length) await importFiles(matches, kind);
      }
    });
    root.addEventListener("pagehide", () => {
      engine.stop();
      store.flush().catch(() => {});
    });
    new ResizeObserver(resizePreview).observe($("stageViewport"));
  }
  async function boot() {
    setupEngine();
    setupFileInputs();
    setupStage();
    setupGlobalEvents();
    renderAll();
    try {
      const saved = await store.load();
      if (
        saved &&
        (saved.items.length ||
          saved.assets.length ||
          saved.name !== "Untitled movie")
      ) {
        dialog("Continue your movie", (body, foot) => {
          body.append(
            el("p", "", saved.name),
            el(
              "p",
              "muted",
              saved.assets.length +
                " files · " +
                M.formatTime(saved.duration, saved.exportSettings.fps) +
                " · saved in this browser session",
            ),
          );
          foot.append(
            B("newProject", "Start new project", startNew),
            B(
              "continueProject",
              "Continue last project",
              async () => {
                closeDialog();
                await replaceProject(saved);
              },
              { primary: true, id: "continueProjectButton" },
            ),
          );
        });
      }
    } catch (error) {
      saveStatus = "Session recovery unavailable";
      $("saveStatus").textContent = saveStatus;
      report(error);
    }
    root.UsefulToolVideoEditor.ready = true;
  }
  root.UsefulToolVideoEditor = {
    get project() {
      return project;
    },
    get library() {
      return library;
    },
    get renderer() {
      return renderer;
    },
    get mixer() {
      return mixer;
    },
    get engine() {
      return engine;
    },
    get selectedItem() {
      return selected();
    },
    get history() {
      return history;
    },
    get results() {
      return results;
    },
    get store() {
      return store;
    },
    get exporting() {
      return exporting;
    },
    get loading() {
      return projectLoading;
    },
    importFiles,
    selectItem,
    seekTo,
    renderAll,
    edit,
    undo,
    redo,
    replaceProject,
    exportMovie,
    saveProject,
    addNewItem,
    setStep,
    Model: M,
    Media,
    ready: false,
  };
  boot().catch(report);
})(globalThis);
