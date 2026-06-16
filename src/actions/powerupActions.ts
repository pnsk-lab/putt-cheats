export function createPowerupActions(deps: any, actions: any) {
  return {
    addPowerup(name) {
      actions.syncFromGame();
      if (Object.keys(deps.state.powerupMapping).length === 0) {
        deps.detectPowerupIds({ silent: true });
      }
      const id = deps.state.powerupMapping[name];
      if (id === undefined || !deps.state.lastKnownLocalState) {
        return alert("Detect IDs first.");
      }
      const count = deps.getPowerupCount();
      deps.enqueuePowerups(Array(count).fill(id), false);
    },

    refillPowerups() {
      return deps.refillPowerupSlots();
    },
  };
}

