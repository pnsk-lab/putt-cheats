import { log } from "../state.js";

type KeybindCallback = (event: KeyboardEvent) => void;

export class KeybindManager {
  private bindings = new Map<string, KeybindCallback>();
  private installed = false;

  install() {
    if (this.installed) return;
    this.installed = true;
    document.addEventListener("keydown", this.handleKeyDown, true);
    document.getElementById("GameCanvas")?.addEventListener("keydown", this.handleKeyDown, true);
  }

  bind(code: string, callback: KeybindCallback) {
    const normalized = normalizeKeyCode(code);
    if (!normalized) return;
    this.bindings.set(normalized, callback);
  }

  unbind(code: string) {
    const normalized = normalizeKeyCode(code);
    if (!normalized) return;
    this.bindings.delete(normalized);
  }

  getBindings() {
    return Array.from(this.bindings.keys());
  }

  destroy() {
    if (!this.installed) return;
    document.removeEventListener("keydown", this.handleKeyDown, true);
    document.getElementById("GameCanvas")?.removeEventListener("keydown", this.handleKeyDown, true);
    this.bindings.clear();
    this.installed = false;
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || isEditingText(event.target)) return;
    const callback = this.bindings.get(normalizeKeyCode(event.code));
    if (!callback) return;
    try {
      callback(event);
      event.preventDefault();
      event.stopPropagation();
    } catch (e) {
      log("[putt:WARN] keybind failed", event.code, e);
    }
  };
}

function normalizeKeyCode(code: string) {
  return String(code || "").trim().toLowerCase();
}

function isEditingText(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "SELECT" ||
    tag === "TEXTAREA" ||
    element.isContentEditable ||
    Boolean(element.closest?.("[contenteditable='true']"))
  );
}

export const keybindManager = new KeybindManager();

