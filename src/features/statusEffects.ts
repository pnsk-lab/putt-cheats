import { PLAYER_EFFECTS } from "../constants.js";
import { findComponent } from "../engine.js";
import { state } from "../state.js";

export function getStealEffectId() {
  if (state.stealEffectId !== null && state.stealEffectId !== undefined) {
    return state.stealEffectId;
  }
  state.stealEffectId = findStealEffectId();
  return state.stealEffectId;
}

export function getPlayerEffectId(effectName) {
  if (
    state.playerEffectIds[effectName] !== null &&
    state.playerEffectIds[effectName] !== undefined
  ) {
    return state.playerEffectIds[effectName];
  }
  const effectId = findPlayerEffectId(effectName);
  state.playerEffectIds[effectName] = effectId;
  return effectId;
}

export function detectPlayerEffectIds() {
  const out = {};
  for (const name of PLAYER_EFFECTS) {
    out[name] = findPlayerEffectId(name);
  }
  return out;
}

export function getSpawnBumperEffectId() {
  if (state.spawnBumperEffectId !== null && state.spawnBumperEffectId !== undefined) {
    return state.spawnBumperEffectId;
  }
  state.spawnBumperEffectId = findSpawnBumperEffectId();
  return state.spawnBumperEffectId;
}

function findPlayerEffectId(effectName) {
  return findNamedStatusEffectId(new RegExp(`StatusEffect_${effectName}|StatusEffect${effectName}|${effectName}`, "i"));
}

function findStealEffectId() {
  return findNamedStatusEffectId(/StatusEffectStealPowerUp|StatusEffect_StealPowerUp|StealPowerUp/i);
}

function findSpawnBumperEffectId() {
  return findNamedStatusEffectId(/StatusEffect_SpawnBumper|SpawnBumper/i);
}

function findNamedStatusEffectId(namePattern) {
  const scene = window.cc?.director?.getScene();
  const component = findComponent(scene, (c) => {
    const id = Number(c?.statusEffectId ?? c?._statusEffectId);
    return Number.isFinite(id) && namePattern.test(getObjectDebugName(c));
  });
  if (component) return Number(component.statusEffectId ?? component._statusEffectId);
  const puMgr = findComponent(
    scene,
    (c) => Array.isArray(c.cardChoices) && c.cardChoices.length > 0,
  );
  return findStatusEffectIdInObject(puMgr, namePattern);
}

function findStatusEffectIdInObject(root, namePattern) {
  const seen = new Set();
  let found = null;
  const visit = (value, depth) => {
    if (found !== null || !value || depth > 8) return;
    if (typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);

    const name = getObjectDebugName(value);
    if (namePattern.test(name)) {
      const id = Number(value.statusEffectId ?? value._statusEffectId);
      if (Number.isFinite(id)) {
        found = id;
        return;
      }
    }

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    for (const key of Object.keys(value)) {
      if (/parent|children|scene|_scene|node|_node/i.test(key) && depth > 1) continue;
      visit(value[key], depth + 1);
      if (found !== null) return;
    }
  };
  visit(root, 0);
  return found;
}

function getObjectDebugName(value) {
  return [
    value?.name,
    value?._name,
    value?.node?.name,
    value?.constructor?.name,
    value?.__classname__,
  ]
    .filter(Boolean)
    .join(" ");
}
