import { state } from "../../state.js";

export function visualModules(actions: any) {
  return [
    {
      id: "trajectories",
      label: "Trajectories",
      description: "Toggle remote ball trajectory overlay.",
      category: "Visuals",
      mode: "toggle",
      keybind: "KeyV",
      isEnabled: () => Boolean(state.trajectoriesEnabled),
      enable: () => actions.setTrajectoriesEnabled(true),
      disable: () => actions.setTrajectoriesEnabled(false),
    },
  ];
}

