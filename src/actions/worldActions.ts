import { GAME_CMD } from "../constants.js";
import { setRemoveFatassesEnabled, isRemoveFatassesEnabled } from "../game/cocos.js";

export function createWorldActions(deps: any, actions: any) {
  return {
    putBumperAt(pos) {
      actions.syncFromGame();
      if (!deps.canSend()) return alert("Wait for socket.");
      const effectId = deps.getSpawnBumperEffectId();
      if (effectId === null || effectId === undefined) {
        return alert("Spawn bumper status effect id not found yet. Wait for the game to finish loading.");
      }
      const mode = deps.getCurrentMode();
      const targetId = mode?.uid;
      if (!targetId) return alert("Game mode target is not ready.");
      const position = deps.normalizeVec3(pos);
      if (!position) return alert("Invalid bumper position.");
      const targetData = {
        targetId,
        id: `putt-bumper-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        position,
        dir: { x: 0, y: 0, z: 1 },
        up: { x: 0, y: 1, z: 0 },
      };
      deps.sendGameCmd(GAME_CMD.ApplyStatusEffectToPlayer, {
        id: deps.state.localUid || targetId,
        effectId,
        targetData,
      });
      deps.recordSpawnedBumper(targetData);
      deps.applyStatusEffectStateLocally(effectId, deps.state.localUid || targetId, targetData);
      deps.log("[putt:INFO] put bumper sent", { effectId, targetData });
      return true;
    },

    armPutBumper() {
      deps.state.putBumperArmed = true;
      return deps.armCanvasClick("Move cursor and click course", (pos) => {
        if (!deps.state.putBumperArmed) return;
        deps.state.putBumperArmed = false;
        actions.putBumperAt(pos);
      }, () => {
        deps.state.putBumperArmed = false;
      });
    },

    deleteNearest() {
      if (!deps.canSend()) return alert("Wait for socket.");
      const scene = window.cc?.director?.getScene();
      if (!scene || !window.cc) return alert("Scene is not ready.");
      const localBall = deps.getLocalBallVisual()?.node || deps.findNodeByName(scene, "Ball_Local");
      const origin = localBall?.worldPosition || deps.getCurrentCameraNode()?.worldPosition;
      if (!origin) return alert("Local ball/camera not found.");
      let nearest = null;
      let minDist = Infinity;
      const seen = new Set();
      const addedBumper = deps.getNearestAddedBumper(origin);
      if (addedBumper) {
        nearest = addedBumper;
        minDist = addedBumper.dist;
      }
      deps.walkScene(scene, (node) => {
        const candidate = deps.getDeleteCandidate(node);
        if (candidate && !seen.has(candidate)) {
          seen.add(candidate);
          const dist = deps.distance3(candidate.worldPosition, origin);
          if (dist < minDist) {
            minDist = dist;
            nearest = { type: "node", name: candidate.name, key: deps.getPlaceableKey(candidate), node: candidate };
          }
        }
        return false;
      });
      if (!nearest) return deps.log("[putt:WARN] no deletable object found");
      const key = nearest.key;
      if (!key) return deps.log("[putt:WARN] nearest deletable has no key", nearest.name, nearest.node || nearest);
      deps.sendGameCmd(GAME_CMD.MarkPlaceableDestroyed, { key });
      try {
        if (nearest.node) nearest.node.active = false;
      } catch (e) {
        deps.log("[putt:WARN] failed to delete nearest", e);
      }
      deps.state.deletedPlaceableKeys.add(key);
      deps.state.spawnedBumpers = deps.state.spawnedBumpers.filter((bumper) => bumper.key !== key);
      deps.removeSpawnedBumperEffectState(key);
      deps.log("[putt:INFO] deleted nearest", nearest.name, key, minDist);
    },

    listDeletables() {
      const scene = window.cc?.director?.getScene();
      const out = [];
      const seen = new Set();
      deps.walkScene(scene, (node) => {
        const candidate = deps.getDeleteCandidate(node);
        if (candidate && !seen.has(candidate)) {
          seen.add(candidate);
          const key = deps.getPlaceableKey(candidate);
          out.push({
            name: candidate.name,
            node: candidate,
            key,
            pos: candidate.position?.toString?.(),
            worldPos: candidate.worldPosition?.toString?.(),
            children: candidate.children?.length || 0,
          });
        }
        return false;
      });
      deps.state.spawnedBumpers.forEach((bumper) => {
        if (!bumper?.key || deps.state.deletedPlaceableKeys.has(bumper.key)) return;
        out.push({
          name: "SpawnedBumper",
          key: bumper.key,
          pos: deps.formatPlaceablePositionKey(bumper.position),
          worldPos: deps.formatPlaceablePositionKey(bumper.position),
          children: 0,
          virtual: true,
        });
      });
      deps.log("[putt:INFO] deletables", out);
      return out;
    },

    setRemoveFatasses(enabled = true) {
      const count = setRemoveFatassesEnabled(Boolean(enabled));
      deps.updateStatus(`${Boolean(enabled) ? "Removed" : "Restored"} characters: ${count}`);
      return count;
    },

    toggleRemoveFatasses() {
      return actions.setRemoveFatasses(!isRemoveFatassesEnabled());
    },
  };
}

