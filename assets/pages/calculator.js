(function blockOutbound() {
  const deny = function () { throw new Error("Outbound network calls are disabled in UsefulTool."); };
  window.fetch = deny;
  window.XMLHttpRequest = deny;
  window.WebSocket = deny;
  window.EventSource = deny;
  if (navigator.sendBeacon) navigator.sendBeacon = function () { return false; };
})();

const expression = document.getElementById("expression");
const result = document.getElementById("result");
const keys = document.getElementById("keys");
const radMode = document.getElementById("radMode");
const degMode = document.getElementById("degMode");
const sourceButton = document.getElementById("sourceButton");
const integrand = document.getElementById("integrand");
const lower = document.getElementById("lower");
const upper = document.getElementById("upper");
const intervals = document.getElementById("intervals");
const integrateButton = document.getElementById("integrateButton");
const integralResult = document.getElementById("integralResult");
const history = document.getElementById("history");
let angleMode = "rad";

const ops = {
  "+": { p: 2, a: "left", n: 2, fn: (a, b) => a + b },
  "-": { p: 2, a: "left", n: 2, fn: (a, b) => a - b },
  "*": { p: 3, a: "left", n: 2, fn: (a, b) => a * b },
  "/": { p: 3, a: "left", n: 2, fn: (a, b) => a / b },
  "^": { p: 4, a: "right", n: 2, fn: (a, b) => Math.pow(a, b) },
  "neg": { p: 4, a: "right", n: 1, fn: (a) => -a }
};

function toRad(value) {
  return angleMode === "deg" ? value * Math.PI / 180 : value;
}

function fromRad(value) {
  return angleMode === "deg" ? value * 180 / Math.PI : value;
}

const funcs = {
  sin: { n: 1, fn: (a) => Math.sin(toRad(a)) },
  cos: { n: 1, fn: (a) => Math.cos(toRad(a)) },
  tan: { n: 1, fn: (a) => Math.tan(toRad(a)) },
  asin: { n: 1, fn: (a) => fromRad(Math.asin(a)) },
  acos: { n: 1, fn: (a) => fromRad(Math.acos(a)) },
  atan: { n: 1, fn: (a) => fromRad(Math.atan(a)) },
  sqrt: { n: 1, fn: Math.sqrt },
  abs: { n: 1, fn: Math.abs },
  ln: { n: 1, fn: Math.log },
  log: { n: 1, fn: Math.log10 },
  exp: { n: 1, fn: Math.exp },
  floor: { n: 1, fn: Math.floor },
  ceil: { n: 1, fn: Math.ceil },
  round: { n: 1, fn: Math.round },
  min: { n: 2, fn: Math.min },
  max: { n: 2, fn: Math.max }
};

function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i += 1;
    } else if (/[0-9.]/.test(c)) {
      let start = i;
      i += 1;
      while (i < text.length && /[0-9.]/.test(text[i])) i += 1;
      if (/[eE]/.test(text[i])) {
        const e = i;
        i += 1;
        if (/[+-]/.test(text[i])) i += 1;
        while (i < text.length && /[0-9]/.test(text[i])) i += 1;
        if (i === e + 1) i = e;
      }
      const value = Number(text.slice(start, i));
      if (!Number.isFinite(value)) throw new Error("Bad number");
      tokens.push({ type: "number", value });
    } else if (/[a-zA-Z_]/.test(c)) {
      let start = i;
      i += 1;
      while (i < text.length && /[a-zA-Z0-9_]/.test(text[i])) i += 1;
      tokens.push({ type: "name", value: text.slice(start, i).toLowerCase() });
    } else if ("+-*/^(),".includes(c)) {
      tokens.push({ type: c, value: c });
      i += 1;
    } else {
      throw new Error("Unexpected character: " + c);
    }
  }
  return tokens;
}

function toRpn(tokens) {
  const output = [];
  const stack = [];
  let prev = "start";
  tokens.forEach((token) => {
    if (token.type === "number") {
      output.push(token);
      prev = "value";
    } else if (token.type === "name") {
      if (token.value === "pi" || token.value === "e" || token.value === "x") {
        output.push(token);
        prev = "value";
      } else if (funcs[token.value]) {
        stack.push({ type: "func", value: token.value });
        prev = "func";
      } else {
        throw new Error("Unknown name: " + token.value);
      }
    } else if (token.type === ",") {
      while (stack.length && stack[stack.length - 1].type !== "(") output.push(stack.pop());
      if (!stack.length) throw new Error("Misplaced comma");
      prev = "comma";
    } else if (token.type === "(") {
      stack.push(token);
      prev = "(";
    } else if (token.type === ")") {
      while (stack.length && stack[stack.length - 1].type !== "(") output.push(stack.pop());
      if (!stack.length) throw new Error("Mismatched parentheses");
      stack.pop();
      if (stack.length && stack[stack.length - 1].type === "func") output.push(stack.pop());
      prev = "value";
    } else if (ops[token.type]) {
      const symbol = token.type === "-" && (prev === "start" || prev === "op" || prev === "(" || prev === "comma" || prev === "func") ? "neg" : token.type;
      const current = ops[symbol];
      while (stack.length && stack[stack.length - 1].type === "op") {
        const top = ops[stack[stack.length - 1].value];
        const shouldPop = current.a === "left" ? current.p <= top.p : current.p < top.p;
        if (!shouldPop) break;
        output.push(stack.pop());
      }
      stack.push({ type: "op", value: symbol });
      prev = "op";
    }
  });
  while (stack.length) {
    const top = stack.pop();
    if (top.type === "(" || top.type === ")") throw new Error("Mismatched parentheses");
    output.push(top);
  }
  return output;
}

function evaluateRpn(rpn, vars) {
  const stack = [];
  rpn.forEach((token) => {
    if (token.type === "number") {
      stack.push(token.value);
    } else if (token.type === "name") {
      if (token.value === "pi") stack.push(Math.PI);
      else if (token.value === "e") stack.push(Math.E);
      else if (token.value === "x") stack.push(vars && Number.isFinite(vars.x) ? vars.x : 0);
      else throw new Error("Unknown variable");
    } else if (token.type === "op") {
      const op = ops[token.value];
      if (stack.length < op.n) throw new Error("Missing operand");
      const args = stack.splice(stack.length - op.n, op.n);
      stack.push(op.fn.apply(null, args));
    } else if (token.type === "func") {
      const fn = funcs[token.value];
      if (stack.length < fn.n) throw new Error("Missing function argument");
      const args = stack.splice(stack.length - fn.n, fn.n);
      stack.push(fn.fn.apply(null, args));
    }
  });
  if (stack.length !== 1) throw new Error("Incomplete expression");
  const value = stack[0];
  if (!Number.isFinite(value)) throw new Error("Result is not finite");
  return value;
}

function calculate(text, vars) {
  return evaluateRpn(toRpn(tokenize(text)), vars);
}

function formatNumber(value) {
  if (Math.abs(value) >= 1e12 || (Math.abs(value) > 0 && Math.abs(value) < 1e-8)) return value.toExponential(12).replace(/\.?0+e/, "e");
  return Number(value.toPrecision(14)).toString();
}

function addHistory(expr, value) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = expr + " = " + value;
  button.addEventListener("click", () => {
    expression.value = expr;
    expression.focus();
  });
  li.appendChild(button);
  history.prepend(li);
  while (history.children.length > 12) history.lastElementChild.remove();
}

function runCalculation() {
  const text = expression.value.trim();
  if (!text) {
    result.textContent = "0";
    return;
  }
  try {
    const value = calculate(text);
    const formatted = formatNumber(value);
    result.textContent = formatted;
    addHistory(text, formatted);
  } catch (err) {
    result.textContent = err.message;
  }
}

function insertText(text) {
  const start = expression.selectionStart;
  const end = expression.selectionEnd;
  expression.value = expression.value.slice(0, start) + text + expression.value.slice(end);
  const next = start + text.length;
  expression.setSelectionRange(next, next);
  expression.focus();
}

function setAngleMode(next) {
  angleMode = next;
  radMode.setAttribute("aria-pressed", String(next === "rad"));
  degMode.setAttribute("aria-pressed", String(next === "deg"));
  runCalculation();
}

function integrate() {
  try {
    let n = Math.floor(Number(intervals.value));
    if (!Number.isFinite(n) || n < 2) n = 2;
    if (n % 2) n += 1;
    n = Math.min(n, 20000);
    intervals.value = String(n);
    const a = calculate(lower.value);
    const b = calculate(upper.value);
    const rpn = toRpn(tokenize(integrand.value));
    const h = (b - a) / n;
    let sum = evaluateRpn(rpn, { x: a }) + evaluateRpn(rpn, { x: b });
    for (let i = 1; i < n; i += 1) {
      const x = a + h * i;
      sum += (i % 2 === 0 ? 2 : 4) * evaluateRpn(rpn, { x });
    }
    const value = sum * h / 3;
    if (!Number.isFinite(value)) throw new Error("Integral is not finite");
    integralResult.textContent = formatNumber(value);
  } catch (err) {
    integralResult.textContent = err.message;
  }
}

keys.addEventListener("click", (evt) => {
  const button = evt.target.closest("button");
  if (!button) return;
  if (button.dataset.insert) insertText(button.dataset.insert);
  if (button.dataset.action === "clear") {
    expression.value = "";
    result.textContent = "0";
    expression.focus();
  }
  if (button.dataset.action === "backspace") {
    const start = expression.selectionStart;
    const end = expression.selectionEnd;
    if (start !== end) {
      expression.value = expression.value.slice(0, start) + expression.value.slice(end);
      expression.setSelectionRange(start, start);
    } else if (start > 0) {
      expression.value = expression.value.slice(0, start - 1) + expression.value.slice(start);
      expression.setSelectionRange(start - 1, start - 1);
    }
    expression.focus();
  }
  if (button.dataset.action === "calculate") runCalculation();
});

expression.addEventListener("keydown", (evt) => {
  if (evt.key === "Enter") runCalculation();
});
expression.addEventListener("input", () => {
  if (expression.value.trim()) runCalculation();
  else result.textContent = "0";
});
radMode.addEventListener("click", () => setAngleMode("rad"));
degMode.addEventListener("click", () => setAngleMode("deg"));
integrateButton.addEventListener("click", integrate);
sourceButton.addEventListener("click", () => {
  window.open("view-source:" + location.href, "_blank", "noopener,noreferrer");
});

expression.value = "sin(pi/4)^2 + cos(pi/4)^2";
runCalculation();
window.UsefulToolCalculator = { calculate, formatNumber, integrate, runCalculation, setAngleMode, tokenize, toRpn, evaluateRpn };
