/* Timeline Video Studio: serializable editing model. No DOM or media elements live here. */
(function (root) {
  "use strict";
  const MIN = 0.01;
  const SCHEMA_VERSION = 2;
  const TIMELINE_KEYS = ["items", "layers", "mainOrder", "transitions", "playhead", "selectedItemId", "soundBalance", "workflow"];
  const MAX_PIXELS = 33177600;
  const VIDEO_LAYERS = ["main", "overlay-1", "overlay-2"];
  const KINDS = ["video", "audio", "image", "text", "filter", "credits"];
  const EFFECTS = ["brightness", "contrast", "saturation", "grayscale", "sepia", "hue"];
  const BLURS = ["gaussian", "box", "motion", "radial"];
  const TRANSITIONS = ["crossfade", "black", "wipe", "slide", "zoom", "dissolve"];
  let serial = 0;
  const id = (prefix = "item") => prefix + "-" + (root.crypto?.randomUUID?.() || Date.now().toString(36) + "-" + (++serial));
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));
  const rounded = (n) => Math.round(n * 1e6) / 1e6;
  const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const active = (item, t) => item.enabled && t >= item.start - 1e-7 && t < item.end - 1e-7;
  const span = (item) => Math.max(MIN, item.end - item.start);
  const sourceSpan = (item) => Math.max(MIN, item.sourceOut - item.sourceIn);
  const layer = (project, layerId) => project.layers.find((l) => l.id === layerId);
  const asset = (project, assetId) => project.assets.find((a) => a.id === assetId);
  const item = (project, itemId) => project.items.find((i) => i.id === itemId);
  const isLocked = (project, value) => value.locked || layer(project, value.layerId)?.locked;
  const mainItems = (project) => project.mainOrder.map((key) => item(project, key)).filter(Boolean);
  const makeLayer = (key, kind, name, order) => ({ id: key, kind, name, order, visible: true, locked: false, muted: false, solo: false });

  function createProject() {
    const now = Date.now();
    return { schemaVersion: SCHEMA_VERSION, id: id("project"), name: "Untitled movie", createdAt: now, updatedAt: now,
      assets: [], items: [], mainOrder: [], transitions: [], playhead: 0, duration: 0,
      canvas: { width: 1280, height: 720, background: "#000000" },
      layers: [makeLayer("main", "main-video", "Main video", 0), makeLayer("overlay-1", "overlay", "Overlay 1", 10),
        makeLayer("overlay-2", "overlay", "Overlay 2", 20), makeLayer("video-sound", "sound", "Video sound", 1000),
        makeLayer("music", "sound", "Music", 1010), makeLayer("other-sound", "sound", "Other sound", 1020)],
      soundBalance: { video: 1, music: 1, other: 1 },
      exportSettings: { quality: "standard", fps: 30, bitrate: 6, format: "", includeAudio: true, segmentInterval: 2 },
      workflow: "media" };
  }
  function transform(project, width = project.canvas.width, height = project.canvas.height) {
    const scale = Math.min(project.canvas.width / width, project.canvas.height / height);
    return { x: (project.canvas.width - width * scale) / 2, y: (project.canvas.height - height * scale) / 2,
      width: width * scale, height: height * scale, rotation: 0, cropX: 0, cropY: 0, cropWidth: width, cropHeight: height, fit: "fit" };
  }
  function baseItem(kind, layerId, start, duration) {
    return { id: id(kind), kind, layerId, start: rounded(start), end: rounded(start + duration), zIndex: 0,
      sourceIn: 0, sourceOut: duration, playbackRate: 1, opacity: 1, enabled: true, locked: false,
      fadeIn: 0, fadeOut: 0, effects: [], opacityKeys: [], blendMode: "equal", linkEnabled: false };
  }
  function audioProps(category = "music") {
    return { category, volume: 1, leftGain: 1, rightGain: 1, muted: false, fadeIn: 0, fadeOut: 0,
      preservePitch: true, loop: false, wholeMovie: false, offset: 0 };
  }
  function visualEnd(project) {
    return Math.max(0, ...project.items.filter((i) => i.kind !== "audio" && i.kind !== "filter").map((i) => i.end));
  }
  function normalize(project) {
    // A verified video-only source must never contribute an original sound.
    const silent = new Set(project.assets.filter(a => a.kind === "video" && a.hasAudio === false).map(a => a.id));
    project.items = project.items.filter(i => i.kind !== "audio" || !silent.has(i.assetId));
    for (const value of project.items) if (value.kind === "video" && silent.has(value.assetId)) {
      delete value.linkId; delete value.linkedGroupId; value.linkEnabled = false;
    }
    project.mainOrder = project.mainOrder.filter((key) => project.items.some((i) => i.id === key && i.layerId === "main"));
    project.transitions = project.transitions.filter((tr) => {
      const index = project.mainOrder.indexOf(tr.toId);
      return index > 0 && project.mainOrder[index - 1] === tr.fromId;
    });
    project.duration = rounded(Math.max(visualEnd(project), 0, ...project.items.filter((i) => i.kind === "audio" && !i.audio.wholeMovie).map((i) => i.end)));
    for (const value of project.items) {
      if (value.linkId || value.linkedGroupId) {
        value.linkId = value.linkId || value.linkedGroupId;
        value.linkedGroupId = value.linkId;
      }
      if (value.kind === "audio" && value.audio.wholeMovie) {
        value.start = 0; value.end = Math.max(MIN, visualEnd(project)); value.audio.loop = true;
        value.audio.fadeOut = Math.min(1, span(value));
      }
    }
    project.playhead = clamp(project.playhead, 0, project.duration);
    project.updatedAt = Date.now();
    return project;
  }
  function related(project, value) {
    return value.linkEnabled && value.linkedGroupId ? project.items.filter((i) => i.linkEnabled && i.linkedGroupId === value.linkedGroupId) : [value];
  }
  function transitionMaximum(project, toId) {
    const ordered = mainItems(project), index = ordered.findIndex((i) => i.id === toId);
    if (index < 1) return 0;
    const a = ordered[index - 1], b = ordered[index];
    const preceding = project.transitions.find((tr) => tr.toId === a.id)?.duration || 0;
    const following = project.transitions.find((tr) => tr.fromId === b.id)?.duration || 0;
    return Math.max(0, Math.min(5, span(a) - preceding - 1 / project.exportSettings.fps, span(b) - following - 1 / project.exportSettings.fps));
  }
  function reflow(project) {
    let time = 0;
    for (const value of mainItems(project)) {
      const duration = span(value), previousStart = value.start;
      const tr = project.transitions.find((t) => t.toId === value.id);
      if (tr) {
        tr.duration = Math.min(tr.duration, transitionMaximum(project, value.id));
        if (tr.duration < .1) project.transitions.splice(project.transitions.indexOf(tr), 1);
        else time -= tr.duration;
      }
      const moving = Math.abs(time - previousStart) > 1e-6;
      if (moving && related(project, value).some(i => isLocked(project, i))) throw new Error("Unlock the later clip or its linked sound before changing earlier clips.");
      value.start = rounded(time); value.end = rounded(time + duration);
      for (const sibling of related(project, value)) if (sibling.id !== value.id) {
        const delta = value.start - previousStart; sibling.start = rounded(sibling.start + delta); sibling.end = rounded(sibling.end + delta);
      }
      time = value.end;
    }
    return normalize(project);
  }
  function addAsset(project, descriptor) {
    const existing = project.assets.find((a) => a.name === descriptor.name && a.size === descriptor.size && a.contentHash === descriptor.contentHash);
    if (existing) { if (descriptor.hasAudio !== undefined) existing.hasAudio = descriptor.hasAudio; return existing; }
    const entry = { ...copy(descriptor), id: descriptor.id || id("asset") };
    delete entry.objectUrl;
    project.assets.push(entry);
    normalize(project); return entry;
  }
  function addMedia(project, assetId, options = {}) {
    const source = asset(project, assetId);
    if (!source) throw new Error("Choose a media file first.");
    const kind = source.kind, target = options.layerId || (kind === "audio" ? "music" : "main");
    if (layer(project, target)?.locked) throw new Error("Unlock the destination layer before adding media.");
    if (target === "main" && !project.items.some((i) => i.kind !== "audio" && i.kind !== "filter")) {
      const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (source.width * source.height)));
      project.canvas.width = Math.max(2, Math.round(source.width * scale));
      project.canvas.height = Math.max(2, Math.round(source.height * scale));
    }
    const start = options.start ?? (target === "main" ? mainItems(project).at(-1)?.end || 0 : project.playhead);
    if (kind === "video" && !VIDEO_LAYERS.includes(target)) throw new Error("Videos belong on Main video, Overlay 1 or Overlay 2.");
    if (kind === "video" && target !== "main" && project.items.some((i) => i.kind === "video" && i.layerId === target && i.start < start + (options.duration || source.duration) && i.end > start)) {
      throw new Error("This overlay track is occupied. Shorten an overlay or choose a different moment.");
    }
    let duration = kind === "image" ? target === "main" ? 5 : 3 : source.duration;
    if (options.duration) duration = kind === "image" ? options.duration : Math.min(duration, options.duration);
    const value = baseItem(kind, target, start, duration);
    value.assetId = source.id; value.sourceId = source.id; value.name = source.name;
    if (kind === "audio") value.audio = audioProps(options.category || "music");
    else value.transform = transform(project, source.width, source.height);
    project.items.push(value);
    if (target === "main") project.mainOrder.splice(options.index ?? project.mainOrder.length, 0, value.id);
    if (kind === "video" && source.hasAudio === true) {
      value.linkId = value.linkedGroupId = id("link");
      value.linkEnabled = true;
      const sound = baseItem("audio", "video-sound", start, duration);
      Object.assign(sound, { name: source.name + " · sound", assetId: source.id, sourceId: source.id,
        linkId: value.linkId, linkedGroupId: value.linkId, linkEnabled: true, audio: audioProps("video") });
      project.items.push(sound);
    }
    if (target === "main") reflow(project); else normalize(project);
    return value;
  }
  function addLayerItem(project, kind, options = {}) {
    const names = { text: "Text", image: "Image", filter: "Blur area", credits: "Credits" };
    const next = Math.max(30, ...project.layers.filter((l) => l.kind !== "sound").map((l) => l.order)) + 10;
    const track = makeLayer(id("layer"), kind === "credits" ? "text" : kind, names[kind] || kind, next);
    project.layers.push(track);
    if (kind === "image") return addMedia(project, options.assetId, { ...options, layerId: track.id });
    const value = baseItem(kind, track.id, options.start ?? project.playhead, options.duration || (kind === "credits" ? 10 : 5));
    value.transform = transform(project);
    if (kind === "text") {
      const preset = options.preset || "title";
      value.text = { content: preset === "subtitle" ? "Your subtitle here" : preset === "caption" ? "Add a little context" : "Your title here",
        preset, font: "system-ui", size: preset === "title" ? 72 : 40, weight: preset === "title" ? 700 : 400,
        color: "#ffffff", background: preset === "subtitle" ? "#17201bcc" : "transparent", align: "center", lineHeight: 1.25 };
      Object.assign(value.transform, { x: project.canvas.width * .1, y: project.canvas.height * (preset === "subtitle" ? .78 : .35),
        width: project.canvas.width * .8, height: project.canvas.height * .2 });
    }
    if (kind === "filter") {
      value.filter = { type: "gaussian", amount: 12, angle: 0, centerX: 50, centerY: 50, targetMode: "everything-below", targetLayerId: "main" };
      Object.assign(value.transform, { x: project.canvas.width * .3, y: project.canvas.height * .3,
        width: project.canvas.width * .4, height: project.canvas.height * .4 });
    }
    if (kind === "credits") value.credits = { template: options.template || "rolling", direction: "up", mode: "fit", speed: 80,
      marginTop: 50, marginBottom: 50, lineHeight: 1.5, fontSize: 36, color: "#ffffff", background: "#17201b",
      groups: ["Title", "Cast", "Production", "Music", "Thanks"].map((title) => ({ id: id("group"), title, content: title === "Title" ? "Our movie" : "Add names here" })) };
    project.items.push(value);
    if (value.credits) updateCreditsDuration(project, value);
    normalize(project); return value;
  }
  function setLink(project, itemId, enabled) {
    const value = item(project, itemId);
    if (!value?.linkedGroupId) return;
    for (const sibling of project.items.filter((i) => i.linkedGroupId === value.linkedGroupId)) {
      sibling.linkEnabled = Boolean(enabled);
      sibling.linkIntent = enabled ? "linked" : "unlinked";
    }
  }
  function legacyLinkCandidates(project) {
    return project.items.filter(video => {
      if (video.kind !== "video" || video.linkEnabled !== false || !video.linkedGroupId || video.linkIntent === "unlinked" || asset(project, video.assetId)?.hasAudio === false) return false;
      const pair = project.items.filter(i => i.linkedGroupId === video.linkedGroupId);
      const sound = pair.find(i => i.kind === "audio" && i.audio?.category === "video");
      return pair.length === 2 && sound && sound.linkEnabled === false && sound.linkIntent !== "unlinked" && sound.assetId === video.assetId &&
        !sound.audio.loop && !sound.audio.wholeMovie && !sound.audio.offset &&
        ["start", "end", "sourceIn", "sourceOut", "playbackRate"].every(key => Math.abs(sound[key] - video[key]) < 1e-6);
    });
  }
  function migrateProject(project) {
    if (project.schemaVersion === 1) {
      const candidates = legacyLinkCandidates(project).map(i => i.id);
      project.linkRepair = { status: candidates.length ? "pending" : "resolved", candidateIds: candidates };
      project.schemaVersion = SCHEMA_VERSION;
    }
    return project;
  }
  function timelineCheckpoint(project) {
    return copy(Object.fromEntries(TIMELINE_KEYS.map(key => [key, project[key] ?? null])));
  }
  function restoreTimeline(project) {
    if (!project.previousTimeline) return false;
    Object.assign(project, copy(project.previousTimeline));
    delete project.previousTimeline;
    normalize(project);
    return true;
  }
  function moveItem(project, itemId, start, layerId) {
    const value = item(project, itemId);
    if (!value || isLocked(project, value)) return false;
    const nextLayer = layerId || value.layerId;
    if (layer(project, nextLayer)?.locked) throw new Error("Unlock the destination layer first.");
    if (value.kind === "video" && !VIDEO_LAYERS.includes(nextLayer)) throw new Error("Choose one of the three video tracks.");
    if (value.kind === "audio" && layer(project, nextLayer)?.kind !== "sound") throw new Error("Place sound on a Sound track.");
    const delta = Math.max(0, start) - value.start;
    if (value.kind === "video" && nextLayer !== "main" && project.items.some((i) => i.id !== value.id && i.kind === "video" && i.layerId === nextLayer && i.start < value.end + delta - 1e-7 && i.end > value.start + delta + 1e-7)) throw new Error("This overlay track is occupied. Shorten an overlay first.");
    for (const sibling of related(project, value)) {
      if (isLocked(project, sibling)) throw new Error("Unlock the linked item first.");
    }
    for (const sibling of related(project, value)) { sibling.start = rounded(sibling.start + delta); sibling.end = rounded(sibling.end + delta); }
    const wasMain = value.layerId === "main";
    value.layerId = nextLayer;
    if (wasMain || nextLayer === "main") {
      project.mainOrder = project.mainOrder.filter((key) => key !== value.id);
      if (nextLayer === "main") {
        const index = mainItems(project).findIndex((i) => i.start > start);
        project.mainOrder.splice(index < 0 ? project.mainOrder.length : index, 0, value.id);
      }
      reflow(project);
    } else normalize(project);
    return true;
  }
  function reorderMain(project, itemId, newIndex) {
    const value = item(project, itemId);
    if (!value || isLocked(project, value)) return false;
    project.mainOrder = project.mainOrder.filter((key) => key !== itemId);
    project.mainOrder.splice(clamp(newIndex, 0, project.mainOrder.length), 0, itemId);
    reflow(project); return true;
  }
  function trimItem(project, itemId, edge, time) {
    const value = item(project, itemId);
    if (!value || isLocked(project, value)) return false;
    const source = asset(project, value.assetId);
    const original = copy(value);
    const media = value.kind === "video" || value.kind === "audio";
    if (edge === "start") {
      const minimum = media && !value.audio?.loop ? Math.max(0, value.start - value.sourceIn / value.playbackRate) : 0;
      const next = clamp(time, minimum, value.end - MIN);
      const change = next - value.start;
      value.start = rounded(next);
      if (value.audio?.loop) value.audio.offset = ((value.audio.offset || 0) + change * value.playbackRate + sourceSpan(value) * 100000) % sourceSpan(value);
      else if (media) value.sourceIn = rounded(Math.max(0, value.sourceIn + change * value.playbackRate));
    } else {
      const maximum = media && !value.audio?.loop ? value.start + (source.duration - value.sourceIn) / value.playbackRate : 86400;
      value.end = rounded(clamp(time, value.start + MIN, maximum));
      if (media && !value.audio?.loop) value.sourceOut = rounded(value.sourceIn + span(value) * value.playbackRate);
    }
    if (value.audio) value.audio.wholeMovie = false;
    for (const sibling of related(project, value)) if (sibling.id !== value.id) {
      if (isLocked(project, sibling)) { Object.assign(value, original); throw new Error("Unlock the linked sound first."); }
      sibling.start = value.start; sibling.end = value.end; sibling.sourceIn = value.sourceIn; sibling.sourceOut = value.sourceOut;
    }
    if (value.credits) updateCreditsDuration(project, value);
    value.layerId === "main" ? reflow(project) : normalize(project); return true;
  }
  function setSpeed(project, itemId, speed) {
    const value = item(project, itemId);
    if (!value || !["video", "audio"].includes(value.kind) || isLocked(project, value)) return false;
    const siblings = related(project, value);
    if (siblings.some((i) => isLocked(project, i))) throw new Error("Unlock the linked item first.");
    for (const sibling of siblings) {
      sibling.playbackRate = rounded(clamp(Math.round(speed / .05) * .05, .25, 4));
      if (!sibling.audio?.loop && !sibling.audio?.wholeMovie) sibling.end = rounded(sibling.start + sourceSpan(sibling) / sibling.playbackRate);
    }
    siblings.some((i) => i.layerId === "main") ? reflow(project) : normalize(project); return true;
  }
  function splitItem(project, itemId, time) {
    const value = item(project, itemId);
    if (!value || isLocked(project, value) || time < value.start + MIN || time > value.end - MIN) return null;
    const siblings = related(project, value).filter((i) => time > i.start + MIN && time < i.end - MIN);
    if (siblings.some((i) => isLocked(project, i))) throw new Error("Unlock the linked item first.");
    const rightGroup = id("link"); let result;
    for (const sibling of siblings) {
      const right = copy(sibling), offset = time - sibling.start;
      right.id = id(sibling.kind); right.start = rounded(time); sibling.end = rounded(time);
      if (sibling.kind === "video" || sibling.kind === "audio") {
        const sourceTime = sourceTimeAt(sibling, time);
        if (sibling.audio?.loop) right.audio.offset = sourceTime - sibling.sourceIn;
        else { right.sourceIn = sourceTime; sibling.sourceOut = sourceTime; }
      }
      right.opacityKeys = splitKeys(sibling.opacityKeys, offset, true);
      sibling.opacityKeys = splitKeys(sibling.opacityKeys, offset, false);
      for (const fx of right.effects) { fx.start = Math.max(0, fx.start - offset); fx.end = Math.max(0, fx.end - offset); }
      right.effects = right.effects.filter((fx) => fx.end > fx.start);
      sibling.effects = sibling.effects.filter((fx) => fx.start < offset).map((fx) => ({ ...fx, end: Math.min(fx.end, offset) }));
      right.fadeIn = 0; sibling.fadeOut = 0;
      if (right.audio) { right.audio.fadeIn = 0; sibling.audio.fadeOut = 0; right.audio.wholeMovie = false; sibling.audio.wholeMovie = false; }
      if (right.linkedGroupId) right.linkId = right.linkedGroupId = rightGroup;
      project.items.push(right);
      if (sibling.layerId === "main") {
        project.mainOrder.splice(project.mainOrder.indexOf(sibling.id) + 1, 0, right.id);
        for (const tr of project.transitions) if (tr.fromId === sibling.id) tr.fromId = right.id;
      }
      if (sibling.id === value.id) result = right;
    }
    normalize(project); return result;
  }
  function duplicateItem(project, itemId) {
    const value = item(project, itemId);
    if (!value || isLocked(project, value)) return null;
    const group = id("link"); let result;
    for (const sibling of related(project, value)) {
      const dupe = copy(sibling); dupe.id = id(sibling.kind); dupe.start = sibling.end; dupe.end = dupe.start + span(sibling);
      if (!["video", "audio"].includes(dupe.kind) && dupe.layerId !== "main") {
        const track = copy(layer(project, dupe.layerId));
        track.id = id("layer"); track.order += .1; project.layers.push(track); dupe.layerId = track.id;
      }
      if (dupe.linkedGroupId) dupe.linkId = dupe.linkedGroupId = group;
      if (dupe.audio) dupe.audio.wholeMovie = false;
      project.items.push(dupe);
      if (dupe.layerId === "main") project.mainOrder.splice(project.mainOrder.indexOf(sibling.id) + 1, 0, dupe.id);
      if (sibling.id === value.id) result = dupe;
    }
    value.layerId === "main" ? reflow(project) : normalize(project); return result;
  }
  function deleteItem(project, itemId) {
    const value = item(project, itemId);
    if (!value || isLocked(project, value)) return false;
    const siblings = related(project, value);
    if (siblings.some((i) => isLocked(project, i))) throw new Error("Unlock the linked item first.");
    const ids = new Set(siblings.map((i) => i.id));
    project.items = project.items.filter((i) => !ids.has(i.id));
    reflow(project); return true;
  }
  function setTransition(project, toId, options) {
    const maximum = transitionMaximum(project, toId);
    if (maximum < .1) throw new Error("These clips need at least 0.1 seconds plus one frame for a transition.");
    if (!TRANSITIONS.includes(options.type)) throw new Error("Choose an available transition.");
    const toIndex = project.mainOrder.indexOf(toId);
    const tr = { id: id("transition"), fromId: project.mainOrder[toIndex - 1], toId,
      type: options.type, duration: clamp(options.duration || 1, .1, maximum), direction: options.direction || "left", easing: options.easing || "smooth" };
    project.transitions = project.transitions.filter((t) => t.toId !== toId); project.transitions.push(tr);
    reflow(project); return tr;
  }
  function removeTransition(project, toId) { project.transitions = project.transitions.filter((t) => t.toId !== toId); reflow(project); }
  function ease(x, type = "linear") {
    x = clamp(x, 0, 1);
    return type === "smooth" ? x * x * (3 - 2 * x) : type === "ease-in" ? x * x : type === "ease-out" ? 1 - (1 - x) ** 2 : type === "hold" ? (x === 1 ? 1 : 0) : x;
  }
  function curveAt(keys, t, fallback = 1) {
    if (!keys?.length) return fallback;
    const ordered = [...keys].sort((a, b) => a.time - b.time);
    if (t <= ordered[0].time) return ordered[0].value;
    for (let i = 1; i < ordered.length; i++) if (t <= ordered[i].time) {
      const a = ordered[i - 1], b = ordered[i];
      const u = ease((t - a.time) / Math.max(1e-9, b.time - a.time), a.easing);
      return a.value + (b.value - a.value) * u;
    }
    return ordered.at(-1).value;
  }
  function splitKeys(keys, time, right) {
    if (!keys.length) return [];
    const boundary = { time: right ? 0 : time, value: curveAt(keys, time), easing: keys.findLast((k) => k.time <= time)?.easing || "linear" };
    return right ? [boundary, ...keys.filter((k) => k.time > time).map((k) => ({ ...k, time: k.time - time }))] : [...keys.filter((k) => k.time < time), boundary];
  }
  function setKey(value, time, opacity, easing = "linear") {
    const t = rounded(clamp(time, 0, span(value)));
    value.opacityKeys = value.opacityKeys.filter((k) => Math.abs(k.time - t) > .0001);
    value.opacityKeys.push({ time: t, value: clamp(opacity, 0, 1), easing });
    value.opacityKeys.sort((a, b) => a.time - b.time);
  }
  function fadeAt(value, t, audio = false) {
    const properties = audio ? value.audio : value, local = t - value.start;
    return clamp(Math.min(1, properties.fadeIn ? local / properties.fadeIn : 1, properties.fadeOut ? (value.end - t) / properties.fadeOut : 1), 0, 1);
  }
  function sourceTimeAt(value, time) {
    let offset = Math.max(0, time - value.start) * value.playbackRate;
    if (value.audio?.loop) offset = (offset + (value.audio.offset || 0)) % sourceSpan(value);
    return clamp(value.sourceIn + offset, value.sourceIn, Math.max(value.sourceIn, value.sourceOut - .00001));
  }
  function setRepeat(project, itemId, repeat, wholeMovie = false) {
    const value = item(project, itemId);
    if (!value?.audio || isLocked(project, value)) return false;
    value.audio.loop = repeat; value.audio.wholeMovie = wholeMovie; value.audio.offset = 0;
    if (wholeMovie) { value.start = 0; value.audio.fadeOut = 1; }
    value.end = repeat ? Math.max(value.start + sourceSpan(value) / value.playbackRate, visualEnd(project)) : value.start + sourceSpan(value) / value.playbackRate;
    normalize(project); return true;
  }
  function snapTime(project, time, excludedId, threshold = .12) {
    const candidates = [0, project.playhead, ...project.items.filter((i) => i.id !== excludedId).flatMap((i) => [i.start, i.end])];
    const close = candidates.reduce((best, value) => Math.abs(value - time) < Math.abs(best - time) ? value : best, Infinity);
    return Math.abs(close - time) <= threshold ? close : Math.max(0, Math.round(time * project.exportSettings.fps) / project.exportSettings.fps);
  }
  function visibleItems(project, time, audio = false) {
    const solo = project.layers.some((l) => l.solo && (l.kind === "sound") === audio);
    return project.items.filter((value) => {
      const track = layer(project, value.layerId);
      return active(value, time) && (value.kind === "audio") === audio && track?.visible && (!solo || track.solo) && (!audio || !track.muted && !value.audio.muted);
    }).sort((a, b) => layer(project, a.layerId).order - layer(project, b.layerId).order || a.zIndex - b.zIndex || a.id.localeCompare(b.id));
  }
  function videoConflicts(project) {
    return ["overlay-1", "overlay-2"].flatMap(key => {
      if (!layer(project,key)?.visible) return [];
      const entries = project.items.filter(i => i.kind === "video" && i.enabled && i.layerId === key).sort((a,b)=>a.start-b.start);
      let end = 0;
      return entries.filter(i => { const conflict = i.start < end - 1e-7; end = Math.max(end,i.end); return conflict; });
    });
  }
  function evaluateFrame(project, time) {
    const t = clamp(time, 0, Math.max(0, project.duration - 1e-7));
    const visible = visibleItems(project, t);
    const transitions = project.transitions.filter((tr) => {
      const a = item(project, tr.fromId), b = item(project, tr.toId);
      return a && b && t >= b.start && t < a.end;
    }).map((tr) => ({ ...tr, progress: ease((t - item(project, tr.toId).start) / tr.duration, tr.easing) }));
    return { time: t, items: visible.map((value) => ({ item: value, sourceTime: sourceTimeAt(value, t),
      opacity: value.opacity * curveAt(value.opacityKeys, t - value.start) * fadeAt(value, t),
      effects: value.effects.filter((fx) => fx.enabled && t - value.start >= fx.start && t - value.start < fx.end) })), transitions,
      videoCount: visible.filter((i) => i.kind === "video").length };
  }
  function evaluateAudio(project, range) {
    const time = typeof range === "number" ? range : range.start;
    return visibleItems(project, time, true).slice(0, MAX_AUDIO_SOURCES).map((value) => {
      return { item: value, sourceTime: sourceTimeAt(value, time), playbackRate: value.playbackRate,
        ...audioGains(project, value, time), preservePitch: value.audio.preservePitch };
    });
  }
  function audioGains(project, value, time) {
    const gain = value.audio.volume * fadeAt(value, time, true) * (project.soundBalance[value.audio.category] ?? 1);
    return { left: gain * value.audio.leftGain, right: gain * value.audio.rightGain };
  }
  const MAX_AUDIO_SOURCES = 3;
  function audioConflicts(project) {
    const points = [...new Set(project.items.filter(i => i.kind === "audio").flatMap(i => [i.start, i.end]))].sort((a, b) => a - b);
    const conflicts = [];
    for (let index = 0; index < points.length - 1; index++) {
      const start = points[index], end = points[index + 1];
      const sounds = visibleItems(project, (start + end) / 2, true);
      if (sounds.length > MAX_AUDIO_SOURCES) conflicts.push({ start, end, items: sounds, excess: sounds.slice(MAX_AUDIO_SOURCES) });
    }
    return conflicts;
  }
  function fixAudioConflicts(project) {
    const muted = [];
    for (let conflict; (conflict = audioConflicts(project)[0]);) {
      const sound = [...conflict.items].reverse().find(i => !isLocked(project, i));
      if (!sound) throw new Error("Unlock or move a sound to resolve the three-sound limit.");
      sound.audio.muted = true;
      muted.push(sound.id);
    }
    return muted;
  }
  function applyOverlayPreset(project, selectedIds, preset = "equal") {
    const values = selectedIds.map((key) => item(project, key)).filter((i) => i?.kind === "video");
    if (values.some((value) => isLocked(project, value))) throw new Error("Unlock the selected videos before applying an overlap preset.");
    const alpha = preset === "groovy" ? [1, .55, .35] : preset === "ghost" ? [1, .4, .2] : [1, .55, .35];
    values.forEach((value, index) => {
      value.blendMode = preset === "equal" ? "equal" : "alpha";
      value.opacity = preset === "equal" ? 1 / values.length : alpha[index];
      value.opacityKeys = [];
      if (preset === "groovy") {
        value.presetBaseX ??= value.transform.x;
        value.transform.x = value.presetBaseX + [-14, 0, 14][index];
        value.effects = value.effects.filter((fx) => !fx.presetEffect);
        value.effects.push({ id: id("effect"), type: "hue", amount: [-20, 0, 20][index], start: 0, end: span(value), enabled: true, presetEffect: true });
      }
      if (preset === "ghost") { value.presetBaseX ??= value.transform.x; value.transform.x = value.presetBaseX + index * 18; }
    });
    normalize(project);
  }
  function addEffect(value, type) {
    if (!EFFECTS.includes(type)) throw new Error("Choose an available effect.");
    const effect = { id: id("effect"), type, amount: ["brightness", "contrast", "saturation"].includes(type) ? 1.2 : type === "hue" ? 30 : 1,
      start: 0, end: span(value), enabled: true };
    value.effects.push(effect); return effect;
  }
  function creditsHeight(value) {
    return value.credits.groups.reduce((n, g) => n + (1 + g.content.split("\n").length + 1) * value.credits.fontSize * value.credits.lineHeight, 0);
  }
  function updateCreditsDuration(project, value) {
    if (value.credits?.template !== "rolling") return;
    const distance = value.transform.height + creditsHeight(value) + value.credits.marginTop + value.credits.marginBottom;
    if (value.credits.mode === "speed") value.end = value.start + distance / Math.max(1, value.credits.speed);
    else value.credits.speed = distance / span(value);
    normalize(project);
  }
  function fitTransform(project, value, mode) {
    const source = asset(project, value.assetId);
    if (!source) return;
    const scale = mode === "original" ? 1 : (mode === "fill" ? Math.max : Math.min)(project.canvas.width / source.width, project.canvas.height / source.height);
    Object.assign(value.transform, { x: (project.canvas.width - source.width * scale) / 2, y: (project.canvas.height - source.height * scale) / 2,
      width: source.width * scale, height: source.height * scale, fit: mode });
  }
  function segmentRanges(duration, interval, fps = 30) {
    if (!(duration > 0)) return [];
    if (!Number.isFinite(interval) || interval < Math.max(.1, 1 / fps)) throw new Error("Use at least 0.1 seconds and one frame between cuts.");
    const count = Math.ceil(duration / interval);
    if (count > 61) throw new Error("Choose a longer interval; the maximum is 60 segments.");
    const ranges = [];
    for (let start = 0; start < duration - 1e-7; start += interval) ranges.push({ start: rounded(start), end: rounded(Math.min(duration, start + interval)) });
    if (ranges.length > 1 && ranges.at(-1).end - ranges.at(-1).start < Math.max(.1, 1 / fps) - 1e-7) ranges[ranges.length - 2].end = ranges.pop().end;
    if (ranges.length > 60) throw new Error("Choose a longer interval; the maximum is 60 segments.");
    return ranges;
  }
  function formatTime(time, fps = 30) {
    const frames = Math.floor(Math.max(0, finite(time)) * fps + 1e-6), seconds = Math.floor(frames / fps);
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60, frames % fps].map((v) => String(v).padStart(2, "0")).join(":");
  }
  function exportDimensions(project, quality = project.exportSettings.quality) {
    const { width, height } = project.canvas;
    const target = quality === "quick" ? 720 : quality === "standard" ? 1080 : Math.min(width, height);
    const scale = target / Math.min(width, height);
    const w = Math.max(2, Math.round(width * scale / 2) * 2), h = Math.max(2, Math.round(height * scale / 2) * 2);
    if (w * h > MAX_PIXELS) throw new Error("This output exceeds the 33 megapixel limit. Choose a smaller quality.");
    return { width: w, height: h };
  }
  function serialize(project) {
    const value = copy(project);
    value.assets = value.assets.map(({ objectUrl, fileHandleKey, ...rest }) => rest);
    return JSON.stringify(value, null, 2);
  }
  function parseProject(text, checkpoint = false) {
    if (text.length > 32 * 1024 * 1024) throw new Error("This project file is too large.");
    let value;
    try { value = JSON.parse(text); } catch { throw new Error("This is not a valid .utvproj JSON file."); }
    if (![1, SCHEMA_VERSION].includes(value?.schemaVersion)) throw new Error("This project version is not supported.");
    const numeric = (v, min = -Infinity, max = Infinity) => Number.isFinite(v) && v >= min && v <= max;
    const string = (v, max = 12000) => typeof v === "string" && v.length <= max;
    const fail = (ok, message) => { if (!ok) throw new Error(message); };
    fail(string(value.id, 200) && string(value.name, 180) && numeric(value.playhead, 0), "Invalid project identity or playhead.");
    for (const key of ["assets", "layers", "items", "mainOrder", "transitions"]) if (!Array.isArray(value[key])) throw new Error("Project is missing " + key + ".");
    if (!value.canvas || !(value.canvas.width > 0 && value.canvas.height > 0) || value.canvas.width * value.canvas.height > MAX_PIXELS) throw new Error("Invalid project dimensions.");
    const unique = (entries) => entries.every((x) => x && string(x.id, 200) && x.id.length) && new Set(entries.map((x) => x.id)).size === entries.length;
    if (![value.assets, value.layers, value.items].every(unique)) throw new Error("Project contains duplicate or invalid IDs.");
    for (const entry of value.assets) if (!["video", "audio", "image"].includes(entry.kind) || typeof entry.contentHash !== "string" || typeof entry.name !== "string" || !(entry.size >= 0)) throw new Error("Invalid media description.");
    for (const a of value.assets) {
      fail(numeric(a.size, 0) && string(a.name, 1000), "Invalid media description.");
      if (a.hasAudio !== undefined) fail(typeof a.hasAudio === "boolean", "Invalid audio track metadata.");
      if (a.kind !== "image") fail(numeric(a.duration, MIN), "Invalid source duration.");
      if (a.kind !== "audio") fail(numeric(a.width, 1) && numeric(a.height, 1), "Invalid source dimensions.");
      if (a.thumbnail !== undefined) fail(string(a.thumbnail, 2 * 1024 * 1024) && /^data:image\/(png|jpeg|webp|gif|bmp);base64,[a-z0-9+/=\s]+$/i.test(a.thumbnail), "Invalid embedded thumbnail.");
      if (a.waveform !== undefined) fail(Array.isArray(a.waveform) && a.waveform.length <= 8192 && a.waveform.every(n => numeric(n, 0, 1)), "Invalid waveform data.");
    }
    for (const track of value.layers) fail(["main-video", "overlay", "text", "image", "filter", "sound"].includes(track.kind) && string(track.name, 180) && numeric(track.order) && ["visible", "locked", "muted", "solo"].every(k => typeof track[k] === "boolean"), "Invalid layer settings.");
    for (const required of createProject().layers) fail(layer(value, required.id)?.kind === required.kind, "A required timeline track is missing.");
    fail(VIDEO_LAYERS.every((key, index) => layer(value, key).order === index * 10), "Video tracks must retain their compositing order.");
    fail(new Set(value.mainOrder).size === value.mainOrder.length && value.mainOrder.every(key => item(value, key)?.layerId === "main") && value.items.filter(i => i.layerId === "main").every(i => value.mainOrder.includes(i.id)), "Invalid main timeline order.");
    for (const entry of value.items) {
      if (!KINDS.includes(entry.kind) || !layer(value, entry.layerId) || !Number.isFinite(entry.start) || !Number.isFinite(entry.end) || entry.start < 0 || entry.end - entry.start < MIN - 1e-7) throw new Error("Invalid timeline item.");
      if (entry.assetId && !asset(value, entry.assetId)) throw new Error("An item refers to missing media.");
      if (!Number.isFinite(entry.playbackRate) || entry.playbackRate < .25 || entry.playbackRate > 4) throw new Error("Invalid playback speed.");
      if (!Number.isFinite(entry.opacity) || entry.opacity < 0 || entry.opacity > 1) throw new Error("Invalid visibility.");
      if (entry.kind === "audio" && (!entry.audio || !Number.isFinite(entry.audio.volume) || entry.audio.volume < 0 || entry.audio.volume > 2)) throw new Error("Invalid audio settings.");
      if (entry.kind === "filter" && !BLURS.includes(entry.filter?.type)) throw new Error("Invalid blur type.");
      if (!Array.isArray(entry.effects) || !Array.isArray(entry.opacityKeys)) throw new Error("Missing effect data.");
      const track = layer(value, entry.layerId), source = asset(value, entry.assetId);
      fail(numeric(entry.zIndex) && ["enabled", "locked"].every(k => typeof entry[k] === "boolean"), "Invalid item state.");
      if (entry.kind === "video") fail(VIDEO_LAYERS.includes(entry.layerId) && source?.kind === "video", "Invalid video track or source.");
      if (entry.kind === "image") fail(source?.kind === "image" && track.kind !== "sound", "Invalid image source or track.");
      if (entry.kind === "audio") fail(track.kind === "sound" && ["audio", "video"].includes(source?.kind), "Invalid sound source or track.");
      if (["video", "audio"].includes(entry.kind)) fail(numeric(entry.sourceIn, 0) && numeric(entry.sourceOut, entry.sourceIn + .000001, source.duration + .001), "Invalid source range.");
      fail(numeric(entry.fadeIn, 0, 5) && numeric(entry.fadeOut, 0, 5), "Invalid fade settings.");
      if (entry.kind !== "audio") fail(entry.transform && ["x", "y", "rotation", "cropX", "cropY"].every(k => numeric(entry.transform[k])) && ["width", "height", "cropWidth", "cropHeight"].every(k => numeric(entry.transform[k], .000001)), "Invalid item transform.");
      fail(entry.opacityKeys.every(k => k && numeric(k.time, 0) && numeric(k.value, 0, 1) && ["linear", "smooth", "ease-in", "ease-out", "hold"].includes(k.easing)), "Invalid visibility curve.");
      fail(entry.effects.every(f => f && EFFECTS.includes(f.type) && numeric(f.amount, f.type === "hue" ? -360 : 0, f.type === "hue" ? 360 : 3) && numeric(f.start, 0) && numeric(f.end, f.start) && typeof f.enabled === "boolean"), "Invalid effect data.");
      if (entry.audio) fail(["leftGain", "rightGain"].every(k => numeric(entry.audio[k], 0, 2)) && ["fadeIn", "fadeOut"].every(k => numeric(entry.audio[k], 0)) && ["muted", "preservePitch", "loop", "wholeMovie"].every(k => typeof entry.audio[k] === "boolean"), "Invalid audio settings.");
      if (entry.kind === "text") fail(entry.text && string(entry.text.content) && string(entry.text.font, 200) && numeric(entry.text.size, 1, 10000) && numeric(entry.text.weight, 100, 1000) && numeric(entry.text.lineHeight, .1, 10) && ["left", "center", "right"].includes(entry.text.align) && string(entry.text.color, 100) && string(entry.text.background, 100), "Invalid text settings.");
      if (entry.kind === "filter") {
        const f = entry.filter;
        fail(track.kind === "filter" && numeric(f.amount, 0, {gaussian:50, box:30, motion:80, radial:100}[f.type]) && numeric(f.angle, 0, 360) && numeric(f.centerX, 0, 100) && numeric(f.centerY, 0, 100) && ["selected-layer", "everything-below"].includes(f.targetMode) && (f.targetMode !== "selected-layer" || Boolean(layer(value, f.targetLayerId))), "Invalid blur settings.");
      }
      if (entry.kind === "credits") {
        const c = entry.credits;
        fail(c && ["rolling", "static", "pages"].includes(c.template) && ["up", "down"].includes(c.direction) && ["speed", "fit"].includes(c.mode) && numeric(c.speed, .000001) && numeric(c.fontSize, 1, 10000) && numeric(c.lineHeight, .1, 10) && numeric(c.marginTop, 0) && numeric(c.marginBottom, 0) && Array.isArray(c.groups) && unique(c.groups) && c.groups.every(g => string(g.title, 1000) && string(g.content)), "Invalid credits settings.");
      }
      delete entry.objectUrl;
    }
    for (const a of value.assets) { delete a.objectUrl; delete a.fileHandleKey; }
    value.soundBalance ||= { video: 1, music: 1, other: 1 };
    value.exportSettings = { ...createProject().exportSettings, ...value.exportSettings };
    if (!(value.exportSettings.fps >= 1 && value.exportSettings.fps <= 60 && value.exportSettings.bitrate >= .25 && value.exportSettings.bitrate <= 50)) throw new Error("Invalid export settings.");
    fail(Number.isInteger(value.exportSettings.fps) && ["quick", "standard", "high"].includes(value.exportSettings.quality) && numeric(value.exportSettings.segmentInterval, .1) && ["video", "music", "other"].every(k => numeric(value.soundBalance[k], 0, 2)), "Invalid export or sound balance settings.");
    fail(unique(value.transitions) && value.transitions.every(tr => {
      const i = value.mainOrder.indexOf(tr.toId);
      return i > 0 && value.mainOrder[i - 1] === tr.fromId && TRANSITIONS.includes(tr.type) && numeric(tr.duration, .1, 5) && ["left", "right", "up", "down"].includes(tr.direction) && ["linear", "smooth", "ease-in", "ease-out", "hold"].includes(tr.easing);
    }), "Invalid transition data.");
    if (value.linkRepair !== undefined) fail(value.linkRepair && ["pending", "resolved"].includes(value.linkRepair.status) && Array.isArray(value.linkRepair.candidateIds) && value.linkRepair.candidateIds.every(key => string(key, 200)), "Invalid link migration state.");
    if (value.previousTimeline !== undefined) {
      fail(!checkpoint && value.previousTimeline && typeof value.previousTimeline === "object" && TIMELINE_KEYS.every(key => key in value.previousTimeline), "Invalid previous timeline checkpoint.");
      const previous = { ...value, ...Object.fromEntries(TIMELINE_KEYS.map(key => [key, value.previousTimeline[key]])) };
      delete previous.previousTimeline;
      value.previousTimeline = timelineCheckpoint(parseProject(JSON.stringify(previous), true));
    }
    return migrateProject(normalize(value));
  }
  class History {
    constructor(project) { this.entries = [serialize(project)]; this.index = 0; }
    push(project) {
      const snapshot = serialize(project);
      const comparable = (s) => { const p = JSON.parse(s); delete p.updatedAt; delete p.playhead; return JSON.stringify(p); };
      if (comparable(snapshot) === comparable(this.entries[this.index])) return false;
      this.entries.splice(this.index + 1); this.entries.push(snapshot);
      if (this.entries.length > 81) this.entries.shift();
      this.index = this.entries.length - 1; return true;
    }
    undo() { return this.index > 0 ? JSON.parse(this.entries[--this.index]) : null; }
    redo() { return this.index < this.entries.length - 1 ? JSON.parse(this.entries[++this.index]) : null; }
    get canUndo() { return this.index > 0; }
    get canRedo() { return this.index < this.entries.length - 1; }
  }
  const api = { MIN, SCHEMA_VERSION, MAX_PIXELS, VIDEO_LAYERS, KINDS, EFFECTS, BLURS, TRANSITIONS, id, copy, clamp, finite, rounded, active, span, sourceSpan,
    layer, asset, item, isLocked, mainItems, createProject, transform, baseItem, audioProps, normalize, reflow, addAsset, addMedia, addLayerItem,
    related, setLink, moveItem, reorderMain, trimItem, setSpeed, splitItem, duplicateItem, deleteItem, transitionMaximum, setTransition, removeTransition,
    ease, curveAt, setKey, fadeAt, sourceTimeAt, setRepeat, snapTime, visibleItems, videoConflicts, MAX_AUDIO_SOURCES, audioConflicts, fixAudioConflicts, audioGains, evaluateFrame, evaluateAudio, applyOverlayPreset, addEffect,
    creditsHeight, updateCreditsDuration, fitTransform, segmentRanges, formatTime, exportDimensions, serialize, parseProject, History, visualEnd,
    legacyLinkCandidates, migrateProject, timelineCheckpoint, restoreTimeline };
  root.UTStudio = Object.assign(root.UTStudio || {}, { Model: api });
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
