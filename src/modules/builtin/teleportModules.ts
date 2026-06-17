export function teleportModules(actions: any) {
  return [
    {
      id: "manual-teleport",
      label: "Manual Teleport",
      description: "Open the coordinate teleport panel.",
      category: "Teleport",
      mode: "panel",
      run: () => actions.togglePanel("teleport"),
      isEnabled: () => actions.isPanelOpen("teleport"),
    },
    {
      id: "teleport-goal",
      label: "Teleport Goal",
      description: "Move the local ball above the current goal.",
      category: "Teleport",
      keybind: "KeyG",
      run: actions.teleportToGoal,
    },
    {
      id: "teleport-click-fill",
      label: "Click Teleport",
      description: "Arm a course click and teleport there immediately.",
      category: "Teleport",
      mode: "arm",
      keybind: "KeyT",
      run: actions.armTeleportFill,
    },
  ];
}
