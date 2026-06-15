import { state, log } from "./state.js";
import {
  clonePlain,
  cloneVec3Like,
  findComponent,
  findNodeByName,
  normalizeVec3,
  walkScene,
} from "./utils.js";

export function getGoalPosition() {
  const mode = getCurrentMode();
  try {
    const first = mode?.GetFirstEndHoleLocation?.();
    const pos = extractWorldPosition(first);
    if (pos) return pos;

    const currentHole = mode?.currentHole;
    const locations =
      currentHole && typeof mode?.GetEndLocationsFromHole === "function"
        ? mode.GetEndLocationsFromHole(currentHole)
        : null;
    if (Array.isArray(locations) && locations.length > 0) {
      const fromList = extractWorldPosition(locations[0]);
      if (fromList) return fromList;
    }
  } catch (e) {
    log("[putt:WARN] failed to get goal from mode", e);
  }

  const scene = window.cc?.director?.getScene();
  const end = findNodeByName(scene, "End");
  return extractWorldPosition(end);
}

export function extractWorldPosition(value) {
  const pos = value?.worldPosition || value?.node?.worldPosition;
  if (!pos) return null;
  return { x: pos.x, y: pos.y, z: pos.z };
}

export function getGameManager() {
  const scene = window.cc?.director?.getScene();
  return findComponent(scene, (c) => c.currentMode && c._netGame);
}

export function getCurrentMode() {
  return getGameManager()?.currentMode || null;
}

export function getLocalNetPlayer() {
  const mode = getCurrentMode();
  if (!mode) return null;
  try {
    if (mode.localGolfPlayer?.netPlayer) return mode.localGolfPlayer.netPlayer;
    if (state.localUid && typeof mode.GetPlayer === "function") {
      return mode.GetPlayer(state.localUid);
    }
  } catch (_) {}
  return null;
}

export function getLocalBallVisual() {
  const local = getLocalNetPlayer();
  return local?.localState?.visual || null;
}

export function getNetPlayerById(id) {
  const targetId = id === null || id === undefined ? null : String(id);
  if (!targetId) return null;
  const mode = getCurrentMode();
  const gm = getGameManager();
  const candidates = [
    mode?.players,
    mode?._players,
    gm?._netGame?.players,
    gm?._netGame?._players,
    gm?._netGame?._client?.players,
  ];
  try {
    if (typeof mode?.GetPlayer === "function") {
      const player = mode.GetPlayer(targetId);
      if (player) return player;
    }
  } catch (_) {}
  for (const collection of candidates) {
    const player = findPlayerInCollection(collection, targetId);
    if (player) return player;
  }
  return null;
}

export function getPlayerBallColor(id) {
  const player = getNetPlayerById(id);
  const visual = player?.localState?.visual;
  const color =
    visual?._ballHandler?.color ||
    visual?.ballHandler?.color ||
    visual?.color ||
    visual?._color;
  return normalizeColor(color);
}

export function getCurrentCameraNode() {
  const gm = getGameManager();
  return gm?.currentCamera?.node || getCurrentMode()?.playerCamera?.node || null;
}

export function getGameCanvasMetrics() {
  const canvas = document.getElementById("GameCanvas");
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const width = canvas.width || rect.width;
  const height = canvas.height || rect.height;
  return {
    canvas,
    rect,
    width,
    height,
    scaleX: width / rect.width,
    scaleY: height / rect.height,
  };
}

export function notifyPlayerStateUpdated(local) {
  try {
    const mode = getCurrentMode();
    if (mode && typeof mode.PlayerStateUpdated === "function") {
      mode.PlayerStateUpdated(local);
    }
  } catch (e) {
    log("[putt:WARN] failed to notify local state update", e);
  }
}

export function getWorldPositionFromCanvasClick(event, options = { includeFallbackPlane: true }) {
  const metrics = getGameCanvasMetrics();
  const cameraNode = getCurrentCameraNode();
  const camera = cameraNode?.getComponent?.(window.cc?.Camera);
  if (!metrics || !camera || !window.cc) return null;
  const canvasX = (event.clientX - metrics.rect.left) * metrics.scaleX;
  const canvasYTop = (event.clientY - metrics.rect.top) * metrics.scaleY;
  const canvasYBottom = metrics.height - canvasYTop;
  return resolveRayPosition(makeCameraRay(camera, canvasX, canvasYBottom), options) ||
    resolveRayPosition(makeCameraRay(camera, canvasX, canvasYTop), options);
}

export function getTeleportPositionFromCanvasClick(event) {
  const candidates = getTeleportClickCandidates(event);
  const selected = candidates
    .filter((candidate) => Number.isFinite(Number(candidate.selectedGroundY)))
    .sort((a, b) => Number(b.selectedGroundY) - Number(a.selectedGroundY))[0];
  const hit = selected?.hit || getWorldPositionFromCanvasClick(event, { includeFallbackPlane: true });
  if (!hit) return null;
  const sampledGroundY = selected?.sampledGroundY ?? sampleCourseGroundYAt(hit.x, hit.z);
  const groundY = selected?.selectedGroundY ?? maxFinite(hit.y, sampledGroundY);
  state.lastTeleportClickDebug = {
    candidates,
    selected,
    hit,
    sampledGroundY,
    selectedGroundY: groundY,
    baseY: getTeleportBaseY(hit),
  };
  return {
    x: hit.x,
    y: getTeleportCenterYFromGroundHit(groundY),
    z: hit.z,
  };
}

function getTeleportClickCandidates(event) {
  const metrics = getGameCanvasMetrics();
  const cameraNode = getCurrentCameraNode();
  const camera = cameraNode?.getComponent?.(window.cc?.Camera);
  if (!metrics || !camera || !window.cc) return [];
  const canvasX = (event.clientX - metrics.rect.left) * metrics.scaleX;
  const canvasYTop = (event.clientY - metrics.rect.top) * metrics.scaleY;
  const canvasYBottom = metrics.height - canvasYTop;
  return [
    { label: "bottom", y: canvasYBottom },
    { label: "top", y: canvasYTop },
  ].flatMap((screen) =>
    makeCameraRayCandidates(camera, canvasX, screen.y).flatMap((candidate) => {
      const hit = raycastCourse(candidate.ray);
      if (!hit) return [];
      const sampledGroundY = sampleCourseGroundYAt(hit.x, hit.z);
      return [{
        label: `${screen.label}/${candidate.signature}`,
        hit,
        sampledGroundY,
        selectedGroundY: maxFinite(hit.y, sampledGroundY),
      }];
    }),
  );
}

function maxFinite(...values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length > 0 ? Math.max(...finite) : null;
}

export function getTeleportBaseY(referencePosition = null) {
  const mode = getCurrentMode();
  const visual = getLocalBallVisual();
  const currentY = Number(visual?.node?.worldPosition?.y);
  const values = [
    getCurrentSpawnPointY(mode),
    getNearestStartLocationY(mode, referencePosition),
    visual?.aimWidget?.node?.worldPosition?.y,
    visual?.aimWidget?.node?.position?.y,
  ];
  const y = values.find((value) => Number.isFinite(Number(value)));
  const resolved = Number.isFinite(Number(y)) ? Number(y) : currentY;
  if (Number.isFinite(currentY) && Number.isFinite(resolved)) {
    return Math.max(currentY, resolved);
  }
  return Number.isFinite(resolved) ? resolved : 1;
}

function getTeleportCenterYFromGroundHit(hitY) {
  const currentY = Number(getLocalBallVisual()?.node?.worldPosition?.y);
  const currentGroundY = getCurrentGroundY();
  const offset =
    Number.isFinite(currentY) && Number.isFinite(currentGroundY)
      ? Math.max(0.25, currentY - currentGroundY)
      : 0.5;
  const targetY = Number(hitY) + offset;
  return Number.isFinite(currentY) ? Math.max(currentY, targetY) : targetY;
}

function getCurrentGroundY() {
  const visual = getLocalBallVisual();
  const pos = visual?.node?.worldPosition;
  if (!pos) return null;
  return sampleCourseGroundYAt(pos.x, pos.z, pos.y + 5);
}

function sampleCourseGroundYAt(x, z, startY = null) {
  const cc = window.cc;
  if (!cc?.geometry?.Ray) return null;
  const physics = cc.PhysicsSystem?.instance;
  if (!physics) return null;
  const fromY = Number.isFinite(Number(startY))
    ? Math.max(Number(startY), getTeleportBaseY({ x, z }) + 20)
    : getTeleportBaseY({ x, z }) + 80;
  try {
    const ray = new cc.geometry.Ray(x, fromY, z, 0, -1, 0);
    if (physics.raycastClosest(ray, 8, 200)) {
      const y = physics.raycastClosestResult?.hitPoint?.y;
      return Number.isFinite(Number(y)) ? Number(y) : null;
    }
  } catch (_) {}
  return null;
}

function getCurrentSpawnPointY(mode) {
  try {
    const spawn = typeof mode?.GetSpawnPoint === "function" ? mode.GetSpawnPoint() : null;
    return spawn?.y;
  } catch (_) {
    return null;
  }
}

function getNearestStartLocationY(mode, referencePosition) {
  try {
    const currentHole = mode?.currentHole || mode?._currentHole;
    const starts =
      currentHole && typeof mode?.GetStartLocationsFromHole === "function"
        ? mode.GetStartLocationsFromHole(currentHole)
        : null;
    if (!Array.isArray(starts) || starts.length === 0) return null;
    const positions = starts
      .map((start) => start?.worldPosition || start?.node?.worldPosition || start)
      .filter((pos) => Number.isFinite(Number(pos?.y)));
    if (!referencePosition) return positions[0]?.y;
    positions.sort((a, b) => {
      const da = Math.hypot(Number(a.x) - referencePosition.x, Number(a.z) - referencePosition.z);
      const db = Math.hypot(Number(b.x) - referencePosition.x, Number(b.z) - referencePosition.z);
      return da - db;
    });
    return positions[0]?.y;
  } catch (_) {
    return null;
  }
}

function makeCameraRay(camera, x, y) {
  return makeCameraRayCandidates(camera, x, y)[0]?.ray || null;
}

function makeCameraRayCandidates(camera, x, y) {
  const cc = window.cc;
  const candidates = [];
  const addCandidate = (signature, invoke) => {
    const ray = cc.geometry?.Ray ? new cc.geometry.Ray() : {};
    try {
      const result = invoke(ray);
      const out = result || ray;
      if (hasFiniteRay(out)) candidates.push({ signature, ray: out });
    } catch (_) {}
  };
  addCandidate("x-y-ray", (ray) => camera.screenPointToRay?.(x, y, ray));
  addCandidate("ray-x-y", (ray) => camera.screenPointToRay?.(ray, x, y));
  if (candidates.length > 0) return candidates;
  return [];
}

function hasFiniteRay(ray) {
  const origin = ray?.o || ray?.origin;
  const dir = ray?.d || ray?.direction;
  return [origin?.x, origin?.y, origin?.z, dir?.x, dir?.y, dir?.z].every(Number.isFinite);
}

function raycastCourse(ray) {
  const physics = window.cc?.PhysicsSystem?.instance;
  if (!physics || !ray) return null;
  try {
    if (physics.raycastClosest(ray, 8)) {
      return cloneVec3Like(physics.raycastClosestResult?.hitPoint);
    }
  } catch (e) {
    log("[putt:WARN] raycast failed", e);
  }
  return null;
}

function resolveRayPosition(ray, options: any = {}) {
  if (!ray) return null;
  const hit = raycastCourse(ray);
  if (hit) {
    if (options.useTeleportCenterY) {
      return { ...hit, y: getTeleportCenterYFromGroundHit(hit.y) };
    }
    return hit;
  }
  return options.includeFallbackPlane ? intersectRayWithYPlane(ray, getTeleportBaseY()) : null;
}

function intersectRayWithYPlane(ray, y) {
  const origin = ray.o || ray.origin;
  const dir = ray.d || ray.direction;
  if (!origin || !dir || Math.abs(dir.y) < 0.00001) return null;
  const t = (y - origin.y) / dir.y;
  if (t < 0) return null;
  return {
    x: origin.x + dir.x * t,
    y,
    z: origin.z + dir.z * t,
  };
}

export function applyPlayerEffectLocally(targetId, effectId, instigatorId, targetData) {
  const mode = getCurrentMode();
  if (!mode) return false;
  try {
    const target = mode.getStatusEffectTargetById?.(targetId);
    if (!target) return false;
    const instigator = mode.getStatusEffectTargetById?.(instigatorId) || null;
    mode.statusEffectManager?.applyStatusEffectToTarget?.(
      { target, ...targetData },
      instigator,
      effectId,
    );
    return true;
  } catch (e) {
    log("[putt:WARN] failed to apply player effect locally", e);
    return false;
  }
}

export function applyStatusEffectStateLocally(effectId, instigatorId, targetData) {
  const mode = getCurrentMode();
  if (!mode) return false;
  try {
    const target = mode.getStatusEffectTargetById?.(targetData.targetId) || mode.statusEffects;
    const instigator = mode.getStatusEffectTargetById?.(instigatorId) || null;
    mode.statusEffectManager?.applyStatusEffectToTarget?.(
      { target, ...targetData },
      instigator,
      effectId,
    );
    const stateData = clonePlain(targetData);
    delete stateData.target;
    const effects = mode.getActiveStatusEffectStates?.() || mode._activeStatusEffects || [];
    const exists = effects.some(
      (effect) =>
        effect?.effect_id === effectId &&
        effect?.target_data?.id === stateData.id,
    );
    if (!exists) {
      effects.push({
        effect_id: effectId,
        start_time: Date.now() - state.serverTimeOffset,
        charges_left: 1,
        instigator_id: instigatorId,
        target_data: stateData,
      });
      if (typeof mode.setActiveStatusEffectStates === "function") {
        mode.setActiveStatusEffectStates(effects);
      } else {
        mode._activeStatusEffects = effects;
        mode.UpdateState?.();
      }
    }
    return true;
  } catch (e) {
    log("[putt:WARN] failed to apply status effect locally", e);
    return false;
  }
}

export function isDeletableNode(node) {
  if (!node || !node.name) return false;
  if (node.active === false || node.activeInHierarchy === false) return false;
  if (isUnsafeDeleteContainer(node)) return false;
  if (isDecorativeDeleteNode(node.name)) return false;
  if (isDeleteInstanceName(node.name)) {
    return true;
  }
  return hasDeletableComponent(node);
}

export function getDeleteCandidate(node) {
  if (!isDeletableNode(node)) return null;
  let current = node;
  let best = isDeleteInstanceName(current.name) ? current : null;
  for (let depth = 0; current?.parent && depth < 5; depth++) {
    const parent = current.parent;
    if (isUnsafeDeleteContainer(parent)) break;
    if (isDeleteInstanceName(parent.name)) {
      best = parent;
    }
    current = parent;
  }
  if (!best || isUnsafeDeleteContainer(best)) return null;
  if (best.active === false || best.activeInHierarchy === false) return null;
  const key = getPlaceableKey(best);
  if (key && state.deletedPlaceableKeys.has(key)) return null;
  return best;
}

export function getPlaceableKey(node) {
  return node?.position?.toString?.() || node?.worldPosition?.toString?.() || "";
}

function isDeleteInstanceName(name) {
  return /^(PinballBumper|Placeable_[A-Za-z0-9_]+)(-\d+)?$/i.test(name || "");
}

function isDecorativeDeleteNode(name) {
  return /_Shadow$|Shadow|_Ring$|_Green$|Visual|Mesh|Model|Sprite|^FX_|^PS_|Widget|Tooltip|Card|StatusEffect|^PowerUp_|^Powerup_/i.test(name || "");
}

function hasDeletableComponent(node) {
  const components = node?.components || node?._components || [];
  return components.some((component) => {
    const name =
      component?.constructor?.name ||
      component?.__classname__ ||
      component?.name ||
      "";
    return /Placeable/i.test(name);
  });
}

function isUnsafeDeleteContainer(node) {
  const childCount = node.children?.length || 0;
  if (childCount > 8) return true;
  if (/^(Scene|Canvas|Camera|Course|Level|Root|World|Objects?|Placeables?|Powerups?)$/i.test(node.name)) {
    return true;
  }
  if (/Container|Group|Holder|Root|Parent/i.test(node.name) && childCount > 0) {
    return true;
  }
  return false;
}

export { findComponent, findNodeByName, normalizeVec3, walkScene };

function findPlayerInCollection(collection, targetId) {
  if (!collection) return null;
  if (collection instanceof Map) return collection.get(targetId) || collection.get(Number(targetId)) || null;
  if (Array.isArray(collection)) {
    return collection.find((player) => String(player?.uid || player?.id) === targetId) || null;
  }
  if (typeof collection === "object") {
    return collection[targetId] ||
      Object.values(collection).find((player: any) => String(player?.uid || player?.id) === targetId) ||
      null;
  }
  return null;
}

function normalizeColor(color) {
  if (!color) return null;
  const r = Number(color.r);
  const g = Number(color.g);
  const b = Number(color.b);
  if (![r, g, b].every(Number.isFinite)) return null;
  const scale = Math.max(r, g, b) <= 1 ? 255 : 1;
  return {
    r: Math.round(r * scale),
    g: Math.round(g * scale),
    b: Math.round(b * scale),
  };
}
