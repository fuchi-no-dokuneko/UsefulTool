(async () => {
  const checks = [],
    metrics = {},
    errors = [];
  window.TEST_PROGRESS = { current: "Importing routing fixtures", checks };
  const check = (name, passed, detail) => {
    checks.push({ name, passed: !!passed, detail });
    if (!passed)
      throw new Error(name + (detail ? ": " + JSON.stringify(detail) : ""));
  };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const wait = async (fn, timeout = 30000) => {
    const end = performance.now() + timeout;
    while (!fn()) {
      if (performance.now() > end)
        throw new Error("Timed out: " + window.TEST_PROGRESS.current);
      await delay(20);
    }
  };
  const frame = document.getElementById("studio");
  let w, d, api, M;
  const bind = () => {
    w = frame.contentWindow;
    d = frame.contentDocument;
    api = w.UsefulToolVideoEditor;
    M = api.Model;
    w.addEventListener("error", (e) => errors.push(e.message));
    w.addEventListener("unhandledrejection", (e) =>
      errors.push(String(e.reason)),
    );
    const original = w.console.error.bind(w.console);
    w.console.error = (...args) => {
      errors.push(args.map(String).join(" "));
      original(...args);
    };
  };
  const q = (s) => d.querySelector(s);
  const click = (help, scope = "#contextPanel") => {
    const control = q(scope + ' button[data-help-id="' + help + '"]');
    if (!control || control.disabled)
      throw new Error("Unavailable control: " + help);
    control.click();
  };
  const input = (name, value) => {
    const node = q('#contextPanel [data-control="' + name + '"]');
    if (!node) throw new Error("Missing input: " + name);
    node.value = value;
    node.dispatchEvent(new w.Event("input", { bubbles: true }));
    node.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const upload = async (name, blob) => {
    const response = await fetch("/__video-studio-test__/" + name, {
      method: "POST",
      body: blob,
    });
    if (!response.ok) throw new Error("Could not save test artifact " + name);
  };
  const tone = (data, rate, hz) => {
    const start = Math.round(rate * 0.15),
      end = Math.min(data.length, Math.round(rate * 0.65));
    let sin = 0,
      cos = 0;
    for (let n = start; n < end; n++) {
      sin += data[n] * Math.sin((2 * Math.PI * hz * n) / rate);
      cos += data[n] * Math.cos((2 * Math.PI * hz * n) / rate);
    }
    return (Math.hypot(sin, cos) * 2) / (end - start);
  };
  const tones = (buffer) =>
    [0, 1].map((ch) =>
      [440, 880].map((hz) =>
        tone(buffer.getChannelData(ch), buffer.sampleRate, hz),
      ),
    );
  const pixel = (canvas) =>
    [
      ...canvas
        .getContext("2d", { willReadFrequently: true })
        .getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data,
    ].slice(0, 3);
  const closeTo = (actual, expected, tolerance = 5) =>
    actual.every((v, i) => Math.abs(v - expected[i]) < tolerance);
  let requestId = 0;
  const actualClick = async (selector, screenshot) => {
    const id = ++requestId;
    window.UAT_REQUEST = { id, selector, screenshot };
    await wait(() => window.UAT_RESPONSE?.id === id);
    if (window.UAT_RESPONSE.error) throw new Error(window.UAT_RESPONSE.error);
  };
  try {
    await wait(() => frame.contentWindow.UsefulToolVideoEditor?.ready);
    bind();
    const read = async (name) =>
      new w.File(
        [
          await (
            await fetch(
              "../../build/reports/video-studio/routing-fixtures/" + name,
            )
          ).blob(),
        ],
        name,
        { type: name.endsWith(".mp4") ? "video/mp4" : "audio/mpeg" },
      );
    await api.importFiles(
      await Promise.all(["clip-a.mp4", "clip-b.mp4", "long.mp4"].map(read)),
      "video",
    );
    await api.importFiles(
      await Promise.all(
        ["song-left.mp3", "song-right.mp3", "dual.mp3"].map(read),
      ),
      "audio",
    );
    click("cancel", "#studioDialog");
    const assets = M.copy(api.project.assets),
      asset = (name) => assets.find((a) => a.name === name);
    const fresh = () => {
      const p = M.createProject();
      p.assets = M.copy(assets);
      p.name = "Routing UAT";
      p.exportSettings.quality = "high";
      p.exportSettings.bitrate = 1;
      return p;
    };
    let p = fresh();
    const video = M.addMedia(p, asset("long.mp4").id);
    M.trimItem(p, video.id, "end", 2);
    const a = M.addMedia(p, asset("song-left.mp3").id, {
      start: 0,
      duration: 2,
    });
    const b = M.addMedia(p, asset("song-right.mp3").id, {
      start: 0,
      duration: 2,
    });
    await api.replaceProject(p);
    api.setStep("arrange");
    api.selectItem(a.id, false);
    const lanes = [...d.querySelectorAll(".audio-waveform-lane")];
    lanes[0].scrollIntoView({ block: "center" });
    check(
      "normal desktop Sound panel displays two labelled L/R lanes outside collapsed settings",
      lanes.length === 2 &&
        lanes[0].textContent === "L — Left" &&
        lanes[1].textContent === "R — Right" &&
        lanes.every(
          (lane) =>
            lane.querySelector("canvas").getBoundingClientRect().height > 0 &&
            !lane.closest("details"),
        ),
    );
    check(
      "decoded L/R peaks are distinct and a right-channel-only source is not shown as combined stereo",
      asset("song-left.mp3").waveformLeft.every((n) => n < 0.002) &&
        Math.max(...asset("song-left.mp3").waveformRight) > 0.25,
    );
    check(
      "Stereo, Left only, Right only and both 0–100% output controls are visible in the basic panel",
      ["channelStereo", "channelLeft", "channelRight"].every(
        (id) =>
          q('button[data-help-id="' + id + '"]').getBoundingClientRect()
            .height > 0,
      ) &&
        ["leftGain", "rightGain"].every((id) => {
          const c = q('[data-control="' + id + '"]');
          return !c.closest("details") && c.min === "0" && c.max === "100";
        }),
    );
    click("channelLeft");
    api.selectItem(b.id, false);
    click("channelRight");
    q(".audio-waveforms").scrollIntoView({ block: "center" });
    await actualClick(null, "routing-audio");
    check(
      "two overlapping songs retain independent left-only and right-only settings",
      M.item(api.project, a.id).audio.channelMode === "leftOnly" &&
        M.item(api.project, b.id).audio.channelMode === "rightOnly" &&
        !M.audioConflicts(api.project).length,
    );
    input("rightGain", 63);
    check(
      "manual output gain persists as custom mode with one-ear downmix",
      api.selectedItem.audio.channelMode === "custom" &&
        M.audioRouting(api.selectedItem.audio).mono &&
        api.selectedItem.audio.rightGain === 0.63,
    );
    api.undo();
    check(
      "Undo restores the preset and both gains as one edit",
      api.selectedItem.audio.channelMode === "rightOnly" &&
        api.selectedItem.audio.rightGain === 1,
    );
    api.redo();
    check(
      "Redo restores custom gain and routing together",
      api.selectedItem.audio.channelMode === "custom" &&
        api.selectedItem.audio.rightGain === 0.63,
    );
    click("channelRight");
    const savedItems = JSON.stringify(api.project.items);
    await api.store.flush();
    frame.contentWindow.location.reload();
    await delay(100);
    await wait(
      () =>
        frame.contentWindow.UsefulToolVideoEditor?.ready &&
        frame.contentDocument.getElementById("continueProjectButton"),
    );
    bind();
    d.getElementById("continueProjectButton").click();
    await wait(() => !api.loading && api.project.items.length === 3);
    check(
      "browser recovery preserves both songs, routing gains and all source media",
      JSON.stringify(api.project.items) === savedItems &&
        api.project.assets.every((a) => api.library.has(a.id)),
    );
    const portable = M.parseProject(M.serialize(api.project));
    const NativeFrame = w.VideoFrame,
      previousLibrary = api.library;
    let handoffs = 0;
    w.VideoFrame = new Proxy(NativeFrame, {
      construct(target, args) {
        if (
          api.library !== previousLibrary &&
          args[0] instanceof w.HTMLVideoElement &&
          !handoffs++
        )
          throw new w.DOMException(
            "Injected decoder handoff",
            "InvalidStateError",
          );
        return Reflect.construct(target, args);
      },
    });
    try {
      await api.replaceProject(portable);
    } finally {
      w.VideoFrame = NativeFrame;
    }
    check(
      "project reopening survives a transient native VideoFrame handoff",
      handoffs > 0 && !api.loading,
    );
    check(
      "downloadable project JSON reopens with unchanged audio routing and source ranges",
      JSON.stringify(api.project.items) === savedItems,
    );

    window.TEST_PROGRESS.current =
      "Comparing real audio graph with export samples";
    const { Audio, Export } = w.UTStudio;
    const sources = new Export.Sources(api.project, api.library, 0, 2);
    const reference = await sources.mix(0, 48000);
    const offline = new w.OfflineAudioContext(2, 48000, 48000),
      limiter = Audio.createLimiter(offline);
    limiter.connect(offline.destination);
    for (const value of api.project.items.filter((i) => i.audio)) {
      const pcm = await sources.audio(value.assetId),
        buffer = offline.createBuffer(2, 48000, 48000);
      buffer.copyToChannel(pcm.left.subarray(0, 48000), 0);
      buffer.copyToChannel(pcm.right.subarray(0, 48000), 1);
      const source = offline.createBufferSource();
      source.buffer = buffer;
      Audio.createRouting(offline, source, limiter).apply(
        M.audioGains(api.project, value, 0),
      );
      source.start();
    }
    const routed = await offline.startRendering();
    let difference = 0;
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < reference.length; i++)
        difference = Math.max(
          difference,
          Math.abs(
            reference.getChannelData(c)[i] - routed.getChannelData(c)[i],
          ),
        );
    metrics.graphSampleDifference = difference;
    check(
      "preview routing graph and export mixer generate identical left/right PCM",
      difference < 0.000003,
      difference,
    );
    check(
      "opposite source channels survive downmix into the intended ears",
      tones(reference)[0][0] > 0.1 &&
        tones(reference)[0][1] < 0.001 &&
        tones(reference)[1][1] > 0.1 &&
        tones(reference)[1][0] < 0.001,
      tones(reference),
    );
    await sources.dispose();
    // A stereo song contains both pitches; either single-ear preset must retain both.
    const dualProject = fresh(),
      dual = M.addMedia(dualProject, asset("dual.mp3").id, {
        start: 0,
        duration: 1,
      });
    for (const mode of ["stereo", "leftOnly", "rightOnly"]) {
      M.setChannelMode(dual, mode);
      const decoder = new Export.Sources(dualProject, api.library, 0, 1),
        mixed = await decoder.mix(0, 48000),
        spectrum = tones(mixed);
      if (mode === "stereo")
        check(
          "Stereo preserves original independent 440 Hz Left and 880 Hz Right",
          spectrum[0][0] > 0.25 &&
            spectrum[0][1] < 0.001 &&
            spectrum[1][1] > 0.15 &&
            spectrum[1][0] < 0.001,
          spectrum,
        );
      else {
        const ear = mode === "leftOnly" ? 0 : 1;
        check(
          mode +
            " retains both source pitches and silences only the other output ear",
          spectrum[ear][0] > 0.1 &&
            spectrum[ear][1] > 0.07 &&
            spectrum[1 - ear].every((n) => n < 0.00001),
          spectrum,
        );
      }
      await decoder.dispose();
    }
    await api.mixer.ready();
    const chunks = [],
      recorder = new w.MediaRecorder(api.mixer.capture.stream, {
        mimeType: "audio/webm;codecs=opus",
      });
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    recorder.start();
    await api.engine.play({ start: 0, end: 0.9 });
    recorder.stop();
    await stopped;
    const recorded = await new w.OfflineAudioContext(
      2,
      1,
      48000,
    ).decodeAudioData(await new w.Blob(chunks).arrayBuffer());
    metrics.livePreviewTones = tones(recorded);
    check(
      "actual preview MediaElement graph sends different songs to the two ears",
      recorded.numberOfChannels === 2 &&
        metrics.livePreviewTones[0][0] > 0.05 &&
        metrics.livePreviewTones[0][1] < 0.003 &&
        metrics.livePreviewTones[1][1] > 0.05 &&
        metrics.livePreviewTones[1][0] < 0.003,
      metrics.livePreviewTones,
    );
    const stereoExport = await api.engine.recordRange(0, 2);
    await upload("routing-stereo.webm", stereoExport.blob);
    const opus = await new w.OfflineAudioContext(2, 1, 48000).decodeAudioData(
      await stereoExport.blob.arrayBuffer(),
    );
    metrics.exportTones = tones(opus);
    check(
      "final Opus stereo carries the same left/right songs as live preview",
      opus.numberOfChannels === 2 &&
        metrics.exportTones[0][0] > 0.1 &&
        metrics.exportTones[0][1] < 0.003 &&
        metrics.exportTones[1][1] > 0.1 &&
        metrics.exportTones[1][0] < 0.003,
      metrics.exportTones,
    );

    window.TEST_PROGRESS.current = "Main-to-Overlay connected fade";
    p = fresh();
    const clipA = M.addMedia(p, asset("clip-a.mp4").id),
      clipB = M.addMedia(p, asset("clip-b.mp4").id);
    clipA.fadeOut = 1;
    clipB.fadeIn = 1;
    clipB.blendMode = "alpha";
    M.addEffect(clipB, "hue").amount = 0;
    M.addEffect(clipB, "grayscale").enabled = false;
    const sound = p.items.find((i) => i.audio && i.linkId === clipB.linkId);
    M.setChannelMode(sound, "rightOnly");
    sound.audio.rightGain = 0.6;
    await api.replaceProject(p);
    api.setStep("arrange");
    api.selectItem(clipB.id, false);
    const beforeB = M.copy(api.selectedItem),
      beforeSound = M.copy(M.item(api.project, sound.id)),
      beforeIndex = api.history.index;
    const pointer = (target, type, x, y) =>
      target.dispatchEvent(
        new w.PointerEvent(type, {
          bubbles: true,
          pointerId: 13,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: y,
        }),
      );
    const card = q('.timeline-item[data-item-id="' + clipB.id + '"]');
    card.scrollIntoView({ block: "nearest" });
    const rect = card.getBoundingClientRect(),
      row = q('.track-row[data-layer-id="overlay-1"]').getBoundingClientRect();
    const x = rect.left + rect.width / 2,
      y = rect.top + rect.height / 2,
      targetY = row.top + row.height / 2;
    pointer(card, "pointerdown", x, y);
    pointer(d, "pointermove", x, targetY);
    pointer(d, "pointerup", x, targetY);
    check(
      "desktop drag moves connected Clip B from 4–8 to 3–7 seconds on Overlay 1",
      M.item(api.project, clipB.id).layerId === "overlay-1" &&
        M.item(api.project, clipB.id).start === 3 &&
        M.item(api.project, clipB.id).end === 7,
    );
    check(
      "move preserves every video property and linked original-audio routing except timeline placement",
      JSON.stringify(M.item(api.project, clipB.id)) ===
        JSON.stringify({
          ...beforeB,
          start: 3,
          end: 7,
          layerId: "overlay-1",
        }) &&
        JSON.stringify(M.item(api.project, sound.id)) ===
          JSON.stringify({ ...beforeSound, start: 3, end: 7 }),
    );
    check(
      "drag contributes exactly one Undo entry",
      api.history.index === beforeIndex + 1,
    );
    api.undo();
    check(
      "single Undo restores original Main picture and sound",
      M.item(api.project, clipB.id).start === 4 &&
        M.item(api.project, clipB.id).layerId === "main" &&
        M.item(api.project, sound.id).start === 4,
    );
    api.redo();
    check(
      "single Redo restores connected overlap",
      M.item(api.project, clipB.id).start === 3 &&
        M.item(api.project, sound.id).start === 3,
    );
    metrics.fadePreview = {};
    for (const [time, expected] of [
      [3, [254, 0, 0]],
      [3.5, [64, 0, 127]],
      [4, [0, 0, 254]],
    ]) {
      await api.seekTo(time);
      const rgb = pixel(d.getElementById("previewCanvas"));
      metrics.fadePreview[time] = rgb;
      check(
        "editor frame at " + time + "s shows the connected Layer alpha fade",
        closeTo(rgb, expected),
        rgb,
      );
    }
    await api.seekTo(3.5);
    await actualClick(null, "routing-fade");
    const exportPixels = {};
    const fadeExport = await api.engine.recordRange(0, 7, () => {
      const t = api.project.playhead;
      for (const at of [3, 3.5, 4])
        if (Math.abs(t - at) < 1e-6)
          exportPixels[at] = pixel(d.getElementById("previewCanvas"));
    });
    check(
      "exported preview uses identical project-time compositing at fade boundaries",
      [3, 3.5, 4].every(
        (t) =>
          exportPixels[t] &&
          closeTo(exportPixels[t], metrics.fadePreview[t], 1),
      ),
      exportPixels,
    );
    await upload("routing-fade.webm", fadeExport.blob);
    const encoded = d.createElement("video");
    encoded.muted = true;
    encoded.src = w.URL.createObjectURL(fadeExport.blob);
    try {
      const canvas = d.createElement("canvas");
      canvas.width = 192;
      canvas.height = 108;
      for (const t of [3, 3.5, 4]) {
        await w.UTStudio.Media.seek(encoded, t);
        canvas.getContext("2d").drawImage(encoded, 0, 0);
        check(
          "encoded frame at " + t + "s matches editor Layer alpha",
          closeTo(pixel(canvas), metrics.fadePreview[t], 8),
          pixel(canvas),
        );
      }
    } finally {
      w.URL.revokeObjectURL(encoded.src);
      encoded.removeAttribute("src");
      encoded.load();
    }

    window.TEST_PROGRESS.current = "106-second segmented export";
    p = fresh();
    p.name = "Routing UAT";
    p.exportSettings.segmentInterval = 0.1;
    M.addMedia(p, asset("long.mp4").id);
    for (const [name, mode] of [
      ["song-left.mp3", "leftOnly"],
      ["song-right.mp3", "rightOnly"],
    ]) {
      const value = M.addMedia(p, asset(name).id, { start: 0 });
      M.setChannelMode(value, mode);
      M.setRepeat(p, value.id, true, true);
    }
    await api.replaceProject(p);
    api.setStep("export");
    check(
      "106-second project accepts a 0.1-second interval yielding 1060 contiguous ranges",
      api.project.duration === 106 && M.segmentRanges(106, 0.1).length === 1060,
    );
    const realRecord = api.engine.recordRange.bind(api.engine),
      progressValues = [];
    let recordedSegments = 0,
      decodedSongs = 0;
    const originalAudio = w.UTStudio.Export.Sources.prototype.audio;
    w.UTStudio.Export.Sources.prototype.audio = function (id) {
      if (!this.pcm.has(id)) decodedSongs++;
      return originalAudio.call(this, id);
    };
    api.engine.recordRange = async (start, end, progress, signal, cache) => {
      recordedSegments++;
      if (recordedSegments % 100 === 0)
        window.TEST_PROGRESS.current =
          "Encoding segment " + recordedSegments + " of 1060";
      return realRecord(
        start,
        end,
        (state) => {
          progress(state);
          progressValues.push(d.getElementById("exportProgress").value);
        },
        signal,
        cache,
      );
    };
    const begin = performance.now();
    await api.exportMovie(true);
    metrics.zipSeconds = (performance.now() - begin) / 1000;
    w.UTStudio.Export.Sources.prototype.audio = originalAudio;
    api.engine.recordRange = realRecord;
    check(
      "real encoders produced 1060 segments but only one ZIP result and download control",
      recordedSegments === 1060 &&
        api.results.length === 1 &&
        api.results[0].count === 1060 &&
        api.results[0].name === "Routing UAT-segments.zip" &&
        d.querySelectorAll("#downloadButton").length === 1,
      {
        recordedSegments,
        count: api.results[0]?.count,
        name: api.results[0]?.name,
        error: q("#contextError")?.textContent,
      },
    );
    check(
      "audio PCM is decoded once per song and reused across all interval segments",
      decodedSongs === 2,
      decodedSongs,
    );
    check(
      "total progress never resets between segments and reaches 100 percent",
      progressValues.length > 1060 &&
        progressValues.every(
          (n, i) => !i || n >= progressValues[i - 1] - 1e-9,
        ) &&
        progressValues.at(-1) === 1,
    );
    check(
      "ZIP is disk-backed and never replaces the preview with an unplayable archive",
      api.results[0].blob instanceof w.File &&
        d.getElementById("outputVideo").hidden,
    );
    const zip = api.results[0];
    d.getElementById("downloadButton").scrollIntoView({ block: "center" });
    await actualClick(null, "routing-zip");
    await upload("routing-segments.zip", zip.blob);
    await actualClick("#downloadButton");
    const downloadName = zip.name;

    // Cancellation and per-segment failures must not expose a partial archive.
    window.TEST_PROGRESS.current = "Cancellation, failure and recovery";
    let attempts = 0;
    api.engine.recordRange = async (start, end, progress, signal, cache) => {
      attempts++;
      return realRecord(
        start,
        end,
        (state) => {
          progress(state);
          if (attempts === 2) d.getElementById("cancelButton").click();
        },
        signal,
        cache,
      );
    };
    await api.exportMovie(true);
    api.engine.recordRange = realRecord;
    check(
      "Cancel stops remaining segments, disposes the partial ZIP and leaves the project editable",
      attempts === 2 &&
        !api.exporting &&
        !api.results.length &&
        api.project.duration === 106 &&
        q("#contextPanel").textContent.includes("Export cancelled"),
    );
    attempts = 0;
    api.engine.recordRange = async (...args) => {
      if (++attempts === 2) throw new Error("Injected segment decoder failure");
      return realRecord(...args);
    };
    await api.exportMovie(true);
    api.engine.recordRange = realRecord;
    check(
      "a per-segment error identifies the exact failed interval with no misleading complete ZIP",
      attempts === 2 &&
        !api.results.length &&
        q("#contextPanel").textContent.includes("Segment 2 of 1060") &&
        q("#contextPanel").textContent.includes(
          "Injected segment decoder failure",
        ),
    );
    await api.store.flush();
    const saved = await api.store.load();
    check(
      "save/recovery after segment failure preserves the complete project and ear assignments",
      saved.duration === 106 &&
        saved.items
          .filter((i) => i.audio)
          .map((i) => i.audio.channelMode)
          .sort()
          .join(",") === "leftOnly,rightOnly",
    );
    check(
      "zero application console errors or unhandled exceptions throughout desktop acceptance",
      errors.length === 0,
      errors,
    );
    window.TEST_RESULT = { passed: true, checks, metrics, downloadName };
  } catch (error) {
    window.TEST_RESULT = {
      passed: false,
      checks,
      metrics,
      errors,
      error: error.stack,
      uiError: q("#contextError")?.textContent,
    };
  }
  document.getElementById("result").textContent = JSON.stringify(
    window.TEST_RESULT,
    null,
    2,
  );
})();
