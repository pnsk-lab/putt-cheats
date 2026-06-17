import { createPlayerEffectsSection } from "./features/playerEffects.js";
import { createPlayerItemsSection } from "./features/playerItems.js";
import { createPowerupsSection } from "./features/powerups.js";
import { createTeleportSection } from "./features/teleport.js";
import { state } from "./state.js";
import { clamp } from "./utils.js";

let actions: any = {};
let moduleBoardUnsubscribe: (() => void) | null = null;
const openPanels = new Map<string, HTMLElement>();

export function configureUI(nextActions) {
  actions = nextActions;
}

export function createUI() {
  if (dedupeExistingUI()) {
    state.uiReady = true;
    return true;
  }
  if (!document.body) return false;
  return forceCreateUI();
}

export function forceCreateUI() {
  removeAllExistingUI();
  const mount = document.body || document.documentElement;
  if (!mount) return false;
  state.uiReady = true;

  const container = document.createElement("div");
  container.id = "putt-ui";
  container.dataset.puttUi = "cheats";
  container.style =
    "position:fixed;inset:0;z-index:2147483647;background:rgba(5,7,10,0.72);color:#f5f7fb;padding:0;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;font-size:clamp(0.54rem,0.92vw,0.7rem);box-sizing:border-box;overflow:auto;line-height:1.2;display:none;backdrop-filter:blur(0.45rem);";

  const style = document.createElement("style");
  style.textContent = `
    #putt-ui button, #putt-ui input, #putt-ui select {
      background: #242830 !important;
      color: #f5f7fb !important;
      border: 1px solid #3b424d !important;
      font-family: inherit !important;
      font-size: clamp(0.52rem, 0.86vw, 0.66rem) !important;
      padding: 0.36em 0.48em !important;
      margin: 0.04rem 0;
      border-radius: 0.28rem;
      cursor: pointer;
      outline: none;
      transition: all 0.1s;
    }
    #putt-ui button:hover {
      background: #303743 !important;
      border-color: #5cc8ff !important;
    }
    #putt-ui button:active {
      background: #1976a9 !important;
      color: #fff !important;
    }
    #putt-ui button.primary {
      background: #1976a9 !important;
      color: #fff !important;
      border-color: #2b9cd4 !important;
      text-transform: uppercase;
    }
    #putt-ui button.primary:hover {
      background: #2589c0 !important;
      border-color: #5cc8ff !important;
    }
    #putt-ui input:focus {
      border-color: #00aaff !important;
    }
    #putt-ui input::placeholder {
      color: #666;
    }
    #putt-ui hr {
      border: 0;
      border-top: 1px solid #333;
      margin: 0.34rem 0;
    }
    #putt-status {
      font-size: clamp(0.52rem, 0.9vw, 0.65rem) !important;
      color: #cbd2dd !important;
      margin: 0 auto 0.74rem;
      width: min(52rem, calc(100vw - 2rem));
      background: rgba(16,18,21,0.78);
      padding: 0.36rem 0.48rem;
      border-radius: 0.32rem;
      border-left: 0.18rem solid #5cc8ff;
      overflow-wrap: anywhere;
    }
    #putt-body {
      width: 100%;
      padding: 1.1rem clamp(0.8rem, 2vw, 1.6rem) 1.8rem;
      box-sizing: border-box;
      overflow: visible;
    }
    #putt-module-board {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
      gap: 0.7rem;
      width: min(72rem, calc(100vw - 2rem));
      margin: 0 auto;
      align-items: start;
    }
    #putt-ui .putt-module-category {
      border: 1px solid rgba(92, 200, 255, 0.22);
      background: rgba(16, 19, 24, 0.78);
      border-radius: 0.48rem;
      overflow: hidden;
      box-shadow: 0 0.7rem 1.8rem rgba(0,0,0,0.28);
    }
    #putt-ui .putt-module-category-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.38rem;
      min-height: 2.15rem;
      padding: 0.44rem 0.58rem;
      background: rgba(8, 10, 13, 0.86);
      border-bottom: 1px solid rgba(92, 200, 255, 0.18);
      color: #e8edf5;
      font-weight: 900;
      text-transform: uppercase;
      font-size: clamp(0.52rem, 0.82vw, 0.64rem);
      cursor: pointer;
      user-select: none;
    }
    #putt-ui .putt-module-category-title {
      display: inline-flex;
      align-items: center;
      gap: 0.38rem;
      min-width: 0;
    }
    #putt-ui .putt-drawer-caret {
      color: #9ee0ff;
      font-size: 0.76rem;
      line-height: 1;
    }
    #putt-ui .putt-module-category-count {
      color: #8ea0b7;
      font-weight: 800;
      font-size: clamp(0.45rem, 0.72vw, 0.56rem);
    }
    #putt-ui .putt-module-list {
      display: flex;
      flex-direction: column;
      gap: 0.22rem;
      padding: 0.34rem;
    }
    #putt-ui .putt-module-category[data-open="false"] .putt-module-list {
      display: none;
    }
    #putt-ui .putt-module {
      min-height: 2.9rem;
      text-align: left;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 0.28rem;
      background: #20242b !important;
      border-color: #3a424d !important;
      margin: 0;
    }
    #putt-ui .putt-module[data-enabled="true"] {
      border-color: #80d48a !important;
      background: #1f3029 !important;
    }
    #putt-ui .putt-module-top,
    #putt-ui .putt-module-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.32rem;
      min-width: 0;
    }
    #putt-ui .putt-module strong {
      display: block;
      font-size: clamp(0.55rem, 0.9vw, 0.68rem);
      font-weight: 800;
      line-height: 1.1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #putt-ui .putt-module-mode {
      color: #aeb8c7;
      font-size: clamp(0.48rem, 0.78vw, 0.58rem);
      line-height: 1.15;
      text-transform: uppercase;
      font-weight: 800;
    }
    #putt-ui .putt-keycap {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.45rem;
      max-width: 4.8rem;
      min-height: 1.05rem;
      padding: 0.1rem 0.28rem;
      border-radius: 0.24rem;
      background: #0b0d10;
      color: #9ee0ff;
      border: 1px solid #3d5367;
      box-shadow: inset 0 -1px 0 rgba(255,255,255,0.1);
      font-size: clamp(0.48rem, 0.74vw, 0.56rem);
      font-weight: 900;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #putt-ui .putt-module-state {
      flex: 0 0 auto;
      color: #8ea0b7;
      font-size: clamp(0.46rem, 0.72vw, 0.54rem);
      font-weight: 900;
      text-transform: uppercase;
    }
    #putt-ui .putt-module[data-enabled="true"] .putt-module-state {
      color: #9bea9f;
    }
    #putt-ui .putt-section-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0.4rem;
    }
    .putt-panel {
      position: fixed;
      z-index: 2147483646;
      width: clamp(13rem, 22vw, 18rem);
      max-width: calc(100vw - 1rem);
      background: rgba(18, 21, 26, 0.78);
      color: #f5f7fb;
      border: 1px solid rgba(92, 200, 255, 0.32);
      border-radius: 0.45rem;
      box-shadow: 0 0.8rem 2rem rgba(0,0,0,0.46);
      backdrop-filter: blur(0.42rem);
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: clamp(0.54rem,0.92vw,0.7rem);
      line-height: 1.2;
    }
    .putt-panel button, .putt-panel input, .putt-panel select {
      background: rgba(36, 40, 48, 0.88) !important;
      color: #f5f7fb !important;
      border: 1px solid #3b424d !important;
      font-family: inherit !important;
      font-size: clamp(0.52rem, 0.86vw, 0.66rem) !important;
      padding: 0.36em 0.48em !important;
      margin: 0.04rem 0;
      border-radius: 0.28rem;
      outline: none;
    }
    .putt-panel button {
      cursor: pointer;
    }
    .putt-panel button:hover {
      background: rgba(48, 55, 67, 0.94) !important;
      border-color: #5cc8ff !important;
    }
    .putt-panel button.primary {
      background: rgba(25, 118, 169, 0.9) !important;
      border-color: #2b9cd4 !important;
      font-weight: 900;
      text-transform: uppercase;
    }
    .putt-panel-titlebar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.48rem 0.58rem;
      background: rgba(10, 12, 15, 0.78);
      border-bottom: 1px solid rgba(92, 200, 255, 0.22);
      cursor: move;
      user-select: none;
      text-transform: uppercase;
      font-weight: 900;
    }
    .putt-panel-close {
      cursor: pointer;
      color: #9ee0ff;
      padding: 0 0.24rem;
      font-size: 0.9rem;
      line-height: 1;
    }
    .putt-panel-body {
      padding: 0.62rem;
    }
    .putt-welcome {
      position: fixed;
      left: 50%;
      top: 8vh;
      transform: translateX(-50%);
      z-index: 2147483647;
      color: #f5f7fb;
      background: rgba(11, 13, 16, 0.82);
      border: 1px solid rgba(92, 200, 255, 0.36);
      border-radius: 0.45rem;
      box-shadow: 0 0.7rem 2rem rgba(0,0,0,0.42);
      backdrop-filter: blur(0.35rem);
      padding: 0.74rem 1rem;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 0.84rem;
      font-weight: 900;
      line-height: 1.55;
      letter-spacing: 0;
      text-transform: uppercase;
      text-align: center;
      pointer-events: none;
      opacity: 0;
      animation: puttWelcome 2.8s ease forwards;
    }
    .putt-welcome kbd {
      color: #9ee0ff;
      background: #0b0d10;
      border: 1px solid #3d5367;
      border-radius: 0.24rem;
      padding: 0.12rem 0.34rem;
      margin: 0 0.12rem;
      font: inherit;
    }
    @keyframes puttWelcome {
      0% { opacity: 0; transform: translate(-50%, -0.35rem); }
      14% { opacity: 1; transform: translate(-50%, 0); }
      78% { opacity: 1; transform: translate(-50%, 0); }
      100% { opacity: 0; transform: translate(-50%, -0.35rem); }
    }
    @keyframes puttGuiFadeIn {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
  `;
  container.appendChild(style);

  const titlebar = document.createElement("div");
  titlebar.id = "putt-titlebar";
  titlebar.style =
    "font-weight:1000;display:flex;justify-content:center;align-items:center;gap:0.75rem;padding:1.3rem 3rem 0.75rem;user-select:none;font-size:clamp(1.25rem,4vw,3rem);color:#f5f7fb;text-transform:uppercase;text-shadow:0 0 0.8rem rgba(92,200,255,0.48);letter-spacing:0;";
  titlebar.innerHTML = `<span>PUTT CHEATS</span><span id="putt-min" style="position:absolute;right:1.2rem;top:1rem;cursor:pointer;padding:0.2rem 0.48rem;color:#9ee0ff;font-size:1.2rem;line-height:1;" title="Close">x</span>`;

  const body = document.createElement("div");
  body.id = "putt-body";

  const status = document.createElement("div");
  status.id = "putt-status";
  status.textContent = "INITIALIZING SYSTEM...";

  const modules = document.createElement("div");
  modules.id = "putt-module-board";
  renderModuleBoard(modules);
  moduleBoardUnsubscribe?.();
  moduleBoardUnsubscribe = actions.onModulesChanged?.(() => refreshModuleBoard()) || null;

  body.append(
    status,
    modules,
  );

  container.append(titlebar, body);
  mount.appendChild(container);
  window.__puttUiContainer = container;

  document.getElementById("putt-min").onclick = () => {
    container.style.display = "none";
  };

  updateStatus();
  actions.detectPowerupIds?.({ silent: true });
  actions.refreshPlayerItemUI?.();
  actions.refreshPlayerEffectUI?.();
  showWelcomeOverlay();
  return true;
}

export function toggleUI() {
  const container = document.getElementById("putt-ui");
  if (!container) {
    return forceCreateUI();
  }
  const hidden = container.style.display === "none";
  container.style.display = hidden ? "block" : "none";
  if (hidden) {
    refreshModuleBoard();
    container.style.animation = "none";
    container.offsetHeight;
    container.style.animation = "puttGuiFadeIn 140ms ease-out";
  }
  return true;
}

function hideClickGui() {
  const container = document.getElementById("putt-ui");
  if (container) container.style.display = "none";
}

export function toggleFormPanel(id: string) {
  if (isPanelOpen(id)) {
    closePanel(id);
    return false;
  }
  openFormPanel(id);
  return true;
}

export function isPanelOpen(id: string) {
  return Boolean(openPanels.get(id)?.isConnected);
}

export function refreshModuleBoard() {
  const modules = document.getElementById("putt-module-board");
  if (modules) renderModuleBoard(modules);
}

function renderModuleBoard(root) {
  const modules = actions.getModules?.() || [];
  if (!modules.length) {
    root.innerHTML = "";
    return;
  }
  root.innerHTML = "";

  groupModulesByCategory(modules).forEach(([category, categoryModules]) => {
    const section = document.createElement("section");
    section.className = "putt-module-category";
    const isOpen = isCategoryOpen(category);
    section.dataset.open = String(isOpen);
    section.innerHTML = `
      <div class="putt-module-category-header">
        <span class="putt-module-category-title">
          <span class="putt-drawer-caret">${isOpen ? "v" : ">"}</span>
          <span>${escapeHtml(category)}</span>
        </span>
        <span class="putt-module-category-count">${categoryModules.length}</span>
      </div>
    `;
    section.querySelector(".putt-module-category-header")?.addEventListener("click", () => {
      toggleCategory(category);
      renderModuleBoard(root);
    });

    const list = document.createElement("div");
    list.className = "putt-module-list";
    categoryModules.forEach((module) => {
      const button = document.createElement("button");
      const enabled = Boolean(module.isEnabled?.());
      button.className = "putt-module";
      button.type = "button";
      button.dataset.moduleId = module.id;
      button.dataset.enabled = String(enabled);
      button.title = module.description || module.label;
      const keybind = module.keybind ? `<span class="putt-keycap">${escapeHtml(formatKeybind(module.keybind))}</span>` : "";
      const stateText = getModuleStateText(module, enabled);
      button.innerHTML = `
        <span class="putt-module-top">
          <strong>${escapeHtml(module.label)}</strong>
          ${keybind}
        </span>
        <span class="putt-module-bottom">
          <span class="putt-module-mode">${escapeHtml(module.mode || "action")}</span>
          <span class="putt-module-state">${escapeHtml(stateText)}</span>
        </span>
      `;
      button.addEventListener("click", () => {
        actions.invokeModule?.(module.id);
        if (module.mode === "panel" || module.mode === "arm") {
          hideClickGui();
        }
        renderModuleBoard(root);
        updateStatus();
      });
      list.appendChild(button);
    });
    section.appendChild(list);
    root.appendChild(section);
  });
}

function isCategoryOpen(category) {
  if (!(state.openModuleCategories instanceof Set)) {
    state.openModuleCategories = new Set(["Core", "Teleport", "Powerups", "Players", "World", "Visuals"]);
  }
  return state.openModuleCategories.has(category);
}

function toggleCategory(category) {
  if (!(state.openModuleCategories instanceof Set)) {
    state.openModuleCategories = new Set();
  }
  if (state.openModuleCategories.has(category)) {
    state.openModuleCategories.delete(category);
  } else {
    state.openModuleCategories.add(category);
  }
}

function getModuleStateText(module, enabled) {
  if (module.mode === "toggle") return enabled ? "On" : "Off";
  if (module.mode === "panel") return enabled ? "Open" : "Closed";
  if (module.mode === "arm") return "Arm";
  return "Run";
}

function openFormPanel(id: string) {
  const config = getPanelConfig(id);
  if (!config) return false;
  return openPanel(id, config.title, config.render);
}

function getPanelConfig(id: string) {
  const configs = {
    teleport: {
      title: "Manual Teleport",
      render: () => createTeleportSection(actions),
    },
    powerups: {
      title: "Powerups",
      render: () => createPowerupsSection(actions),
    },
    "player-items": {
      title: "Player Items",
      render: () => createPlayerItemsSection(actions),
    },
    "player-effects": {
      title: "Player Effects",
      render: () => createPlayerEffectsSection(actions),
    },
  };
  return configs[id] || null;
}

function openPanel(id: string, title: string, renderContent: () => HTMLElement) {
  closePanel(id);
  const mount = document.body || document.documentElement;
  if (!mount) return false;

  const panel = document.createElement("div");
  panel.className = "putt-panel";
  panel.dataset.panelId = id;
  panel.style.left = `${getPanelLeft(id)}px`;
  panel.style.top = `${getPanelTop(id)}px`;

  const titlebar = document.createElement("div");
  titlebar.className = "putt-panel-titlebar";
  titlebar.innerHTML = `<span>${escapeHtml(title)}</span><span class="putt-panel-close" title="Disable">x</span>`;

  const body = document.createElement("div");
  body.className = "putt-panel-body";
  body.appendChild(renderContent());

  panel.append(titlebar, body);
  mount.appendChild(panel);
  openPanels.set(id, panel);
  refreshPanelContent(id);
  installUiDrag(panel, titlebar);
  fitUiToViewport(panel);
  const closeButton = titlebar.querySelector(".putt-panel-close");
  closeButton?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  closeButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closePanel(id);
  });
  notifyPanelStateChanged();
  return true;
}

function refreshPanelContent(id: string) {
  if (id === "powerups") {
    actions.detectPowerupIds?.({ silent: true });
  } else if (id === "player-items") {
    actions.refreshPlayerItemUI?.();
  } else if (id === "player-effects") {
    actions.refreshPlayerEffectUI?.();
  }
}

function closePanel(id: string) {
  const panel = openPanels.get(id);
  const wasOpen = Boolean(panel);
  if (panel) panel.remove();
  openPanels.delete(id);
  if (wasOpen) notifyPanelStateChanged();
}

function notifyPanelStateChanged() {
  refreshModuleBoard();
  actions.notifyModulesChanged?.();
}

function getPanelLeft(id: string) {
  const order = ["teleport", "powerups", "player-items", "player-effects"];
  const index = Math.max(0, order.indexOf(id));
  return Math.min(window.innerWidth - 220, 24 + index * 34);
}

function getPanelTop(id: string) {
  const order = ["teleport", "powerups", "player-items", "player-effects"];
  const index = Math.max(0, order.indexOf(id));
  return Math.min(window.innerHeight - 180, 92 + index * 34);
}

function groupModulesByCategory(modules) {
  const order = ["Core", "Teleport", "Powerups", "Players", "World", "Visuals"];
  const groups = new Map();
  modules.forEach((module) => {
    const list = groups.get(module.category) || [];
    list.push(module);
    groups.set(module.category, list);
  });
  return Array.from(groups.entries()).sort((a, b) => {
    const ai = order.indexOf(a[0]);
    const bi = order.indexOf(b[0]);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function formatKeybind(code) {
  const text = String(code || "").trim();
  const aliases = {
    ShiftLeft: "L Shift",
    ShiftRight: "R Shift",
    ControlLeft: "L Ctrl",
    ControlRight: "R Ctrl",
    AltLeft: "L Alt",
    AltRight: "R Alt",
    MetaLeft: "L Cmd",
    MetaRight: "R Cmd",
    Delete: "Del",
    Backspace: "Bksp",
    Space: "Space",
    Escape: "Esc",
  };
  if (aliases[text]) return aliases[text];
  if (/^Key[A-Z]$/i.test(text)) return text.slice(3).toUpperCase();
  if (/^Digit[0-9]$/i.test(text)) return text.slice(5);
  return text.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function dedupeExistingUI() {
  const nodes = findExistingUis();
  if (nodes.length === 0) return false;
  nodes.slice(1).forEach((node) => node.remove());
  window.__puttUiContainer = nodes[0];
  return true;
}

function removeAllExistingUI() {
  findExistingUis().forEach((node) => node.remove());
  document.querySelectorAll<HTMLElement>(".putt-panel").forEach((node) => node.remove());
  openPanels.clear();
  window.__puttUiContainer = null;
}

function findExistingUis(): HTMLElement[] {
  const nodes = new Set<HTMLElement>(document.querySelectorAll<HTMLElement>("#putt-ui, [data-putt-ui='cheats']"));
  document.querySelectorAll("div").forEach((node) => {
    if (
      node.style?.position === "fixed" &&
      node.style?.zIndex === "2147483647" &&
      (node.textContent?.toUpperCase().includes("PUTT CHEATS"))
    ) {
      nodes.add(node);
    }
  });
  return Array.from(nodes);
}

function showWelcomeOverlay() {
  if (state.welcomeShown) return;
  state.welcomeShown = true;
  const mount = document.body || document.documentElement;
  if (!mount) return;
  const welcome = document.createElement("div");
  welcome.className = "putt-welcome";
  welcome.innerHTML = `Welcome to Putt Cheats<br><kbd>R Shift</kbd> for the UI`;
  mount.appendChild(welcome);
  setTimeout(() => welcome.remove(), 3200);
}

export function updateStatus(message = "") {
  const status = document.getElementById("putt-status");
  if (!status) return;
  const suffix = message ? ` | ${message}` : "";
  status.innerText = `Pos: ${formatLocalPosition()} | Group: ${
    state.group || "?"
  } | Offset: ${state.serverTimeOffset.toFixed(0)}ms${suffix}`;
}

function formatLocalPosition() {
  const playerState = state.localUid ? state.players[state.localUid] : null;
  const pos = state.lastKnownLocalState?.pos || playerState?.pos;
  if (!pos) return "Detecting...";
  const parts = [pos.x, pos.y, pos.z].map((value) =>
    Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "?",
  );
  return parts.join(", ");
}

function installUiDrag(container, handle) {
  if (!container || !handle) return;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target?.id === "putt-min" || event.target?.closest?.(".putt-panel-close")) return;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    const rect = container.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    container.style.right = "auto";
    container.style.bottom = "auto";
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const nextLeft = clamp(startLeft + event.clientX - startX, 0, window.innerWidth - 40);
    const nextTop = clamp(startTop + event.clientY - startY, 0, window.innerHeight - 30);
    container.style.left = `${nextLeft}px`;
    container.style.top = `${nextTop}px`;
  });

  const stop = (event) => {
    if (!dragging) return;
    dragging = false;
    handle.releasePointerCapture?.(event.pointerId);
  };
  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);
}

function fitUiToViewport(container) {
  if (!container?.isConnected) return;
  container.style.transform = "scale(1)";
  requestAnimationFrame(() => {
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const maxWidth = Math.max(160, window.innerWidth - rect.left - 8);
    const maxHeight = Math.max(180, window.innerHeight - rect.top - 8);
    const scale = Math.min(1, maxWidth / rect.width, maxHeight / rect.height);
    container.style.transform = `scale(${Math.max(0.68, scale).toFixed(3)})`;
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
