export function powerupModules(actions: any) {
  return [
    {
      id: "refill-powerups",
      label: "Refill Powerups",
      description: "Fill open hand slots from the queued powerup list.",
      category: "Powerups",
      keybind: "KeyP",
      run: actions.refillPowerups,
    },
  ];
}

