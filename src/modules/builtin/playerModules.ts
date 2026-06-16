export function playerModules(actions: any) {
  return [
    {
      id: "clear-local-effects",
      label: "Clear Effects",
      description: "Clear local applied status effect state and runtime artifacts.",
      category: "Players",
      keybind: "KeyC",
      run: actions.clearPlayerEffectState,
    },
  ];
}

