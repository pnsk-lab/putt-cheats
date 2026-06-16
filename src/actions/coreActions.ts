import { PLAYER_PHASE } from "../constants.js";

export function createCoreActions(deps: any, actions: any) {
  return {
    syncFromGame() {
      deps.updatePlayerStatesFromGame();
      const local = deps.getLocalNetPlayer();
      const localId = deps.normalizePlayerId(local?.uid || local?.id);
      if (localId) deps.state.localUid = localId;
      if (localId && local?.state) {
        deps.state.players[localId] = deps.clonePlain(local.state);
        deps.state.lastKnownLocalState = deps.clonePlain(local.state);
        deps.markPlayableStateSeen(deps.state.lastKnownLocalState);
      }
      const gm = deps.getGameManager();
      const client = gm?._netGame?._client;
      deps.updateLocalIdentityFromGame(gm, client);
      deps.requestUserListSoon(0);
      return { uid: deps.state.localUid, group: deps.state.group, state: deps.state.lastKnownLocalState };
    },

    showUI() {
      deps.state.uiReady = false;
      return deps.forceCreateUI();
    },

    debugSnapshot() {
      actions.syncFromGame();
      const gm = deps.getGameManager();
      const mode = deps.getCurrentMode();
      const local = deps.getLocalNetPlayer();
      const visual = local?.localState?.visual;
      const players = deps.getKnownPlayers().map((player) => ({
        id: player.id,
        name: deps.state.playerNames[player.id] || null,
        phase: player.state?.phase,
        hole: player.state?.hole,
        strokes: player.state?.strokes,
        cards: Array.isArray(player.state?.cards_in_hand) ? player.state.cards_in_hand.slice() : [],
        activeStatusEffects: Array.isArray(player.state?.active_status_effects)
          ? player.state.active_status_effects.map((effect) => ({
              effectId: effect.effect_id ?? effect.effectId,
              chargesLeft: effect.charges_left ?? effect.chargesLeft,
              targetData: effect.target_data ?? effect.targetData,
            }))
          : [],
      }));
      return {
        localUid: deps.state.localUid,
        group: deps.state.group,
        queue: deps.state.powerupQueue.slice(),
        lastKnownRoundHole: deps.state.lastKnownRoundHole,
        lastKnownRoundState: deps.state.lastKnownRoundState,
        deletedPlaceableKeys: Array.from(deps.state.deletedPlaceableKeys),
        spawnedBumpers: deps.state.spawnedBumpers.slice(),
        game: {
          hasGameManager: !!gm,
          hasMode: !!mode,
          gameState: mode?.gameState ?? mode?._currentState,
          currentHole: mode?.currentHole ?? mode?._currentHole,
          maxHoles: mode?.maxHoles ?? mode?.holesPerGame,
          isPrimary: mode?.IsPrimaryUser?.() ?? gm?._netGame?.isPrimaryUser?.(),
        },
        local: local
          ? {
              uid: local.uid || local.id,
              state: deps.clonePlain(local.state),
              visual: visual
                ? {
                    state: visual.state,
                    controlsEnabled: visual.controlsEnabled,
                    inHole: visual.inHole,
                    inHoleName: visual.inHoleName,
                    hasReversePath: visual.hasReversePath?.(),
                    rewindActive: visual.rewindActive ?? visual._rewindActive,
                    worldPosition: deps.clonePlain(visual.node?.worldPosition),
                  }
                : null,
            }
          : null,
        players,
        hasLocalCardState: deps.hasLocalCardState(),
        canApplyRewindEffect: deps.state.localUid
          ? deps.canApplyRewindToPlayer(deps.state.localUid)
          : { ok: false, reason: "local player is not ready" },
        teleportBaseY: deps.getTeleportBaseY(),
        lastTeleportClickDebug: deps.state.lastTeleportClickDebug || null,
      };
    },

    repairLocalState() {
      actions.syncFromGame();
      const local = deps.getLocalNetPlayer();
      if (!deps.state.localUid || !local?.state) {
        alert("Local player is not ready.");
        return false;
      }

      const recoveredHoleState = deps.recoverLocalStateForCurrentHole({ force: false });
      const clearedRuntimeState = deps.clearLocalPlayerState({ silent: true });
      const refreshedLocal = deps.getLocalNetPlayer();

      if (refreshedLocal?.state && deps.state.localUid) {
        if (Number(refreshedLocal.state.phase) === PLAYER_PHASE.Simulating && deps.isLocalBallNearlyStopped()) {
          deps.forceLocalBallStopped("manual resync");
        } else {
          deps.setLocalState(deps.clonePlain(refreshedLocal.state));
        }
      }

      deps.refreshPlayerItemUI({ skipSync: true });
      deps.refreshPlayerEffectUI();
      deps.updateStatus(recoveredHoleState ? "Resynced state + hole" : "Resynced state");
      deps.log("[putt:INFO] repaired local state", {
        localId: deps.state.localUid,
        recoveredHoleState,
        clearedRuntimeState,
      });
      return true;
    },

    invokeModule(id) {
      return deps.moduleManager.invoke(String(id || ""));
    },

    getModules() {
      return deps.moduleManager.getAll();
    },
  };
}

