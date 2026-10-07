let nextId = 100,
  editingId = null;

let layers = [
  { id: 1, type: "space", size: 40 },
  { id: 2, type: "line", color: "#00ff44", width: 3, glow: 14 },
  { id: 3, type: "space", size: 10 },
  { id: 4, type: "line", color: "#00ff44", width: 2, glow: 8 },
  { id: 5, type: "space", size: 8 },
  {
    id: 6,
    type: "text",
    text: "HELLO WORLD - CIRCULAR TEXT - ",
    fontSize: 16,
    color: "#00ff44",
    letterSpacing: 2,
    glow: 6,
  },
  { id: 7, type: "space", size: 8 },
  { id: 8, type: "line", color: "#ff0044", width: 2, glow: 8 },
  { id: 9, type: "space", size: 10 },
  { id: 10, type: "line", color: "#ff0044", width: 3, glow: 14 },
  { id: 11, type: "space", size: 30 },
];

function getRot() {
  return +document.getElementById("global-rot").value;
}

/* Calculate total radius + max glow bleed */
function calcExtent() {
  let r = 0,
    maxGlow = 0;
  for (const L of layers) {
    if (L.type === "space") r += L.size;
    else if (L.type === "line") {
      maxGlow = Math.max(maxGlow, L.glow || 0);
      // line width extends outward
      r += 0; // line drawn at current r
    } else if (L.type === "text") r += L.fontSize || 14;
  }
  // Add the maximum glow + a small buffer for line widths
  let maxLineW = 0;
  for (const L of layers)
    if (L.type === "line") maxLineW = Math.max(maxLineW, L.width || 1);
  return Math.max(1, Math.ceil(r + maxGlow * 1.5 + maxLineW));
}

function drawRingAt(ctx, cx, cy) {
  let r = 0;
  for (const L of layers) {
    if (L.type === "space") {
      r += L.size;
    } else if (L.type === "line") {
      ctx.save();
      if (L.glow > 0) {
        ctx.shadowColor = L.color;
        ctx.shadowBlur = L.glow;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = L.color;
      ctx.lineWidth = L.width;
      ctx.stroke();
      if (L.glow > 4) ctx.stroke();
      ctx.restore();
    } else if (L.type === "text") {
      const text = L.text || "";
      if (!text) {
        r += L.fontSize || 14;
        continue;
      }
      const fs = L.fontSize || 14,
        sp = L.letterSpacing || 0;
      ctx.save();
      ctx.font = fs + "px 'Courier New', monospace";
      ctx.fillStyle = L.color || "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (L.glow) {
        ctx.shadowColor = L.color;
        ctx.shadowBlur = L.glow;
      }
      const radius = r + fs / 2,
        rotOff = (getRot() * Math.PI) / 180;
      let totalW = 0;
      for (let i = 0; i < text.length; i++)
        totalW += ctx.measureText(text[i]).width + sp;
      const circ = 2 * Math.PI * radius;
      const rep = Math.max(1, Math.floor(circ / totalW));
      const full = text.repeat(rep);
      let angle = rotOff;
      for (let i = 0; i < full.length; i++) {
        const w = ctx.measureText(full[i]).width + sp;
        const ca = w / radius,
          ma = angle + ca / 2;
        ctx.save();
        ctx.translate(cx + radius * Math.cos(ma), cy + radius * Math.sin(ma));
        ctx.rotate(ma + Math.PI / 2);
        ctx.fillText(full[i], 0, 0);
        ctx.restore();
        angle += ca;
      }
      r += fs;
      ctx.restore();
    }
  }
}

function render() {
  const ext = calcExtent();
  const size = ext * 2;
  const c = document.getElementById("preview");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  const bg = document.getElementById("bg-select").value;
  if (bg === "black") {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
  } else if (bg === "dark") {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, size, size);
  } else if (bg === "white") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
  }
  drawRingAt(ctx, ext, ext);
  applyScale();
}

function applyScale() {
  const pct = +document.getElementById("scale-slider").value;
  const c = document.getElementById("preview");
  const realSize = c.width;
  const px = Math.round((realSize * pct) / 100);
  c.style.width = px + "px";
  c.style.height = px + "px";
}

function ts() {
  const d = new Date();
  return (
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0") +
    "_" +
    String(d.getHours()).padStart(2, "0") +
    String(d.getMinutes()).padStart(2, "0") +
    String(d.getSeconds()).padStart(2, "0")
  );
}

function renderLayerList(focusTextId) {
  const list = document.getElementById("layer-list");
  list.innerHTML = "";
  layers.forEach((L, idx) => {
    const div = document.createElement("div");
    div.className = "layer-item" + (editingId === L.id ? " active" : "");

    const row = document.createElement("div");
    row.className = "layer-row";
    let icon = "",
      name = "",
      iconColor = "#555";
    if (L.type === "space") {
      icon = "\u2195";
      name = "Space " + L.size + "px";
    } else if (L.type === "line") {
      icon = "\u25CB";
      name = "Ring";
      iconColor = L.color;
    } else {
      icon = "A";
      name = "Text";
      iconColor = L.color || "#fff";
    }

    const iconEl = document.createElement("span");
    iconEl.className = "layer-icon";
    iconEl.style.color = iconColor;
    iconEl.textContent = icon;
    row.appendChild(iconEl);
    const nameEl = document.createElement("span");
    nameEl.className = "layer-name";
    nameEl.textContent = name;
    row.appendChild(nameEl);

    if (L.type === "line") {
      const sw = document.createElement("span");
      sw.className = "layer-swatch";
      sw.style.background = L.color;
      sw.style.boxShadow = "0 0 6px " + L.color;
      row.appendChild(sw);
    }

    const mkBtn = (txt, cls, fn) => {
      const b = document.createElement("button");
      b.className = "lbtn" + (cls ? " " + cls : "");
      b.innerHTML = txt;
      b.type = "button";
      b.setAttribute(
        "aria-label",
        txt === "&uarr;"
          ? "Move layer toward center"
          : txt === "&darr;"
            ? "Move layer outward"
            : "Remove layer",
      );
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        fn();
      });
      return b;
    };
    row.appendChild(mkBtn("&uarr;", "", () => moveLayer(idx, -1)));
    row.appendChild(mkBtn("&darr;", "", () => moveLayer(idx, 1)));
    row.appendChild(mkBtn("&times;", "del", () => removeLayer(L.id)));

    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", "Edit " + name + " layer " + (idx + 1));
    row.setAttribute("aria-expanded", String(editingId === L.id));
    const toggle = () => {
      editingId = editingId === L.id ? null : L.id;
      renderLayerList();
    };
    row.addEventListener("click", toggle);
    row.addEventListener("keydown", (e) => {
      if (e.target === row && ["Enter", " "].includes(e.key)) {
        e.preventDefault();
        toggle();
      }
    });
    div.appendChild(row);

    if (editingId === L.id) {
      const edit = document.createElement("div");
      edit.className = "layer-edit";
      edit.addEventListener("click", (e) => e.stopPropagation());

      if (L.type === "space") {
        edit.innerHTML =
          "<label>Size: " +
          L.size +
          'px</label><input type="range" min="0" max="200" value="' +
          L.size +
          '">';
        div.appendChild(edit);
        edit.querySelector("input").addEventListener("input", function () {
          L.size = +this.value;
          this.previousElementSibling.textContent = "Size: " + L.size + "px";
          nameEl.textContent = "Space " + L.size + "px";
          render();
        });
      }

      if (L.type === "line") {
        edit.innerHTML =
          '<div class="inline"><label>Color</label><input type="color" value="' +
          L.color +
          '"></div>' +
          "<label>Width: " +
          L.width +
          'px</label><input type="range" min="1" max="20" value="' +
          L.width +
          '">' +
          "<label>Glow: " +
          L.glow +
          '</label><input type="range" min="0" max="40" value="' +
          L.glow +
          '">';
        div.appendChild(edit);
        const ii = edit.querySelectorAll("input");
        ii[0].addEventListener("input", function () {
          L.color = this.value;
          render();
        });
        ii[1].addEventListener("input", function () {
          L.width = +this.value;
          this.previousElementSibling.textContent = "Width: " + L.width + "px";
          render();
        });
        ii[2].addEventListener("input", function () {
          L.glow = +this.value;
          this.previousElementSibling.textContent = "Glow: " + L.glow;
          render();
        });
      }

      if (L.type === "text") {
        edit.innerHTML =
          '<label>Text</label><input type="text" value="">' +
          '<div class="inline"><label>Color</label><input type="color" value="' +
          (L.color || "#ffffff") +
          '"></div>' +
          "<label>Font Size: " +
          L.fontSize +
          'px</label><input type="range" min="8" max="48" value="' +
          L.fontSize +
          '">' +
          "<label>Letter Spacing: " +
          L.letterSpacing +
          'px</label><input type="range" min="0" max="20" value="' +
          L.letterSpacing +
          '">' +
          "<label>Glow: " +
          (L.glow || 0) +
          '</label><input type="range" min="0" max="30" value="' +
          (L.glow || 0) +
          '">';
        div.appendChild(edit);
        const ii = edit.querySelectorAll("input");
        ii[0].value = L.text;
        ii[0].addEventListener("input", function () {
          L.text = this.value;
          render();
        });
        ii[1].addEventListener("input", function () {
          L.color = this.value;
          render();
        });
        ii[2].addEventListener("input", function () {
          L.fontSize = +this.value;
          this.previousElementSibling.textContent =
            "Font Size: " + L.fontSize + "px";
          render();
        });
        ii[3].addEventListener("input", function () {
          L.letterSpacing = +this.value;
          this.previousElementSibling.textContent =
            "Letter Spacing: " + L.letterSpacing + "px";
          render();
        });
        ii[4].addEventListener("input", function () {
          L.glow = +this.value;
          this.previousElementSibling.textContent = "Glow: " + (L.glow || 0);
          render();
        });
        if (focusTextId === L.id) setTimeout(() => ii[0].focus(), 50);
      }
    }
    list.appendChild(div);
  });
}

function moveLayer(i, d) {
  const n = i + d;
  if (n < 0 || n >= layers.length) return;
  [layers[i], layers[n]] = [layers[n], layers[i]];
  render();
  renderLayerList();
}
function removeLayer(id) {
  layers = layers.filter((l) => l.id !== id);
  if (editingId === id) editingId = null;
  render();
  renderLayerList();
}
function addLayer(type) {
  const id = nextId++;
  if (type === "space") layers.push({ id, type, size: 20 });
  else if (type === "line")
    layers.push({ id, type, color: "#00ff44", width: 2, glow: 8 });
  else
    layers.push({
      id,
      type,
      text: "YOUR TEXT - ",
      fontSize: 14,
      color: "#ffffff",
      letterSpacing: 2,
      glow: 0,
    });
  editingId = id;
  render();
  renderLayerList(type === "text" ? id : null);
  document
    .getElementById("layer-list")
    .scrollIntoView({ block: "end", behavior: "smooth" });
}

function exportPNG() {
  const ext = calcExtent();
  const size = ext * 2;
  const tmp = document.createElement("canvas");
  tmp.width = size;
  tmp.height = size;
  const ctx = tmp.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  drawRingAt(ctx, ext, ext);
  tmp.toBlob((blob) => {
    if (blob) {
      UsefulTool.download(blob, "ring_" + ts() + ".png");
      UsefulTool.status(
        document.getElementById("status"),
        "Transparent PNG exported: " + size + " × " + size + " pixels.",
      );
    }
  }, "image/png");
}

document.getElementById("bg-select").addEventListener("change", function () {
  const b = document.getElementById("preview-bar");
  for (const value of ["black", "dark", "white"])
    b.classList.toggle("bg-" + value, this.value === value);
  render();
});
document.getElementById("global-rot").addEventListener("input", function () {
  document.getElementById("rot-val").textContent = this.value;
  render();
});
document.getElementById("scale-slider").addEventListener("input", function () {
  document.getElementById("scale-val").textContent = this.value;
  applyScale();
});

render();
renderLayerList();

for (const button of document.querySelectorAll("[data-add-layer]"))
  button.addEventListener("click", () => addLayer(button.dataset.addLayer));
document.getElementById("export-btn").addEventListener("click", exportPNG);
