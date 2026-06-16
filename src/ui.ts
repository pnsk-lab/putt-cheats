import { createPlayerEffectsSection } from "./features/playerEffects.js";
import { createPlayerItemsSection } from "./features/playerItems.js";
import { createPowerupsSection } from "./features/powerups.js";
import { createTeleportSection } from "./features/teleport.js";
import { createWorldSection } from "./features/world.js";
import { state } from "./state.js";
import { clamp } from "./utils.js";

let actions: any = {};

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
    "position:fixed;top:1.5vh;left:1.5vw;z-index:2147483647;background:#17191c;color:#f5f7fb;padding:0;border-radius:0.45rem;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;font-size:clamp(0.54rem,0.92vw,0.7rem);width:clamp(18rem,30vw,25rem);max-width:calc(100vw - 1rem);box-sizing:border-box;overflow:hidden;border:1px solid #343942;box-shadow:0 0.8rem 2.4rem rgba(0,0,0,0.58);line-height:1.2;transform-origin:top left;";

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
      margin-bottom: 0.52rem;
      background: #101215;
      padding: 0.36rem 0.48rem;
      border-radius: 0.32rem;
      border-left: 0.18rem solid #5cc8ff;
      overflow-wrap: anywhere;
    }
    #putt-body {
      padding: 0.65rem;
      max-height: min(84vh, 58rem);
      overflow: auto;
    }
    #putt-module-board {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.34rem;
      margin-bottom: 0.62rem;
    }
    #putt-ui .putt-module {
      min-height: 3.2rem;
      text-align: left;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 0.22rem;
      background: #20242b !important;
      border-color: #3a424d !important;
    }
    #putt-ui .putt-module[data-enabled="true"] {
      border-color: #80d48a !important;
      background: #1f3029 !important;
    }
    #putt-ui .putt-module strong {
      display: block;
      font-size: clamp(0.55rem, 0.9vw, 0.68rem);
      font-weight: 800;
      line-height: 1.1;
    }
    #putt-ui .putt-module span {
      color: #aeb8c7;
      font-size: clamp(0.48rem, 0.78vw, 0.58rem);
      line-height: 1.15;
    }
    #putt-ui .putt-section-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0.4rem;
    }
  `;
  container.appendChild(style);

  const titlebar = document.createElement("div");
  titlebar.id = "putt-titlebar";
  titlebar.style =
    "font-weight:900;display:flex;justify-content:space-between;align-items:center;gap:0.5rem;background:#101215;border-bottom:1px solid #343942;padding:0.62rem 0.72rem;cursor:move;user-select:none;font-size:clamp(0.68rem,1.25vw,0.88rem);color:#f5f7fb;text-transform:uppercase;";
  titlebar.innerHTML = `<span>Putt Monkey</span><span id="putt-min" style="cursor:pointer;padding:0 5px;color:#9ee0ff;">_</span>`;

  const body = document.createElement("div");
  body.id = "putt-body";

  const status = document.createElement("div");
  status.id = "putt-status";
  status.textContent = "INITIALIZING SYSTEM...";

  const modules = document.createElement("div");
  modules.id = "putt-module-board";
  renderModuleBoard(modules);

  const detailGrid = document.createElement("div");
  detailGrid.className = "putt-section-grid";
  detailGrid.append(
    createTeleportSection(actions),
    createPowerupsSection(actions),
    createPlayerItemsSection(actions),
    createPlayerEffectsSection(actions),
    createWorldSection(actions, {
      getTrajectoriesEnabled: () => state.trajectoriesEnabled,
      updateStatus,
    }),
  );

  body.append(
    status,
    modules,
    detailGrid,
  );

  container.append(titlebar, body);
  mount.appendChild(container);
  window.__puttUiContainer = container;

  installUiDrag(container, titlebar);
  fitUiToViewport(container);
  window.addEventListener("resize", () => fitUiToViewport(container));
  document.getElementById("putt-min").onclick = () => {
    const hidden = body.style.display === "none";
    body.style.display = hidden ? "block" : "none";
    document.getElementById("putt-min").textContent = hidden ? "_" : "+";
    fitUiToViewport(container);
  };

  updateStatus();
  actions.detectPowerupIds?.({ silent: true });
  actions.refreshPlayerItemUI?.();
  actions.refreshPlayerEffectUI?.();
  return true;
}

export function toggleUI() {
  const body = document.getElementById("putt-body");
  const min = document.getElementById("putt-min");
  if (!body) {
    return forceCreateUI();
  }
  const hidden = body.style.display === "none";
  body.style.display = hidden ? "block" : "none";
  if (min) min.textContent = hidden ? "_" : "+";
  const container = document.getElementById("putt-ui");
  if (container) fitUiToViewport(container);
  return true;
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
  modules.forEach((module) => {
    const button = document.createElement("button");
    button.className = "putt-module";
    button.type = "button";
    button.dataset.moduleId = module.id;
    button.dataset.enabled = String(Boolean(module.isEnabled?.()));
    button.title = module.description || module.label;
    const key = module.keybind ? ` · ${module.keybind}` : "";
    button.innerHTML = `<strong>${escapeHtml(module.label)}</strong><span>${escapeHtml(module.category)}${escapeHtml(key)}</span>`;
    button.addEventListener("click", () => {
      actions.invokeModule?.(module.id);
      renderModuleBoard(root);
      updateStatus();
    });
    root.appendChild(button);
  });
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
    if (event.button !== 0 || event.target?.id === "putt-min") return;
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
