export function playerModules(actions: any) {
  return [
    {
      id: "player-items-panel",
      label: "Player Items",
      description: "Open the player item removal panel.",
      category: "Players",
      mode: "panel",
      run: () => actions.togglePanel("player-items"),
      isEnabled: () => actions.isPanelOpen("player-items"),
    },
    {
      id: "player-effects-panel",
      label: "Player Effects",
      description: "Open the player effect panel.",
      category: "Players",
      mode: "panel",
      run: () => actions.togglePanel("player-effects"),
      isEnabled: () => actions.isPanelOpen("player-effects"),
    },
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
