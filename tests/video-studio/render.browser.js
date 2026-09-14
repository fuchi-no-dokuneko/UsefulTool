(async () => {
  const { Model: M, Media, Renderer, Audio } = UTStudio,
    checks = [];
  const check = (name, condition) => {
    checks.push({ name, passed: Boolean(condition) });
    if (!condition) throw new Error(name);
  };
  const near = (a, b, tolerance = 2) =>
    a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
  const pixel = (c, x = 16, y = 16) =>
    [...c.getContext("2d").getImageData(x, y, 1, 1).data].slice(0, 3);
  const solid = (colour) => {
    const c = Media.makeCanvas(32, 32);
    c.readyState = 4;
    const ctx = c.getContext("2d");
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 32, 32);
    return c;
  };
  const library = {
    assets: new Map(),
    elements: new Map(),
    element(value) {
      return this.elements.get(value.id);
    },
  };
  const p = M.createProject();
  p.canvas = { width: 32, height: 32, background: "#000000" };
  function video(colour, layerId = "main") {
    const a = M.addAsset(p, {
        kind: "video",
        id: M.id(),
        name: colour,
        size: 1,
        contentHash: colour,
        duration: 5,
        width: 32,
        height: 32,
      }),
      item = M.addMedia(p, a.id, { layerId, start: 0 });
    library.elements.set(item.id, solid(colour));
    return item;
  }
  try {
    const red = video("#ff0000"),
      green = video("#00ff00", "overlay-1"),
      blue = video("#0000ff", "overlay-2");
    const renderer = new Renderer(library),
      out = Media.makeCanvas(32, 32);
    M.applyOverlayPreset(p, [red.id, green.id, blue.id], "equal");
    renderer.render(p, 1, out);
    check(
      "equal three-video mixing produces one third red green and blue without darkening",
      near(pixel(out), [85, 85, 85]),
    );
    M.applyOverlayPreset(p, [red.id, green.id, blue.id], "soft");
    renderer.render(p, 1, out);
    check(
      "explicit layer alpha follows source-over pixel math",
      near(pixel(out), [75, 91, 89]),
    );
    const snapshot = M.copy(p),
      preview = Media.makeCanvas(32, 32),
      exportFrame = Media.makeCanvas(32, 32);
    renderer.render(p, 1, preview);
    renderer.render(snapshot, 1, exportFrame);
    check(
      "preview and export input frames are pixel-identical for the same project and time",
      String(preview.getContext("2d").getImageData(0, 0, 32, 32).data) ===
        String(exportFrame.getContext("2d").getImageData(0, 0, 32, 32).data),
    );
    M.layer(p, "overlay-1").visible = false;
    M.layer(p, "overlay-2").visible = false;
    red.blendMode = "alpha";
    red.opacity = 1;
    const originalSource = library.elements.get(red.id),
      originalTransform = M.copy(red.transform),
      smaller = Media.makeCanvas(16, 16),
      smallerContext = smaller.getContext("2d");
    smallerContext.fillStyle = "red";
    smallerContext.fillRect(0, 0, 8, 16);
    smallerContext.fillStyle = "blue";
    smallerContext.fillRect(8, 0, 8, 16);
    library.elements.set(red.id, smaller);
    red.transform.cropX = 16;
    red.transform.cropWidth = 16;
    renderer.render(p, 1, out);
    check(
      "resized video frames preserve source-coordinate cropping",
      near(pixel(out), [0, 0, 255]),
    );
    library.elements.set(red.id, originalSource);
    red.transform = originalTransform;
    M.setKey(red, 0, 0);
    M.setKey(red, 2, 1);
    renderer.render(p, 1, out);
    check(
      "visibility interpolation is applied at the requested frame time",
      near(pixel(out), [128, 0, 0]),
    );
    red.opacityKeys = [];
    const incoming = video("#0000ff");
    incoming.blendMode = "alpha";
    incoming.opacity = 0.5;
    red.opacity = 0.25;
    M.setTransition(p, incoming.id, {
      type: "crossfade",
      duration: 1,
      easing: "linear",
    });
    renderer.render(p, 4.5, out);
    check(
      "transition respects each source visibility independently",
      near(pixel(out), [32, 0, 64]),
    );
    red.fadeOut = 1;
    renderer.render(p, 4.5, out);
    check(
      "transition also multiplies the source fade",
      near(pixel(out), [16, 0, 64]),
    );
    M.deleteItem(p, incoming.id);
    red.opacity = 1;
    red.fadeOut = 0;
    for (const type of M.TRANSITIONS) {
      const a = solid("#ff0000"),
        b = solid("#0000ff");
      check(
        type + " transition starts on the outgoing picture",
        near(
          pixel(
            renderer.transition(
              a,
              b,
              { id: type, type, progress: 0, direction: "left" },
              32,
              32,
            ),
          ),
          [255, 0, 0],
        ),
      );
      check(
        type + " transition ends on the incoming picture",
        near(
          pixel(
            renderer.transition(
              a,
              b,
              { id: type, type, progress: 1, direction: "left" },
              32,
              32,
            ),
          ),
          [0, 0, 255],
        ),
      );
    }
    const middle = renderer.transition(
      solid("#ff0000"),
      solid("#0000ff"),
      { id: "balanced", type: "crossfade", progress: 0.5 },
      32,
      32,
    );
    check(
      "crossfade midpoint preserves image brightness",
      near(pixel(middle), [128, 0, 128]),
    );
    const dissolve = (progress) => [
      ...renderer
        .transition(
          solid("#ff0000"),
          solid("#0000ff"),
          { id: "seeded", type: "dissolve", progress },
          32,
          32,
        )
        .getContext("2d")
        .getImageData(0, 0, 32, 32).data,
    ];
    const first = dissolve(0.4);
    dissolve(0.8);
    check(
      "scrubbing backward reproduces the exact dissolve pattern",
      String(first) === String(dissolve(0.4)),
    );
    const checker = solid("#000000"),
      checkerCtx = checker.getContext("2d");
    checkerCtx.fillStyle = "#ffffff";
    for (let x = 0; x < 32; x += 2) checkerCtx.fillRect(x, 0, 1, 32);
    library.elements.set(red.id, checker);
    const blur = M.addLayerItem(p, "filter", { start: 0, duration: 5 });
    Object.assign(blur.transform, { x: 8, y: 8, width: 16, height: 16 });
    blur.filter.amount = 3;
    for (const type of M.BLURS) {
      blur.filter.type = type;
      blur.filter.amount = type === "radial" ? 50 : 3;
      renderer.render(p, 1, out);
      const outside = pixel(out, 2, 2),
        inside = pixel(out, 22, 16);
      check(
        type + " blur affects its rectangle while preserving pixels outside",
        near(outside, [255, 255, 255]) && inside[0] > 5 && inside[0] < 250,
      );
    }
    const later = M.addLayerItem(p, "text", { start: 6, duration: 1 });
    blur.opacity = 0;
    renderer.render(p, 1, out);
    check(
      "zero filter visibility leaves the target pixels unchanged",
      near(pixel(out, 22, 16), [255, 255, 255]),
    );
    blur.opacity = 1;
    blur.fadeIn = 2;
    renderer.render(p, 0.5, out);
    const gentleBlur = pixel(out, 22, 16)[0];
    renderer.render(p, 2.5, out);
    check(
      "filter fades interpolate the processed region",
      gentleBlur > pixel(out, 22, 16)[0],
    );
    blur.fadeIn = 0;
    later.text.content = "";
    renderer.render(p, 6, out);
    check(
      "blur range is inactive after its end",
      M.evaluateFrame(p, 6).items.every((e) => e.item.id !== blur.id) &&
        near(pixel(out), [0, 0, 0]),
    );
    blur.enabled = false;
    library.elements.set(red.id, solid("#808080"));
    red.effects = [];
    M.addEffect(red, "brightness").amount = 0.5;
    M.addEffect(red, "contrast").amount = 2;
    renderer.render(p, 1, out);
    const earlier = pixel(out)[0];
    red.effects.reverse();
    renderer.render(p, 1, out);
    check(
      "changing effect order changes the resulting pixels",
      Math.abs(earlier - pixel(out)[0]) > 40,
    );
    red.effects = [];
    const text = M.addLayerItem(p, "text", { start: 1, duration: 1 });
    text.text.size = 8;
    text.text.content = "A";
    Object.assign(text.transform, { x: 0, y: 0, width: 32, height: 32 });
    renderer.render(p, 0.5, out);
    const noText = out.toDataURL();
    renderer.render(p, 1.5, out);
    check(
      "text appears only during its own time range",
      noText !== out.toDataURL(),
    );
    const credits = M.addLayerItem(p, "credits", { start: 0, duration: 4 });
    credits.credits.fontSize = 4;
    credits.credits.groups = [{ id: "g", title: "Cast", content: "One\nTwo" }];
    renderer.render(p, 0, out);
    const start = out.toDataURL();
    renderer.render(p, 2, out);
    check(
      "rolling credits positions follow project time",
      start !== out.toDataURL(),
    );
    const offline = new OfflineAudioContext(2, 4800, 48000),
      oscillator = offline.createOscillator(),
      gain = offline.createGain();
    oscillator.frequency.value = 440;
    gain.gain.value = 12;
    oscillator.connect(gain);
    const limiter = Audio.createLimiter(offline);
    gain.connect(limiter);
    limiter.connect(offline.destination);
    oscillator.start();
    const audio = await offline.startRendering();
    let peak = 0;
    for (const sample of audio.getChannelData(0))
      peak = Math.max(peak, Math.abs(sample));
    check(
      "stereo mix limiter holds an overloaded signal to the actual minus-one-dB sample ceiling",
      peak <= Audio.CEILING + 1e-6 && peak >= Audio.CEILING - 0.001,
    );
    check(
      "limiter preserves both stereo channels",
      audio.numberOfChannels === 2 &&
        near(
          [...audio.getChannelData(0).slice(0, 10)],
          [...audio.getChannelData(1).slice(0, 10)],
          1e-6,
        ),
    );
    window.TEST_RESULT = { passed: true, checks };
  } catch (error) {
    window.TEST_RESULT = { passed: false, checks, error: error.stack };
  }
  document.getElementById("result").textContent = JSON.stringify(
    window.TEST_RESULT,
    null,
    2,
  );
})();
