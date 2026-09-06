const input = document.getElementById("input");
const output = document.getElementById("output");
const algorithm = document.getElementById("algorithm");
const shift = document.getElementById("shift");
const direction = document.getElementById("direction");
const allShifts = document.getElementById("allShifts");
const status = document.getElementById("status");

function rotateAlpha(text, amount) {
  const normalized = ((amount % 26) + 26) % 26;
  return Array.from(text, (character) => {
    const code = character.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCharCode(65 + (code - 65 + normalized) % 26);
    if (code >= 97 && code <= 122) return String.fromCharCode(97 + (code - 97 + normalized) % 26);
    return character;
  }).join("");
}

function rot47(text) {
  return Array.from(text, (character) => {
    const code = character.charCodeAt(0);
    return code >= 33 && code <= 126 ? String.fromCharCode(33 + (code - 33 + 47) % 94) : character;
  }).join("");
}

function transform() {
  const amount = Number(shift.value);
  if (!Number.isInteger(amount) || amount < 0 || amount > 25) {
    UsefulTool.status(status, "Shift must be an integer from 0 through 25.", "error");
    return;
  }
  output.value = algorithm.value === "rot47" ? rot47(input.value) : rotateAlpha(input.value, direction.value === "decode" ? -amount : amount);
  UsefulTool.status(status, "Transformed " + input.value.length + " characters. ROT remains reversible obfuscation.", "warn");
}

function randomPassword(length) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

document.getElementById("runButton").addEventListener("click", transform);
document.getElementById("generateButton").addEventListener("click", () => {
  const length = Math.max(8, Math.min(128, Number(document.getElementById("passwordLength").value) || 20));
  input.value = randomPassword(length); transform();
});
document.getElementById("bruteButton").addEventListener("click", () => {
  allShifts.textContent = Array.from({ length: 26 }, (_, amount) => "ROT" + amount.toString().padStart(2, "0") + "  " + rotateAlpha(input.value, -amount)).join("\n");
});
document.getElementById("copyButton").addEventListener("click", async () => { await navigator.clipboard.writeText(output.value); UsefulTool.status(status, "Output copied.", "warn"); });
document.getElementById("swapButton").addEventListener("click", () => { input.value = output.value; output.value = ""; });
document.getElementById("clearButton").addEventListener("click", () => { input.value = ""; output.value = ""; allShifts.textContent = "All-shift analysis appears here."; });
algorithm.addEventListener("change", () => { shift.disabled = algorithm.value === "rot47"; direction.disabled = algorithm.value === "rot47"; });
window.UsefulToolRot = { rotateAlpha, rot47, randomPassword, transform };
