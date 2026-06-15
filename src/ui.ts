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
    "position:fixed;top:1.5vh;left:1.5vw;z-index:2147483647;background:rgba(20,20,20,0.98);color:#ffffff;padding:clamp(0.34rem,0.95vw,0.62rem);border-radius:0.4rem;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;font-size:clamp(0.54rem,0.92vw,0.7rem);width:clamp(12rem,20vw,17rem);max-width:calc(100vw - 1rem);box-sizing:border-box;overflow:hidden;border:1px solid #333;box-shadow:0 0.5rem 2rem rgba(0,0,0,0.6);line-height:1.2;transform-origin:top left;";

  const style = document.createElement("style");
  style.textContent = `
    #putt-ui button, #putt-ui input, #putt-ui select {
      background: #2a2a2a !important;
      color: #fff !important;
      border: 1px solid #444 !important;
      font-family: inherit !important;
      font-size: clamp(0.52rem, 0.86vw, 0.66rem) !important;
      padding: 0.24em 0.38em !important;
      margin: 0.04rem 0;
      border-radius: 0.22rem;
      cursor: pointer;
      outline: none;
      transition: all 0.1s;
    }
    #putt-ui button:hover {
      background: #3a3a3a !important;
      border-color: #00aaff !important;
    }
    #putt-ui button:active {
      background: #00aaff !important;
      color: #fff !important;
    }
    #putt-ui button.primary {
      background: #00aaff !important;
      color: #fff !important;
      border-color: #00aaff !important;
      text-transform: uppercase;
    }
    #putt-ui button.primary:hover {
      background: #33bbff !important;
      border-color: #33bbff !important;
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
      color: #aaa !important;
      margin-bottom: 0.32rem;
      background: #111;
      padding: 0.22rem 0.34rem;
      border-radius: 0.22rem;
      border-left: 2px solid #00aaff;
      overflow-wrap: anywhere;
    }
  `;
  container.appendChild(style);

  const titlebar = document.createElement("div");
  titlebar.id = "putt-titlebar";
  titlebar.style =
    "font-weight:900;margin-bottom:0.65rem;display:flex;justify-content:space-between;border-bottom:1px solid #333;padding-bottom:0.45rem;cursor:move;user-select:none;letter-spacing:0.5px;font-size:clamp(0.68rem,1.25vw,0.86rem);color:#00aaff;text-transform:uppercase;";
  titlebar.innerHTML = `<span>Putt Cheats v0.9</span><span id="putt-min" style="cursor:pointer;padding:0 5px;color:#fff;">_</span>`;

  const body = document.createElement("div");
  body.id = "putt-body";

  const status = document.createElement("div");
  status.id = "putt-status";
  status.textContent = "INITIALIZING SYSTEM...";

  body.append(
    status,
    createTeleportSection(actions),
    createPowerupsSection(actions),
    createPlayerItemsSection(actions),
    createPlayerEffectsSection(actions),
    createWorldSection(actions, {
      getTrajectoriesEnabled: () => state.trajectoriesEnabled,
      updateStatus,
    }),
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
