import { createCoreActions } from "./coreActions.js";
import { createPlayerActions } from "./playerActions.js";
import { createPowerupActions } from "./powerupActions.js";
import { createTeleportActions } from "./teleportActions.js";
import { createWorldActions } from "./worldActions.js";

export function createPuttActions(deps: any) {
  const actions: any = {};
  Object.assign(
    actions,
    createCoreActions(deps, actions),
    createTeleportActions(deps),
    createPowerupActions(deps, actions),
    createPlayerActions(deps, actions),
    createWorldActions(deps, actions),
  );
  return actions;
}

