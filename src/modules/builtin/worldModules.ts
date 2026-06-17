import { setRemoveFatassesEnabled, isRemoveFatassesEnabled } from "../../game/cocos.js";

export function worldModules(actions: any) {
  return [
    {
      id: "place-bumper",
      label: "Place Bumper",
      description: "Arm a course click to spawn a bumper.",
      category: "World",
      mode: "arm",
      keybind: "KeyB",
      run: actions.armPutBumper,
    },
    {
      id: "delete-nearest",
      label: "Delete Nearest",
      description: "Delete the nearest known placeable or spawned bumper.",
      category: "World",
      keybind: "Delete",
      run: actions.deleteNearest,
    },
    {
      id: "remove-fatasses",
      label: "Remove Fatasses",
      description: "Hide or restore the large decorative course characters.",
      category: "World",
      mode: "toggle",
      keybind: "KeyF",
      isEnabled: isRemoveFatassesEnabled,
      enable: () => {
        const count = setRemoveFatassesEnabled(true);
        actions.updateStatus(`Removed characters: ${count}`);
      },
      disable: () => {
        const count = setRemoveFatassesEnabled(false);
        actions.updateStatus(`Restored characters: ${count}`);
      },
    },
  ];
}
