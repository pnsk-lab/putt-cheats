import { GAME_CMD } from "../constants.js";

export function createTeleportActions(deps: any) {
  return {
    teleport(x, y, z) {
      if (!deps.state.localUid || !deps.state.lastKnownLocalState) {
        return alert("Wait for game start.");
      }
      const pos = { x: parseFloat(x), y: parseFloat(y), z: parseFloat(z) };
      if (![pos.x, pos.y, pos.z].every(Number.isFinite)) {
        return alert("Invalid coordinates.");
      }

      const visual = deps.getLocalBallVisual();
      if (visual?.node) {
        try {
          visual.node.setWorldPosition(pos.x, pos.y, pos.z);
          visual.rigidbody?.clearVelocity?.();
          visual.rigidbody?.clearForces?.();
        } catch (e) {
          deps.log("[putt:WARN] failed to snap local ball", e);
        }
      } else {
        const ball = deps.findNodeByName(window.cc?.director?.getScene(), "Ball_Local");
        if (ball) ball.setWorldPosition(pos.x, pos.y, pos.z);
      }

      deps.patchLocalState({ pos, vel: { x: 0, y: 0, z: 0 } });
      deps.sendGameCmd(GAME_CMD.BallCorrection, {
        id: deps.state.localUid,
        pos,
        vel: { x: 0, y: 0, z: 0 },
        time: deps.getServerTimeNow(),
      });
      deps.sendGameCmd(GAME_CMD.BallStopped, { id: deps.state.localUid, pos });
    },

    armTeleportFill(callback) {
      return deps.armCanvasClick("Move cursor and click teleport target", (pos) => {
        if (typeof callback === "function") callback(pos);
      }, null, deps.getTeleportPositionFromCanvasClick);
    },
  };
}

