import { state, log } from "../state.js";

export function getScene() {
  try {
    return window.cc?.director?.getScene?.() || null;
  } catch (e) {
    log("[putt:WARN] failed to get cocos scene", e);
    return null;
  }
}

export function findChildByPath(root: any, path: string) {
  return String(path)
    .split("/")
    .filter(Boolean)
    .reduce((node, name) => node?.getChildByName?.(name) || null, root);
}

function getNodesByPath(paths: string[]) {
  const scene = getScene();
  if (!scene) return [];
  return paths
    .map((path) => ({ path, node: findChildByPath(scene, path) }))
    .filter((entry) => entry.node?.setScale);
}

function cloneScale(scale: any) {
  return {
    x: Number(scale?.x ?? 1),
    y: Number(scale?.y ?? 1),
    z: Number(scale?.z ?? 1),
  };
}

export function setNodesScale(paths: string[], scale: number) {
  const nodes = getNodesByPath(paths);
  let changed = 0;
  nodes.forEach(({ path, node }) => {
    try {
      node.setScale(scale, scale, scale);
      changed++;
    } catch (e) {
      log("[putt:WARN] failed to scale node", path, e);
    }
  });
  return changed;
}

export function isRemoveFatassesEnabled() {
  return Boolean(state.removeFatassesEnabled);
}

const FATASS_PATHS = ["LevelCharacters", "Level/Level_Characters", "Level/Levels_Characters"];

export function setRemoveFatassesEnabled(enabled: boolean) {
  const shouldEnable = Boolean(enabled);
  const nodes = getNodesByPath(FATASS_PATHS);
  if (shouldEnable && nodes.length === 0) return 0;

  let changed = 0;
  nodes.forEach(({ path, node }) => {
    try {
      if (shouldEnable) {
        if (!state.removeFatassesOriginalScales.has(path)) {
          state.removeFatassesOriginalScales.set(path, cloneScale(node.scale));
        }
        node.setScale(0, 0, 0);
      } else {
        const original = state.removeFatassesOriginalScales.get(path) || { x: 1, y: 1, z: 1 };
        node.setScale(original.x, original.y, original.z);
      }
      changed++;
    } catch (e) {
      log("[putt:WARN] failed to toggle character node", path, e);
    }
  });

  if (!shouldEnable) {
    state.removeFatassesOriginalScales.clear();
  }
  state.removeFatassesEnabled = shouldEnable;
  return changed;
}
