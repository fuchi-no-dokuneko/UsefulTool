(function (root) {
  "use strict";
  const M = root.UTStudio.Model;
  const styles = {
    family: {
      name: "Family",
      length: 5,
      transition: "crossfade",
      title: "Our favourite moments",
    },
    travel: {
      name: "Travel",
      length: 4,
      transition: "slide",
      title: "A little adventure",
    },
    fast: {
      name: "Fast",
      length: 1.5,
      transition: "wipe",
      title: "Good times",
    },
    calm: {
      name: "Calm",
      length: 7,
      transition: "black",
      title: "Take a moment",
    },
    music: {
      name: "Music video",
      length: 2.5,
      transition: "dissolve",
      title: "Feel the rhythm",
    },
  };
  async function generate(original, library, options, onProgress = () => {}) {
    const signal = options.signal;
    signal?.throwIfAborted();
    const style = styles[options.template] || styles.family;
    const assets = options.assetIds
      .map((key) => M.asset(original, key))
      .filter((a) => a && a.kind !== "audio")
      .map((a) => M.copy(a));
    if (!assets.length) throw new Error("Choose at least one video or image.");
    const analysisAssets =
      options.length === "full" && !["fast", "calm"].includes(options.template)
        ? []
        : assets.filter((a) => a.kind === "video" && !a.analysis);
    for (let i = 0; i < analysisAssets.length; i++) {
      signal?.throwIfAborted();
      await library.analyze(
        analysisAssets[i],
        (fraction) =>
          onProgress({
            name: analysisAssets[i].name,
            percent: (i + fraction) / analysisAssets.length,
          }),
        signal,
      );
    }
    signal?.throwIfAborted();
    const p = M.createProject();
    p.id = original.id;
    p.name = original.name;
    p.createdAt = original.createdAt;
    p.canvas = M.copy(original.canvas);
    p.assets = M.copy(original.assets);
    // Keep completed analysis for subsequent drafts without touching the input
    // project when generation is cancelled or fails.
    for (const source of analysisAssets)
      if (source.analysis)
        M.asset(p, source.id).analysis = M.copy(source.analysis);
    p.exportSettings = M.copy(original.exportSettings);
    if (original.linkRepair) p.linkRepair = M.copy(original.linkRepair);
    if (original.items.length)
      p.previousTimeline = M.timelineCheckpoint(original);
    else if (original.previousTimeline)
      p.previousTimeline = M.copy(original.previousTimeline);
    const score = (a) => a.analysis?.cuts[0]?.change || 0;
    if (options.template === "fast") assets.sort((a, b) => score(b) - score(a));
    if (options.template === "calm") assets.sort((a, b) => score(a) - score(b));
    const available = assets.reduce(
      (n, a) => n + (a.kind === "image" ? 5 : a.duration),
      0,
    );
    const target =
      options.length === "full"
        ? available
        : Math.min(Number(options.length) || 30, available);
    let remaining = target,
      index = 0;
    while (remaining >= M.MIN && index < assets.length * 10) {
      signal?.throwIfAborted();
      const source = assets[index % assets.length];
      if (index >= assets.length && options.length === "full") break;
      const length =
        options.length === "full"
          ? source.kind === "image"
            ? 5
            : source.duration
          : Math.min(
              source.kind === "image" ? 5 : source.duration,
              Math.max(style.length, target / assets.length),
              // Include the impending overlap so the final draft does not
              // approach its requested length through tiny extra fragments.
              remaining + (index ? Math.min(0.6, remaining / 4) : 0),
            );
      if (length < M.MIN) break;
      const value = M.addMedia(p, source.id, { duration: length });
      // addMedia fits the first clip's canvas; drafts retain project settings.
      p.canvas = M.copy(original.canvas);
      M.fitTransform(p, value, "fit");
      if (source.kind === "video" && options.length !== "full") {
        const candidate = source.analysis?.cuts.find(
          (c) => c.time + length <= source.duration,
        );
        let sourceIn = candidate
          ? candidate.time
          : Math.max(0, (source.duration - length) / 2);
        if (options.template === "music" && source.analysis?.peaks.length)
          sourceIn = M.clamp(
            source.analysis.peaks[0].time - 0.1,
            0,
            source.duration - length,
          );
        value.sourceIn = sourceIn;
        value.sourceOut = sourceIn + length;
        const sound = p.items.find(
          (i) => i.kind === "audio" && i.linkedGroupId === value.linkedGroupId,
        );
        if (sound) {
          sound.sourceIn = value.sourceIn;
          sound.sourceOut = value.sourceOut;
        }
      }
      M.setLink(p, value.id, true);
      if (index > 0 && M.transitionMaximum(p, value.id) >= 0.1)
        M.setTransition(p, value.id, {
          type: style.transition,
          duration: Math.min(0.6, length / 5),
          easing: "smooth",
        });
      if (options.length !== "full" && M.visualEnd(p) > target)
        M.trimItem(p, value.id, "end", target);
      remaining = target - M.visualEnd(p);
      index++;
    }
    const title = M.addLayerItem(p, "text", {
      duration: Math.max(M.MIN, Math.min(4, M.visualEnd(p))),
    });
    title.text.content = style.title;
    title.text.size = p.canvas.height * 0.08;
    title.fadeIn = 0.4;
    title.fadeOut = 0.4;
    if (options.musicId) {
      const sound = M.addMedia(p, options.musicId, { start: 0 });
      M.setRepeat(p, sound.id, true, true);
      sound.audio.volume = 0.6;
    }
    p.workflow = "arrange";
    p.playhead = 0;
    M.normalize(p);
    signal?.throwIfAborted();
    onProgress({ name: "Draft ready", percent: 1 });
    return p;
  }
  root.UTStudio.AutoMovie = { styles, generate };
})(globalThis);
