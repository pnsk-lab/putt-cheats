export function coreModules(actions: any) {
  return [
    {
      id: "toggle-ui",
      label: "Toggle UI",
      description: "Show or hide the control panel.",
      category: "Core",
      keybind: "ShiftRight",
      run: actions.toggleUI,
    },
    {
      id: "resync-state",
      label: "Resync State",
      description: "Repair local player state and push it back through the normal state update path.",
      category: "Core",
      keybind: "KeyR",
      run: actions.repairLocalState,
    },
  ];
}

