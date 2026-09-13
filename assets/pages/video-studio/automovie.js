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
    const style = styles[options.template] || styles.family;
    const assets = options.assetIds
      .map((key) => M.asset(original, key))
      .filter((a) => a && a.kind !== "audio");
    if (!assets.length) throw new Error("Choose at least one video or image.");
    for (let i = 0; i < assets.length; i++)
      if (assets[i].kind === "video")
        await library.analyze(assets[i], (fraction) =>
          onProgress({
            name: assets[i].name,
            percent: (i + fraction) / assets.length,
          }),
        );
    const p = M.createProject();
    p.id = original.id;
    p.name = original.name;
    p.createdAt = original.createdAt;
    p.canvas = M.copy(original.canvas);
    p.assets = M.copy(original.assets);
    p.exportSettings = M.copy(original.exportSettings);
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
              remaining,
            );
      if (length < M.MIN) break;
      const value = M.addMedia(p, source.id, { duration: length });
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
        sound.sourceIn = value.sourceIn;
        sound.sourceOut = value.sourceOut;
      }
      M.setLink(p, value.id, true);
      if (index > 0 && M.transitionMaximum(p, value.id) >= 0.1)
        M.setTransition(p, value.id, {
          type: style.transition,
          duration: Math.min(0.6, length / 5),
          easing: "smooth",
        });
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
    return p;
  }
  root.UTStudio.AutoMovie = { styles, generate };
})(globalThis);
