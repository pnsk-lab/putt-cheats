export function powerupModules(actions: any) {
  return [
    {
      id: "powerups-panel",
      label: "Powerups",
      description: "Open the powerup picker panel.",
      category: "Powerups",
      mode: "panel",
      run: () => actions.togglePanel("powerups"),
      isEnabled: () => actions.isPanelOpen("powerups"),
    },
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
