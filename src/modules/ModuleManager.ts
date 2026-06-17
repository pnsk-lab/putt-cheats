import { keybindManager } from "../keybind/KeybindManager.js";
import { log } from "../state.js";

export type ModuleCategory = "Core" | "Teleport" | "Powerups" | "Players" | "World" | "Visuals";

export type PuttModule = {
  id: string;
  label: string;
  description: string;
  category: ModuleCategory;
  keybind?: string;
  mode?: "action" | "toggle" | "panel" | "arm";
  run?: () => unknown;
  enable?: () => unknown;
  disable?: () => unknown;
  isEnabled?: () => boolean;
};

export class ModuleManager {
  private modules = new Map<string, PuttModule>();
  private listeners = new Set<() => void>();

  register(module: PuttModule) {
    this.modules.set(module.id, module);
    if (module.keybind) {
      keybindManager.bind(module.keybind, () => this.invoke(module.id));
    }
    this.notify();
  }

  get(id: string) {
    return this.modules.get(id) || null;
  }

  getAll() {
    return Array.from(this.modules.values());
  }

  getByCategory() {
    return this.getAll().reduce((groups, module) => {
      const list = groups.get(module.category) || [];
      list.push(module);
      groups.set(module.category, list);
      return groups;
    }, new Map<ModuleCategory, PuttModule[]>());
  }

  invoke(id: string) {
    const module = this.modules.get(id);
    if (!module) return false;
    try {
      if (module.mode === "toggle") return this.toggle(id);
      module.run?.();
      this.notify();
      return true;
    } catch (e) {
      log("[putt:WARN] module failed", id, e);
      return false;
    }
  }

  toggle(id: string, enabled = !this.modules.get(id)?.isEnabled?.()) {
    const module = this.modules.get(id);
    if (!module) return false;
    try {
      if (enabled) module.enable?.();
      else module.disable?.();
      this.notify();
      return true;
    } catch (e) {
      log("[putt:WARN] module toggle failed", id, e);
      return false;
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitChange() {
    this.notify();
  }

  private notify() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (e) {
        log("[putt:WARN] module listener failed", e);
      }
    });
  }
}

export const moduleManager = new ModuleManager();
