/* One deterministic compositor for paused preview, playback and recorded frames. */
(function (root) {
  "use strict";
  const { Model: M, Media } = root.UTStudio;
  const canvas = Media.makeCanvas;
  const clear = (c) => {
    const ctx = c.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    ctx.clearRect(0, 0, c.width, c.height);
    return ctx;
  };
  const effectCSS = (fx) =>
    ({
      brightness: "brightness",
      contrast: "contrast",
      saturation: "saturate",
      grayscale: "grayscale",
      sepia: "sepia",
      hue: "hue-rotate",
    })[fx.type] +
    "(" +
    fx.amount +
    (fx.type === "hue" ? "deg" : "") +
    ")";
  class Renderer {
    constructor(library) {
      this.library = library;
      this.buffers = new Map();
    }
    buffer(key, width, height) {
      this.used?.add(key);
      let c = this.buffers.get(key);
      if (!c) {
        c = canvas(width, height);
        this.buffers.set(key, c);
      }
      if (c.width !== width || c.height !== height) {
        c.width = width;
        c.height = height;
      }
      clear(c);
      return c;
    }
    text(ctx, value) {
      const { text: t, transform: tr } = value;
      const size = t.size,
        spacing = size * t.lineHeight;
      ctx.font = t.weight + " " + size + "px " + t.font;
      ctx.textBaseline = "top";
      ctx.textAlign = t.align;
      if (t.background && t.background !== "transparent") {
        ctx.fillStyle = t.background;
        ctx.fillRect(-tr.width / 2, -tr.height / 2, tr.width, tr.height);
      }
      ctx.fillStyle = t.color;
      const lines = [];
      for (const line of t.content.split("\n")) {
        let current = "";
        for (const word of line.split(" ")) {
          const candidate = current ? current + " " + word : word;
          if (current && ctx.measureText(candidate).width > tr.width - 16) {
            lines.push(current);
            current = word;
          } else current = candidate;
        }
        lines.push(current);
      }
      const x =
        t.align === "left"
          ? -tr.width / 2 + 8
          : t.align === "right"
            ? tr.width / 2 - 8
            : 0;
      let y = -Math.min(tr.height, lines.length * spacing) / 2;
      for (const line of lines) {
        ctx.fillText(line, x, y, tr.width - 16);
        y += spacing;
      }
    }
    credits(ctx, value, time, project) {
      const c = value.credits,
        width = value.transform.width,
        height = value.transform.height;
      ctx.fillStyle = c.background;
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-width / 2, -height / 2, width, height);
      ctx.clip();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = c.color;
      const lines = c.groups.flatMap((g) => [
        { text: g.title, bold: true },
        ...g.content.split("\n").map((text) => ({ text, bold: false })),
        { text: "", bold: false },
      ]);
      const line = c.fontSize * c.lineHeight,
        total = lines.length * line,
        t = (time - value.start) / M.span(value);
      let selected = lines,
        y;
      if (c.template === "rolling") {
        const distance = height + total + c.marginTop + c.marginBottom;
        const progress =
          c.mode === "speed" ? (time - value.start) * c.speed : t * distance;
        y =
          c.direction === "down"
            ? -height / 2 - total - c.marginTop + progress
            : height / 2 + c.marginBottom - progress;
      } else if (c.template === "pages") {
        const page = Math.min(
            c.groups.length - 1,
            Math.floor(t * c.groups.length),
          ),
          group = c.groups[page];
        selected = group
          ? [
              { text: group.title, bold: true },
              ...group.content
                .split("\n")
                .map((text) => ({ text, bold: false })),
            ]
          : [];
        y = (-selected.length * line) / 2;
      } else y = -Math.min(total, height - c.marginTop - c.marginBottom) / 2;
      for (const entry of selected) {
        ctx.font = (entry.bold ? 700 : 400) + " " + c.fontSize + "px system-ui";
        ctx.fillText(entry.text, 0, y, width * 0.85);
        y += line;
      }
      ctx.restore();
    }
    drawItem(project, info, width, height) {
      const value = info.item,
        c = this.buffer("item:" + value.id, width, height),
        ctx = c.getContext("2d");
      const tr = value.transform || M.transform(project),
        scaleX = width / project.canvas.width,
        scaleY = height / project.canvas.height;
      ctx.save();
      ctx.scale(scaleX, scaleY);
      ctx.translate(tr.x + tr.width / 2, tr.y + tr.height / 2);
      ctx.rotate((tr.rotation * Math.PI) / 180);
      if (value.kind === "text") this.text(ctx, value);
      else if (value.kind === "credits")
        this.credits(ctx, value, info.time, project);
      else {
        const runtime = this.library.assets.get(value.assetId);
        const source =
          value.kind === "image" ? runtime?.image : this.library.element(value);
        if (source && (value.kind === "image" || source.readyState >= 2)) {
          const original = M.asset(project, value.assetId);
          const sw = original.width,
            sh = original.height;
          const x = M.clamp(tr.cropX, 0, sw - 1),
            y = M.clamp(tr.cropY, 0, sh - 1);
          ctx.drawImage(
            source,
            x,
            y,
            M.clamp(tr.cropWidth, 1, sw - x),
            M.clamp(tr.cropHeight, 1, sh - y),
            -tr.width / 2,
            -tr.height / 2,
            tr.width,
            tr.height,
          );
        }
      }
      ctx.restore();
      let current = c;
      info.effects.forEach((fx, index) => {
        const next = this.buffer(
            "effect:" + value.id + ":" + index,
            width,
            height,
          ),
          effectCtx = next.getContext("2d");
        effectCtx.filter = effectCSS(fx);
        effectCtx.drawImage(current, 0, 0);
        effectCtx.filter = "none";
        current = next;
      });
      return current;
    }
    transition(from, to, tr, width, height) {
      const c = this.buffer("transition:" + tr.id, width, height),
        ctx = c.getContext("2d"),
        p = tr.progress;
      const vertical = ["up", "down"].includes(tr.direction),
        reverse = ["right", "down"].includes(tr.direction);
      if (
        tr.type === "crossfade" ||
        tr.type === "black" ||
        tr.type === "zoom"
      ) {
        ctx.globalCompositeOperation = "lighter";
        const a = tr.type === "black" ? Math.max(0, 1 - 2 * p) : 1 - p;
        const b = tr.type === "black" ? Math.max(0, 2 * p - 1) : p;
        ctx.globalAlpha = a;
        const outScale = tr.type === "zoom" ? 1 + p * 0.2 : 1;
        ctx.drawImage(
          from,
          ((1 - outScale) * width) / 2,
          ((1 - outScale) * height) / 2,
          width * outScale,
          height * outScale,
        );
        ctx.globalAlpha = b;
        const inScale = tr.type === "zoom" ? 0.8 + p * 0.2 : 1;
        ctx.drawImage(
          to,
          ((1 - inScale) * width) / 2,
          ((1 - inScale) * height) / 2,
          width * inScale,
          height * inScale,
        );
      } else if (tr.type === "wipe") {
        ctx.drawImage(from, 0, 0);
        ctx.save();
        ctx.beginPath();
        if (vertical)
          ctx.rect(0, reverse ? height * (1 - p) : 0, width, height * p);
        else ctx.rect(reverse ? width * (1 - p) : 0, 0, width * p, height);
        ctx.clip();
        ctx.drawImage(to, 0, 0);
        ctx.restore();
      } else if (tr.type === "slide") {
        const sign = reverse ? -1 : 1;
        ctx.drawImage(
          from,
          vertical ? 0 : -p * width * sign,
          vertical ? -p * height * sign : 0,
        );
        ctx.drawImage(
          to,
          vertical ? 0 : (1 - p) * width * sign,
          vertical ? (1 - p) * height * sign : 0,
        );
      } else {
        const a = from.getContext("2d").getImageData(0, 0, width, height),
          b = to.getContext("2d").getImageData(0, 0, width, height);
        for (let index = 0; index < a.data.length; index += 4) {
          // Coordinate-seeded noise: seeking backward reproduces exactly the same dissolve.
          const pixel = index / 4;
          let seed = Math.imul(pixel ^ 0x9e3779b9, 0x45d9f3b);
          seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
          seed ^= seed >>> 16;
          if ((seed >>> 0) / 4294967296 < p) {
            a.data[index] = b.data[index];
            a.data[index + 1] = b.data[index + 1];
            a.data[index + 2] = b.data[index + 2];
            a.data[index + 3] = b.data[index + 3];
          }
        }
        ctx.putImageData(a, 0, 0);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      return c;
    }
    boxBlur(source, radius) {
      const width = source.width,
        height = source.height,
        ctx = source.getContext("2d", { willReadFrequently: true });
      const image = ctx.getImageData(0, 0, width, height),
        input = image.data,
        temp = new Float32Array(input.length),
        output = image.data;
      const size = 2 * radius + 1;
      // Sliding-window separable box convolution, with clamped image edges.
      for (let y = 0; y < height; y++)
        for (let channel = 0; channel < 4; channel++) {
          let sum = 0;
          for (let x = -radius; x <= radius; x++)
            sum += input[(y * width + M.clamp(x, 0, width - 1)) * 4 + channel];
          for (let x = 0; x < width; x++) {
            temp[(y * width + x) * 4 + channel] = sum / size;
            sum +=
              input[
                (y * width + Math.min(width - 1, x + radius + 1)) * 4 + channel
              ] - input[(y * width + Math.max(0, x - radius)) * 4 + channel];
          }
        }
      for (let x = 0; x < width; x++)
        for (let channel = 0; channel < 4; channel++) {
          let sum = 0;
          for (let y = -radius; y <= radius; y++)
            sum += temp[(M.clamp(y, 0, height - 1) * width + x) * 4 + channel];
          for (let y = 0; y < height; y++) {
            output[(y * width + x) * 4 + channel] = sum / size;
            sum +=
              temp[
                (Math.min(height - 1, y + radius + 1) * width + x) * 4 + channel
              ] - temp[(Math.max(0, y - radius) * width + x) * 4 + channel];
          }
        }
      ctx.putImageData(image, 0, 0);
    }
    blur(source, value, project) {
      const f = value.filter,
        width = source.width,
        height = source.height,
        sx = width / project.canvas.width,
        sy = height / project.canvas.height;
      if (f.amount <= 0) return;
      const processed = this.buffer("blur:" + value.id, width, height),
        ctx = processed.getContext("2d");
      if (f.type === "gaussian") {
        ctx.filter = "blur(" + f.amount * sx + "px)";
        ctx.drawImage(source, 0, 0);
        ctx.filter = "none";
      } else if (f.type === "box") {
        ctx.drawImage(source, 0, 0);
        this.boxBlur(processed, Math.max(1, Math.round(f.amount * sx)));
      } else {
        const samples =
          f.type === "motion"
            ? Math.min(41, Math.max(2, Math.ceil(f.amount * sx)))
            : 20;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 1 / samples;
        for (let i = 0; i < samples; i++) {
          if (f.type === "motion") {
            const d = (i / (samples - 1) - 0.5) * f.amount * sx,
              angle = (f.angle * Math.PI) / 180;
            ctx.drawImage(source, Math.cos(angle) * d, Math.sin(angle) * d);
          } else {
            const scale = 1 + (i / (samples - 1)) * (f.amount / 100) * 0.35,
              x = (f.centerX / 100) * width,
              y = (f.centerY / 100) * height;
            ctx.drawImage(
              source,
              x * (1 - scale),
              y * (1 - scale),
              width * scale,
              height * scale,
            );
          }
        }
      }
      const target = source.getContext("2d"),
        tr = value.transform;
      target.save();
      target.beginPath();
      target.translate((tr.x + tr.width / 2) * sx, (tr.y + tr.height / 2) * sy);
      target.rotate((tr.rotation * Math.PI) / 180);
      target.rect(
        (-tr.width * sx) / 2,
        (-tr.height * sy) / 2,
        tr.width * sx,
        tr.height * sy,
      );
      target.clip();
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalCompositeOperation = "copy";
      target.drawImage(processed, 0, 0);
      target.restore();
    }
    render(project, time, output) {
      this.used = new Set();
      const plan = M.evaluateFrame(project, time),
        width = output.width,
        height = output.height;
      const composite = this.buffer("composite", width, height),
        ctx = composite.getContext("2d");
      ctx.fillStyle = project.canvas.background;
      ctx.fillRect(0, 0, width, height);
      const filters = plan.items.filter((e) => e.item.kind === "filter");
      const groups = project.layers
        .filter((l) => l.kind !== "sound")
        .sort((a, b) => a.order - b.order)
        .map((track) => ({
          track,
          entries: plan.items.filter((e) => e.item.layerId === track.id),
        }));
      const videoGroups = groups.filter((g) =>
        g.entries.some((e) => e.item.kind === "video"),
      );
      const equalMix = videoGroups.every((g) =>
        g.entries
          .filter((e) => e.item.kind === "video")
          .every((e) => e.item.blendMode === "equal"),
      );
      let accumulatedWeight = 0;
      for (const group of groups) {
        if (!group.entries.length) continue;
        if (group.track.kind === "filter") {
          for (const e of group.entries)
            if (e.item.filter.targetMode === "everything-below")
              this.blur(composite, e.item, project);
          continue;
        }
        const layerCanvas = this.buffer(
            "layer:" + group.track.id,
            width,
            height,
          ),
          layerCtx = layerCanvas.getContext("2d");
        const transition = plan.transitions.find((tr) =>
          group.entries.some((e) => e.item.id === tr.toId),
        );
        if (transition) {
          const a = group.entries.find((e) => e.item.id === transition.fromId),
            b = group.entries.find((e) => e.item.id === transition.toId);
          if (a && b) {
            const from = this.drawItem(
                project,
                { ...a, time: plan.time },
                width,
                height,
              ),
              to = this.drawItem(
                project,
                { ...b, time: plan.time },
                width,
                height,
              );
            layerCtx.drawImage(
              this.transition(from, to, transition, width, height),
              0,
              0,
            );
          }
        } else
          for (const entry of group.entries) {
            if (entry.item.kind === "filter") continue;
            layerCtx.globalAlpha =
              group.track.kind === "main-video" ||
              group.track.kind === "overlay"
                ? M.fadeAt(entry.item, plan.time)
                : entry.opacity;
            layerCtx.drawImage(
              this.drawItem(
                project,
                { ...entry, time: plan.time },
                width,
                height,
              ),
              0,
              0,
            );
          }
        layerCtx.globalAlpha = 1;
        for (const f of filters)
          if (
            f.item.filter.targetMode === "selected-layer" &&
            f.item.filter.targetLayerId === group.track.id
          )
            this.blur(layerCanvas, f.item, project);
        const visual = group.entries.find(
          (e) => e.item.kind === "video" || e.item.kind === "image",
        );
        let opacity = 1;
        if (
          visual &&
          (group.track.kind === "main-video" || group.track.kind === "overlay")
        ) {
          const weight =
            visual.item.opacity *
            M.curveAt(visual.item.opacityKeys, plan.time - visual.item.start);
          if (equalMix && visual.item.kind === "video") {
            accumulatedWeight += weight;
            opacity = accumulatedWeight > 0 ? weight / accumulatedWeight : 0;
          } else opacity = weight;
        }
        ctx.globalAlpha = opacity;
        ctx.drawImage(layerCanvas, 0, 0);
        ctx.globalAlpha = 1;
      }
      const destination = clear(output);
      destination.drawImage(composite, 0, 0);
      for (const key of this.buffers.keys())
        if (!this.used.has(key)) this.buffers.delete(key);
      return { ...plan, visibleVideoLayers: videoGroups.length };
    }
    dispose() {
      this.buffers.clear();
    }
  }
  root.UTStudio.Renderer = Renderer;
})(globalThis);
