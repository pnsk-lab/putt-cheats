import { type ModuleManager } from "./ModuleManager.js";
import { coreModules } from "./builtin/coreModules.js";
import { playerModules } from "./builtin/playerModules.js";
import { powerupModules } from "./builtin/powerupModules.js";
import { teleportModules } from "./builtin/teleportModules.js";
import { visualModules } from "./builtin/visualModules.js";
import { worldModules } from "./builtin/worldModules.js";

export type ModuleActions = {
  toggleUI: () => unknown;
  teleportToGoal: () => unknown;
  armTeleportFill: () => unknown;
  addPowerup: (name: string) => unknown;
  refillPowerups: () => unknown;
  repairLocalState: () => unknown;
  clearPlayerEffectState: () => unknown;
  armPutBumper: () => unknown;
  deleteNearest: () => unknown;
  setTrajectoriesEnabled: (enabled: boolean) => unknown;
  updateStatus: (message?: string) => unknown;
  togglePanel: (id: string) => unknown;
  isPanelOpen: (id: string) => boolean;
};

export function registerBuiltinModules(manager: ModuleManager, actions: ModuleActions) {
  [
    ...coreModules(actions),
    ...teleportModules(actions),
    ...powerupModules(actions),
    ...playerModules(actions),
    ...visualModules(actions),
    ...worldModules(actions),
  ].forEach((module: any) => manager.register(module));
}
