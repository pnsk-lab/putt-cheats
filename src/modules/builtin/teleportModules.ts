export function teleportModules(actions: any) {
  return [
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
      keybind: "KeyT",
      run: actions.armTeleportFill,
    },
  ];
}

