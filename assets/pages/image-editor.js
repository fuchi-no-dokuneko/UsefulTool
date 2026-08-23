import { Canvas, FabricImage } from "../../vendor/fabric.min.mjs";
const canvas = new Canvas("canvas", { width: 1200, height: 800, backgroundColor: "#ffffff", preserveObjectStacking: true });
const status = document.getElementById("status");
const propertyIds = ["left", "top", "width", "height", "angle", "opacity"];

function active() { return canvas.getActiveObject(); }
function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result), { once: true });
    reader.addEventListener("error", () => reject(reader.error || new Error("Could not read image.")), { once: true });
    reader.readAsDataURL(file);
  });
}
function renderLayers() {
  const container = document.getElementById("layers");
  container.replaceChildren();
  const objects = [...canvas.getObjects()].reverse();
  objects.forEach((object, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "layer-button";
    button.setAttribute("aria-current", String(object === active()));
    button.textContent = (objects.length - index) + ". " + (object._fileName || "Image layer");
    button.addEventListener("click", () => { canvas.setActiveObject(object); canvas.requestRenderAll(); syncProperties(); });
    container.appendChild(button);
  });
}

function syncProperties() {
  const object = active();
  for (const id of propertyIds) document.getElementById(id).disabled = !object;
  if (!object) { renderLayers(); return; }
  document.getElementById("left").value = Math.round(object.left || 0);
  document.getElementById("top").value = Math.round(object.top || 0);
  document.getElementById("width").value = Math.max(1, Math.round(object.getScaledWidth()));
  document.getElementById("height").value = Math.max(1, Math.round(object.getScaledHeight()));
  document.getElementById("angle").value = Math.round(object.angle || 0);
  document.getElementById("opacity").value = object.opacity == null ? 1 : object.opacity;
  renderLayers();
}

function applyProperties() {
  const object = active();
  if (!object) return;
  const targetWidth = Math.max(1, Number(document.getElementById("width").value) || object.getScaledWidth());
  const targetHeight = Math.max(1, Number(document.getElementById("height").value) || object.getScaledHeight());
  object.set({
    left: Number(document.getElementById("left").value) || 0,
    top: Number(document.getElementById("top").value) || 0,
    scaleX: targetWidth / object.width,
    scaleY: targetHeight / object.height,
    angle: Number(document.getElementById("angle").value) || 0,
    opacity: Math.max(0, Math.min(1, Number(document.getElementById("opacity").value)))
  });
  object.setCoords(); canvas.requestRenderAll(); renderLayers();
}

document.getElementById("imageInput").addEventListener("change", async (event) => {
  for (const file of event.target.files) {
    if (!file.type.startsWith("image/") || file.size > 30 * 1024 * 1024) continue;
    const image = await FabricImage.fromURL(await readImage(file));
    image._fileName = file.name;
    const scale = Math.min(1, (canvas.width * 0.8) / image.width, (canvas.height * 0.8) / image.height);
    image.set({ left: 40 + canvas.getObjects().length * 18, top: 40 + canvas.getObjects().length * 18, scaleX: scale, scaleY: scale });
    canvas.add(image); canvas.setActiveObject(image);
  }
  canvas.requestRenderAll(); syncProperties(); UsefulTool.status(status, canvas.getObjects().length + " layer(s) loaded."); event.target.value = "";
});

for (const id of propertyIds) document.getElementById(id).addEventListener("input", applyProperties);
canvas.on("selection:created", syncProperties); canvas.on("selection:updated", syncProperties); canvas.on("selection:cleared", syncProperties); canvas.on("object:modified", syncProperties);
document.getElementById("flipX").addEventListener("click", () => { const object = active(); if (object) { object.set("flipX", !object.flipX); canvas.requestRenderAll(); } });
document.getElementById("flipY").addEventListener("click", () => { const object = active(); if (object) { object.set("flipY", !object.flipY); canvas.requestRenderAll(); } });
document.getElementById("layerUp").addEventListener("click", () => { const object = active(); if (object) { canvas.bringObjectForward(object); canvas.requestRenderAll(); renderLayers(); } });
document.getElementById("layerDown").addEventListener("click", () => { const object = active(); if (object) { canvas.sendObjectBackwards(object); canvas.requestRenderAll(); renderLayers(); } });
document.getElementById("duplicate").addEventListener("click", async () => { const object = active(); if (!object) return; const clone = await object.clone(); clone._fileName = (object._fileName || "Layer") + " copy"; clone.set({ left: (object.left || 0) + 24, top: (object.top || 0) + 24 }); canvas.add(clone); canvas.setActiveObject(clone); syncProperties(); });
document.getElementById("deleteLayer").addEventListener("click", () => { const object = active(); if (object) { canvas.remove(object); canvas.discardActiveObject(); syncProperties(); } });
document.getElementById("resizeCanvas").addEventListener("click", () => {
  const width = Math.max(64, Math.min(8000, Number(document.getElementById("canvasWidth").value) || 1200));
  const height = Math.max(64, Math.min(8000, Number(document.getElementById("canvasHeight").value) || 800));
  canvas.setDimensions({ width, height }); canvas.backgroundColor = document.getElementById("background").value; canvas.requestRenderAll();
});
document.getElementById("quality").addEventListener("input", (event) => document.getElementById("qualityLabel").textContent = Number(event.target.value).toFixed(2));
document.getElementById("exportButton").addEventListener("click", () => {
  const format = document.getElementById("format").value;
  const quality = Number(document.getElementById("quality").value);
  const dataUrl = canvas.toDataURL({ format, quality, multiplier: 1 });
  const [header, encoded] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(header)[1];
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  UsefulTool.download(new Blob([bytes], { type: mime }), "usefultool-canvas." + (format === "jpeg" ? "jpg" : format));
  UsefulTool.status(status, "Exported " + format.toUpperCase() + " at quality " + quality.toFixed(2) + ".");
});
document.getElementById("clearButton").addEventListener("click", () => { canvas.clear(); canvas.backgroundColor = document.getElementById("background").value; canvas.requestRenderAll(); syncProperties(); });
syncProperties();
window.UsefulToolImageEditor = { active, applyProperties, canvas, readImage, renderLayers, syncProperties };
document.documentElement.dataset.editorReady = "true";
