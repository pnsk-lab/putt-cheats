import { GAME_CMD } from "../constants.js";

export function createPlayerActions(deps: any, actions: any) {
  return {
    removePlayerItem(playerId, powerupId) {
      actions.syncFromGame();
      if (!deps.canSend()) return alert("Wait for socket.");
      const targetId = String(playerId || "");
      if (!targetId || !powerupId) return alert("Select player and power up.");
      if (targetId === deps.state.localUid) return alert("Local player is excluded from remove item.");
      const cards = Array.isArray(deps.state.players[targetId]?.cards_in_hand)
        ? deps.state.players[targetId].cards_in_hand.slice()
        : [];
      const cardIds =
        powerupId === "__all__"
          ? cards
          : [Number.parseInt(powerupId, 10)].filter(Number.isFinite);
      if (cardIds.length === 0) return alert("Selected player has no powerups.");
      const effectId = deps.getStealEffectId();
      if (effectId === null || effectId === undefined) {
        return alert("Steal status effect id not found yet. Wait for the game to finish loading.");
      }
      cardIds.forEach((cardId) => {
        deps.sendGameCmd(GAME_CMD.ApplyStatusEffectToPlayer, {
          id: targetId,
          effectId,
          targetData: { targetId, powerup_to_steal_id: cardId },
        });
        deps.removeCachedPlayerCard(targetId, cardId);
      });
      deps.refreshPlayerItemUI({ skipSync: true });
      deps.log("[putt:INFO] remove player item sent", { targetId, cardIds, effectId });
      return true;
    },

    applyPlayerEffect(playerId, effectName) {
      actions.syncFromGame();
      if (!deps.canSend()) return alert("Wait for socket.");
      const targetId = String(playerId || "");
      if (!targetId || !effectName) return alert("Select player and effect.");
      if (deps.isRewindName(effectName)) {
        const rewind = deps.canApplyRewindToPlayer(targetId);
        if (!rewind.ok) return alert(`Rewind is not safe now: ${rewind.reason}.`);
      }
      const effectId = deps.getPlayerEffectId(effectName);
      if (effectId === null || effectId === undefined) {
        return alert(`Effect id not found yet: ${effectName}. Wait for the game to finish loading.`);
      }
      const targetData = { targetId };
      const instigatorId = deps.state.localUid || targetId;
      deps.sendGameCmd(GAME_CMD.ApplyStatusEffectToPlayer, {
        id: instigatorId,
        effectId,
        targetData,
      });
      deps.applyPlayerEffectLocally(targetId, effectId, instigatorId, targetData);
      deps.log("[putt:INFO] player effect sent", { targetId, effectName, effectId, targetData });
      return true;
    },

    clearPlayerEffectState() {
      return deps.clearLocalPlayerState();
    },
  };
}

