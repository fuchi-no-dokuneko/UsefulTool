(function initializeTheme() {
  const storageKey = "usefultool:theme";

  function preferredTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function storedTheme() {
    try {
      return localStorage.getItem(storageKey);
    } catch (error) {
      return null;
    }
  }

  function applyTheme(theme) {
    const selected = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = selected;
    try {
      localStorage.setItem(storageKey, selected);
    } catch (error) {
      // Theme still works for this page even when storage is blocked.
    }
    document.querySelectorAll("[data-theme-label]").forEach((label) => {
      label.textContent = selected === "dark" ? "Light" : "Dark";
    });
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.setAttribute("aria-label", "Switch to " + (selected === "dark" ? "light" : "dark") + " mode");
    });
  }

  function installThemeToggle() {
    const nav = document.querySelector(".topbar nav, header nav, nav");
    if (!nav || nav.querySelector("[data-theme-toggle]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    button.dataset.themeToggle = "";
    button.innerHTML = '<span data-theme-label></span>';
    button.addEventListener("click", () => {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });
    nav.appendChild(button);
    applyTheme(document.documentElement.dataset.theme || storedTheme() || preferredTheme());
  }

  applyTheme(storedTheme() || preferredTheme());
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installThemeToggle, { once: true });
  } else {
    installThemeToggle();
  }

  window.UsefulToolTheme = {
    apply: applyTheme,
    current() {
      return document.documentElement.dataset.theme || "light";
    }
  };
})();

(function lockOutboundRuntime() {
  const deny = function () { throw new Error("Outbound network calls are disabled in UsefulTool."); };
  window.fetch = deny;
  window.XMLHttpRequest = deny;
  window.WebSocket = deny;
  window.EventSource = deny;
  if (navigator.sendBeacon) navigator.sendBeacon = function () { return false; };
})();

window.UsefulTool = {
  download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  status(element, message, mode) {
    element.textContent = message;
    element.className = "status" + (mode ? " " + mode : "");
  },
  bytesLabel(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KiB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MiB";
  },
  setTheme: window.UsefulToolTheme.apply,
  getTheme: window.UsefulToolTheme.current
};
