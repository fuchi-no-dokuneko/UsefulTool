(async () => {
  const checks = [];
  window.TEST_PROGRESS = checks;
  const check = (name, condition) => {
    checks.push({ name, passed: !!condition });
    if (!condition) throw new Error(name);
  };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const wait = async (predicate, timeout = 15000) => {
    const start = performance.now();
    while (!predicate()) {
      if (performance.now() - start > timeout)
        throw new Error("Wait timed out");
      await delay(20);
    }
  };
  const frame = document.getElementById("studio");
  let w, d, api, M;
  const click = (selector) => {
    const target = d.querySelector(selector);
    if (!target || target.disabled)
      throw new Error("Unavailable control " + selector);
    target.click();
  };
  const change = (selector, value) => {
    const target = d.querySelector(selector);
    if (!target) throw new Error("Missing field " + selector);
    target.value = value;
    target.dispatchEvent(new w.Event("input", { bubbles: true }));
    target.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const pointer = (target, type, x, y, extra = {}) =>
    target.dispatchEvent(
      new w.PointerEvent(type, {
        bubbles: true,
        pointerId: 8,
        pointerType: "mouse",
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        clientX: x,
        clientY: y,
        ...extra,
      }),
    );
  const drag = (target, dx, dy) => {
    const r = target.getBoundingClientRect(),
      x = r.left + r.width / 2,
      y = r.top + r.height / 2;
    pointer(target, "pointerdown", x, y);
    pointer(d, "pointermove", x + dx, y + dy, { shiftKey: true });
    pointer(d, "pointerup", x + dx, y + dy);
  };
  try {
    await wait(() => frame.contentWindow.UsefulToolVideoEditor?.ready);
    w = frame.contentWindow;
    d = frame.contentDocument;
    api = w.UsefulToolVideoEditor;
    M = api.Model;
    const source = await (await fetch("fixtures/source.mp4")).blob();
    await api.importFiles(
      [1, 2, 3].map(
        (i) =>
          new w.File([source], "take-" + i + ".mp4", { type: "video/mp4" }),
      ),
      "video",
    );
    api.setStep("arrange");
    const first = M.mainItems(api.project)[0];
    api.selectItem(first.id, false);
    await api.seekTo(0.3);
    const end = first.end,
      mainSound = api.project.items.find(
        (i) => i.kind === "audio" && i.linkedGroupId === first.linkedGroupId,
      ),
      soundEnd = mainSound.end;
    const handle = d.querySelector(
      `[data-item-id="${first.id}"] .trim-handle.end button`,
    );
    const zoom = Number(
      d.querySelector('input[aria-label="Timeline zoom"]').value,
    );
    drag(handle, -zoom * 0.2, 0);
    check(
      "pointer trim shortens linked picture and sound while retaining selection",
      Math.abs(M.item(api.project, first.id).end - (end - 0.2)) < 0.02 &&
        Math.abs(M.item(api.project, mainSound.id).end - (soundEnd - 0.2)) < 0.02 &&
        api.selectedItem.id === first.id,
    );
    check(
      "drag offers the eight-second Undo toast",
      !d.getElementById("undoToast").hidden &&
        d.querySelector('#undoToast [data-help-id="undo"]'),
    );
    api.undo();
    await delay(50);
    check(
      "Undo restores the source range after pointer trim",
      Math.abs(M.item(api.project, first.id).end - end) < 0.001,
    );
    api.addNewItem("text");
    await api.seekTo(0.3);
    const textId = api.selectedItem.id,
      oldX = api.selectedItem.transform.x,
      oldWidth = api.selectedItem.transform.width;
    drag(d.getElementById("interactionBox"), 24, 12);
    check(
      "preview dragging moves the selected text in project coordinates",
      api.selectedItem.id === textId && api.selectedItem.transform.x > oldX,
    );
    drag(d.querySelector('.resize-handle[data-handle="se"] button'), 30, 15);
    check(
      "preview corner resizing changes text box and font size",
      api.selectedItem.transform.width > oldWidth &&
        api.selectedItem.text.size > 9,
    );
    click('#contextPanel button[data-help-id="lockItem"]');
    const lockedX = api.selectedItem.transform.x;
    drag(d.getElementById("interactionBox"), 30, 0);
    check(
      "a locked selection ignores direct manipulation",
      api.selectedItem.transform.x === lockedX && api.selectedItem.locked,
    );
    click('#contextPanel button[data-help-id="lockItem"]');
    api.addNewItem("filter");
    await api.seekTo(0.3);
    const region = api.selectedItem.id,
      beforeBlur = M.copy(api.selectedItem.transform);
    drag(d.getElementById("interactionBox"), 20, 10);
    drag(d.querySelector('.resize-handle[data-handle="e"] button'), 20, 0);
    check(
      "blur rectangle supports both drag and resize without losing selection",
      api.selectedItem.id === region &&
        api.selectedItem.transform.x > beforeBlur.x &&
        api.selectedItem.transform.width > beforeBlur.width,
    );
    const add = d.querySelector('#mediaPanel button[data-help-id="addVideos"]');
    d.activeElement?.blur();
    w.UTStudio.Help.close();
    pointer(add, "pointerenter", 20, 20);
    await delay(250);
    check(
      "hover help waits before appearing",
      !d.querySelector("#studio-tooltip") ||
        d.querySelector("#studio-tooltip").hidden,
    );
    await delay(210);
    const tooltip = d.querySelector("#studio-tooltip"),
      bounds = tooltip.getBoundingClientRect();
    check(
      "hover tooltip uses the portal role and viewport-safe geometry",
      !tooltip.hidden &&
        tooltip.parentElement === d.body &&
        tooltip.getAttribute("role") === "tooltip" &&
        bounds.width <= 280 &&
        bounds.left >= 12 &&
        bounds.right <= w.innerWidth - 12,
    );
    pointer(add, "pointerleave", 20, 20);
    await delay(200);
    check("hover help closes after pointer leave", tooltip.hidden);
    const info = add.parentElement.querySelector(".touch-help");
    info.click();
    check(
      "touch information opens the same registered explanation",
      tooltip.textContent.includes(w.UTStudio.Help.HELP_CONTENT.addVideos[1]),
    );
    w.UTStudio.Help.close();
    const ids = api.project.assets
      .filter((a) => a.kind === "video")
      .map((a) => a.id);
    for (const template of Object.keys(w.UTStudio.AutoMovie.styles)) {
      const draft = await w.UTStudio.AutoMovie.generate(
        api.project,
        api.library,
        { template, length: "30", assetIds: ids },
      );
      const clips = M.mainItems(draft);
      check(
        template +
          " AutoMovie produces a bounded editable draft with title and explicit transitions",
        draft.workflow === "arrange" &&
          clips.length >= 3 &&
          clips.length <= 5 &&
          draft.items.some((i) => i.kind === "text") &&
          draft.transitions.length > 0 &&
          clips.every(
            (i) =>
              i.sourceIn >= 0 &&
              i.sourceOut <= M.asset(draft, i.assetId).duration + 0.001,
          ) &&
          Math.abs(M.visualEnd(draft) - 3.6) < 0.05,
      );
      check(
        template + " AutoMovie project can be saved and reopened",
        M.parseProject(M.serialize(draft)).items.length === draft.items.length,
      );
    }
    const beforeAuto = M.serialize(api.project);
    click('#mediaPanel button[data-help-id="autoMovie"]');
    check(
      "AutoMovie wizard exposes five styles and the requested target lengths",
      d.querySelectorAll('#studioDialog button[data-help-id="autoTemplate"]')
        .length === 5 &&
        d.querySelector('[data-control="targetLength"]').options.length === 3,
    );
    click('#studioDialog button[data-help-id="generateMovie"]');
    click('#replaceTimelineButton');
    await wait(() => !d.querySelector("dialog").open);
    check(
      "AutoMovie enters Arrange with a playable draft",
      api.project.workflow === "arrange" && api.project.transitions.length > 0,
    );
    api.undo();
    await delay(50);
    check(
      "one Undo restores the project before AutoMovie",
      JSON.stringify(api.project.items) ===
        JSON.stringify(JSON.parse(beforeAuto).items),
    );
    for (const template of ["rolling", "static", "pages"]) {
      api.addNewItem("credits", { template });
      const c = api.selectedItem,
        groupCount = c.credits.groups.length;
      click('#contextPanel button[data-help-id="addGroup"]');
      check(
        template + " credits keeps editable structured groups",
        api.selectedItem.credits.template === template &&
          api.selectedItem.credits.groups.length === groupCount + 1,
      );
    }
    const small = M.createProject();
    small.assets = M.copy(api.project.assets);
    M.addMedia(small, ids[0]);
    small.exportSettings.quality = "high";
    small.exportSettings.bitrate = 0.5;
    small.exportSettings.segmentInterval = 0.6;
    await api.replaceProject(small);
    api.setStep("export");
    const snapshot = JSON.stringify(api.project.items);
    const cancelled = api.exportMovie(false);
    click("#cancelButton");
    await cancelled;
    check(
      "immediate export cancellation leaves no output and preserves edits",
      !api.exporting &&
        api.results.length === 0 &&
        JSON.stringify(api.project.items) === snapshot,
    );
    const batch = api.exportMovie(true);
    await wait(() => api.results.length === 1 && api.exporting);
    click("#cancelButton");
    await batch;
    check(
      "cancelling a segment batch clears partial downloads",
      api.results.length === 0 && !api.exporting,
    );
    const segments = await api.exportMovie(true);
    check(
      "segment export produces two independent local files",
      segments.length === 2 &&
        segments.every(
          (r, i) =>
            r.blob.size > 100 &&
            r.name.includes("-segment-00" + (i + 1)) &&
            Math.abs(r.duration - 0.6) < 0.01,
        ),
    );
    const audio = api.project.items.find((i) => i.kind === "audio");
    M.setSpeed(api.project, audio.id, 2);
    const output = await api.engine.recordRange(0.05, 0.45);
    const pcm = await new w.OfflineAudioContext(2, 1, 48000).decodeAudioData(
      await output.blob.arrayBuffer(),
    );
    const samples = pcm.getChannelData(0);
    let best = { hz: 0, power: 0 };
    for (let hz = 300; hz <= 1000; hz += 5) {
      let real = 0,
        imag = 0;
      for (
        let i = Math.floor(samples.length * 0.2);
        i < samples.length * 0.8;
        i += 4
      ) {
        const angle = (2 * Math.PI * hz * i) / pcm.sampleRate;
        real += samples[i] * Math.cos(angle);
        imag += samples[i] * Math.sin(angle);
      }
      const power = real * real + imag * imag;
      if (power > best.power) best = { hz, power };
    }
    check(
      "2x original sound export preserves the 440 Hz pitch",
      best.hz >= 420 && best.hz <= 460 && best.power > 1,
    );
    frame.style.width = "900px";
    await delay(80);
    check(
      "tablet layout uses a 280px inspector and media drawer",
      Math.abs(
        d.querySelector(".context-panel").getBoundingClientRect().width - 280,
      ) < 1 &&
        w.getComputedStyle(d.querySelector(".media-panel")).position ===
          "fixed",
    );
    frame.style.width = "390px";
    await delay(80);
    api.setStep("arrange");
    check(
      "phone layout keeps a scrollable timeline and a bottom inspector",
      d.getElementById("timelineContent").getBoundingClientRect().width >=
        720 &&
        w.getComputedStyle(d.querySelector(".context-panel")).position ===
          "fixed" &&
        d.documentElement.scrollWidth <= 392,
    );
    frame.style.width = "1363px";
    await delay(80);
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
