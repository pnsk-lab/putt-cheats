import { decode, encode } from "@msgpack/msgpack";
import { GAME_CMD, GAME_STATE, OPCODES, PLAYER_EFFECTS, PLAYER_PHASE } from "./constants.js";
import {
  detectPlayerEffectIds,
  getPlayerEffectId,
  getSpawnBumperEffectId,
  getStealEffectId,
} from "./features/statusEffects.js";
import {
  applyPlayerEffectLocally,
  applyStatusEffectStateLocally,
  findComponent,
  findNodeByName,
  getCurrentCameraNode,
  getCurrentMode,
  getDeleteCandidate,
  getGameManager,
  getGoalPosition,
  getLocalBallVisual,
  getLocalNetPlayer,
  getNetPlayerById,
  getPlaceableKey,
  getTeleportBaseY,
  getTeleportPositionFromCanvasClick,
  getWorldPositionFromCanvasClick,
  normalizeVec3,
  notifyPlayerStateUpdated,
  walkScene,
} from "./engine.js";
import { state, log } from "./state.js";
import {
  configureTrajectoryOverlay,
  recordTrajectory,
  setTrajectoriesEnabled,
} from "./trajectoryOverlay.js";
import {
  configureUI,
  createUI,
  forceCreateUI,
  refreshModuleBoard,
  toggleFormPanel,
  isPanelOpen,
  toggleUI,
  updateStatus,
} from "./ui.js";
import { clonePlain, escapeAttr, escapeHtml } from "./utils.js";
import { keybindManager } from "./keybind/KeybindManager.js";
import { moduleManager } from "./modules/ModuleManager.js";
import { registerBuiltinModules } from "./modules/registerBuiltinModules.js";
import { installSystemHook } from "./game/cocosBoot.js";
import { createPuttActions } from "./actions/createPuttActions.js";

let powerupDetectionTimer = null;
let uiObserver = null;
let playerUiRefreshTimer = null;
let refreshingPlayerUi = false;
let activeCanvasArm = null;
let lastUserListRequestedAt = 0;
let localHealthTimer = null;
let localStillSince = 0;
let lastTimerWarningStopAt = 0;

function decodeOpPack(data) {
  const view =
    data instanceof Uint8Array
      ? data
      : new Uint8Array(
        data instanceof ArrayBuffer ? data : data.buffer,
        data.byteOffset || 0,
        data.byteLength || data.length,
      );
  if (view.length < 2) return null;
  try {
    return {
      opcode: view[0],
      status: view[1],
      data: decode(view.subarray(2)),
    };
  } catch (_) {
    return null;
  }
}

function encodeOpPack(opcode, data, status = 0) {
  const payload = { ...data, _st: Date.now() - state.serverTimeOffset };
  const encoded = encode(payload);
  const frame = new Uint8Array(encoded.length + 2);
  frame[0] = opcode & 0xff;
  frame[1] = status & 0xff;
  frame.set(encoded, 2);
  return frame;
}

function canSend() {
  return state.activeSocket && state.activeSocket.readyState === WebSocket.OPEN;
}

function sendFrame(opcode, data, status = 0) {
  if (!canSend()) {
    log("[putt:WARN] socket is not ready");
    return false;
  }
  state.activeSocket.send(encodeOpPack(opcode, data, status));
  return true;
}

function sendGameCmd(cmd, payload) {
  const envelope: any = { cmd, data: payload };
  if (state.group) envelope.group = state.group;
  return sendFrame(OPCODES.GameEventSend, envelope);
}

function getServerTimeNow() {
  return Date.now() - state.serverTimeOffset;
}

function requestUserListSoon(delay = 250) {
  const now = Date.now();
  if (now - lastUserListRequestedAt < 2000) return;
  lastUserListRequestedAt = now;
  setTimeout(() => {
    if (canSend()) sendFrame(OPCODES.CmdUserList, {});
  }, delay);
}

function setLocalState(nextState) {
  if (!state.localUid) return false;
  const merged = clonePlain(nextState);
  state.players[state.localUid] = Object.assign(
    {},
    state.players[state.localUid] || {},
    merged,
  );
  state.lastKnownLocalState = state.players[state.localUid];
  const local = getLocalNetPlayer();
  if (normalizePlayerId(local?.uid || local?.id) === state.localUid) {
    local.state = state.lastKnownLocalState;
    if (typeof local.stateUpdated === "function") {
      local.stateUpdated();
      return true;
    } else {
      notifyPlayerStateUpdated(local);
    }
  }
  return sendFrame(OPCODES.PlayerSetState, {
    id: state.localUid,
    state: state.lastKnownLocalState,
  });
}

function getLocalCards() {
  const liveState = getLocalNetPlayer()?.state || state.lastKnownLocalState;
  return Array.isArray(liveState?.cards_in_hand)
    ? liveState.cards_in_hand.slice()
    : [];
}

function setLocalCards(cards) {
  return patchLocalState({ cards_in_hand: cards });
}

function patchLocalState(patch) {
  const local = getLocalNetPlayer();
  const base =
    local?.state ||
    state.lastKnownLocalState ||
    (state.localUid ? state.players[state.localUid] : null);
  if (!state.localUid || !base) {
    log("[putt:WARN] local state is not ready");
    return false;
  }
  return setLocalState(Object.assign(clonePlain(base), patch));
}

function handlePacket(direction, opcode, data) {
  if (!data) return;
  updateGroupFromPacket(data);
  updatePlayerNamesFromObject(data);
  updateSpawnedBumpersFromPacket(data);

  if (opcode === OPCODES.Pong && data.time) {
    state.serverTimeOffset =
      Date.now() - data.time - (Date.now() - state.lastPingTime) / 2;
  }

  if (direction === "out" && opcode === OPCODES.CmdAuthenticate && !state.requestedUserList) {
    state.requestedUserList = true;
    requestUserListSoon();
  }

  if (opcode === OPCODES.EvtUserList && Array.isArray(data.users)) {
    data.users.forEach((user) => updatePlayerName(user.id, user));
    schedulePlayerUiRefresh();
  }
  if (
    (opcode === OPCODES.EvtUserJoined || opcode === OPCODES.EvtUserUpdated) &&
    data.user
  ) {
    updatePlayerName(data.user.id, data.user);
    schedulePlayerUiRefresh();
  }
  if (opcode === OPCODES.EvtGroupListUsers && Array.isArray(data.users)) {
    data.users.forEach((id) => {
      const normalized = normalizePlayerId(id);
      if (normalized && !state.playerNames[normalized]) state.playerNames[normalized] = normalized;
    });
  }

  if (direction === "out" && opcode === OPCODES.PlayerSetState && data.id) {
    const id = normalizePlayerId(data.id);
    state.localUid = id;
    state.lastKnownLocalState = clonePlain(data.state);
    markPlayableStateSeen(state.lastKnownLocalState);
    const phase = Number(state.lastKnownLocalState?.phase);
    if (
      phase === PLAYER_PHASE.HoleDone ||
      phase === PLAYER_PHASE.GameOver ||
      phase === PLAYER_PHASE.CourseSelect
    ) {
      clearPowerupQueue();
    }
    state.players[id] = Object.assign(
      {},
      state.players[id] || {},
      state.lastKnownLocalState,
    );
    const local = getLocalNetPlayer();
    if (normalizePlayerId(local?.uid || local?.id) === id) local.state = state.lastKnownLocalState;
    schedulePlayerUiRefresh();
  }

  if (
    direction === "out" &&
    opcode === OPCODES.GameEventSend &&
    data?.data?.id &&
    !state.localUid
  ) {
    state.localUid = normalizePlayerId(data.data.id);
  }

  const updatePlayer = (id, playerState) => {
    id = normalizePlayerId(id);
    if (!id || !playerState) return;
    state.players[id] = Object.assign(
      {},
      state.players[id] || {},
      playerState,
    );
    if (id === state.localUid) {
      state.lastKnownLocalState = clonePlain(state.players[id]);
      markPlayableStateSeen(state.lastKnownLocalState);
      const local = getLocalNetPlayer();
      if (normalizePlayerId(local?.uid || local?.id) === id) local.state = state.lastKnownLocalState;
    } else {
      recordTrajectory(id, state.players[id]);
    }
    schedulePlayerUiRefresh();
  };

  if (opcode === OPCODES.PlayerStateRecv && data.id) {
    updatePlayer(data.id, data.state);
  }
  if (opcode === OPCODES.PlayerBulkStateRecv && data.players) {
    for (const [id, playerState] of Object.entries(data.players)) {
      updatePlayer(id, playerState);
    }
  }
  if (opcode === OPCODES.GameEventRecv && data.cmd === GAME_CMD.StartNewHole) {
    state.deletedPlaceableKeys.clear();
    state.spawnedBumpers = [];
    state.trajectories = {};
    clearPowerupQueue();
    scrubLocalRuntimeArtifacts({ clearRewind: true, stopTimerWarnings: true });
    recoverLocalStateForCurrentHole({ force: true });
    setTimeout(() => recoverLocalStateForCurrentHole({ force: true }), 100);
  }
  if (
    opcode === OPCODES.GameEventRecv &&
    data.cmd === GAME_CMD.BallCorrection &&
    data.data?.id &&
    data.data.id !== state.localUid
  ) {
    recordTrajectory(data.data.id, data.data);
  }
  if (
    opcode === OPCODES.GameEventRecv &&
    data.cmd === GAME_CMD.MarkPlaceableDestroyed &&
    data.data?.key
  ) {
    state.deletedPlaceableKeys.add(data.data.key);
  }
  if (
    (opcode === OPCODES.EvtGameUpdated ||
      opcode === OPCODES.GameStateRecv ||
      opcode === OPCODES.EvtGameState) &&
    (data.state || data.game?.state)
  ) {
    const gameState = data.state || data.game.state;
    syncRoundState(gameState);
    if (gameState.participants) {
      gameState.participants.forEach((p) => {
        updatePlayerName(p.id, p);
        updatePlayer(p.id, p.state);
      });
    }
  }
  maybeRecoverLocalJoinState();
  schedulePlayerUiRefresh();
}

function syncRoundState(gameState) {
  if (!gameState || typeof gameState !== "object") return;
  const currentHole = Number(gameState.current_hole ?? gameState.currentHole);
  const roundState = Number(gameState.round_state ?? gameState.roundState);
  if (Number.isFinite(currentHole) && currentHole !== state.lastKnownRoundHole) {
    state.deletedPlaceableKeys.clear();
    state.spawnedBumpers = [];
    state.trajectories = {};
    clearPowerupQueue();
    scrubLocalRuntimeArtifacts({ clearRewind: true, stopTimerWarnings: true });
    state.lastKnownRoundHole = currentHole;
    recoverLocalStateForCurrentHole({ force: true });
  }
  if (Number.isFinite(roundState)) {
    if (state.lastKnownRoundState !== null && state.lastKnownRoundState !== roundState) {
      clearPowerupQueue();
      scrubLocalRuntimeArtifacts({ clearRewind: true, stopTimerWarnings: roundState !== GAME_STATE.Play });
      if (roundState === GAME_STATE.Play) recoverLocalStateForCurrentHole({ force: true });
    }
    state.lastKnownRoundState = roundState;
  }
}

function syncRoundStateFromMode() {
  const mode = getCurrentMode();
  if (!mode) return;
  syncRoundState({
    current_hole: mode.currentHole ?? mode._currentHole,
    round_state: mode.gameState ?? mode._currentState,
  });
}

function schedulePlayerUiRefresh() {
  if (playerUiRefreshTimer) return;
  playerUiRefreshTimer = setTimeout(() => {
    playerUiRefreshTimer = null;
    if (isSelectBeingEdited()) {
      playerUiRefreshTimer = setTimeout(() => {
        playerUiRefreshTimer = null;
        schedulePlayerUiRefresh();
      }, 500);
      return;
    }
    refreshPlayerItemUI();
    refreshPlayerEffectUI();
    updateStatus();
  }, 100);
}

function updateGroupFromPacket(data) {
  const group = normalizeGroupId(data.group || data.game?.group || data.state?.group);
  if (group) state.group = group;
}

function normalizeGroupId(group) {
  if (!group) return null;
  if (typeof group === "string") return group;
  if (typeof group === "number") return String(group);
  return group.id || group.group_id || group.groupId || group.channel_id || group.channelId || null;
}

function updatePlayerNamesFromObject(root) {
  if (!root || typeof root !== "object") return;
  if (root.user) updatePlayerName(root.user.id || root.user.uid, root.user);
  if (Array.isArray(root.users)) {
    root.users.forEach((user) => updatePlayerName(user.id || user.uid, user));
  } else if (root.users instanceof Map) {
    root.users.forEach((user, id) => updatePlayerName(id || user?.id || user?.uid, user));
  }
  const participants =
    root.participants ||
    root.state?.participants ||
    root.game?.participants ||
    root.game?.state?.participants;
  if (Array.isArray(participants)) {
    participants.forEach((participant) => updatePlayerName(participant.id || participant.uid, participant));
  }
  const players = root.players || root.state?.players || root.game?.players;
  if (players instanceof Map) {
    players.forEach((player, id) => updatePlayerName(id || player?.id || player?.uid, player));
  } else if (Array.isArray(players)) {
    players.forEach((player) => updatePlayerName(player?.id || player?.uid, player));
  } else if (players && typeof players === "object") {
    Object.entries(players).forEach(([id, player]) => updatePlayerName(id, player));
  }
  scanPlayerNames(root);
}

function updatePlayerName(id, source) {
  id = normalizePlayerId(id);
  if (!id || !source) return;
  const name =
    source.displayName ||
    source.display_name ||
    source.globalName ||
    source.global_name ||
    source.username ||
    source.name ||
    source.nick ||
    source.user?.global_name ||
    source.user?.globalName ||
    source.user?.username ||
    source.profile?.username ||
    source.profile?.name;
  if (name) state.playerNames[id] = String(name);
}

function scanPlayerNames(root, maxDepth = 5) {
  const seen = new Set();
  const visit = (value, depth) => {
    if (!value || typeof value !== "object" || depth > maxDepth || seen.has(value)) return;
    seen.add(value);
    const id = normalizePlayerId(
      value.uid ||
        value.id ||
        value.userId ||
        value.user_id ||
        value.playerId ||
        value.player_id ||
        value.discordId ||
        value.discord_id,
    );
    if (id) updatePlayerName(id, value);
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    for (const key of Object.keys(value)) {
      if (/node|scene|parent|children|prefab|mesh|material|texture|rigidbody/i.test(key) && depth > 1) continue;
      visit(value[key], depth + 1);
    }
  };
  visit(root, 0);
}

function normalizePlayerId(id) {
  return id === null || id === undefined || id === "" ? null : String(id);
}

function updateLocalIdentityFromGame(gm = getGameManager(), client = gm?._netGame?._client) {
  const mode = getCurrentMode();
  const local =
    getLocalNetPlayer() ||
    mode?.localGolfPlayer?.netPlayer ||
    mode?.localPlayer?.netPlayer;
  const uid =
    local?.uid ||
    local?.id ||
    mode?.localUid ||
    mode?.localUserId ||
    mode?.localPlayerId ||
    client?.uid ||
    client?.id ||
    client?.userId ||
    client?.playerId ||
    client?._uid ||
    client?._id;
  if (uid) state.localUid = normalizePlayerId(uid);
  if (uid) {
    updatePlayerName(uid, local);
    updatePlayerName(uid, client?.user || client?._user || client?.currentUser || client);
  }

  const group = normalizeGroupId(
    client?.group ||
      client?._group ||
      client?.currentGroup ||
      gm?._netGame?.group ||
      gm?._netGame?._group ||
      mode?.group,
  );
  if (group) state.group = group;

  const participants =
    mode?.players ||
    mode?._players ||
    gm?._netGame?.players ||
    gm?._netGame?._players ||
    client?.players;
  if (participants) updatePlayerNamesFromObject({ players: participants });
  if (gm?._netGame?.users) updatePlayerNamesFromObject({ users: gm._netGame.users });
  scanPlayerNames(gm, 4);
  scanPlayerNames(client, 5);
  scanPlayerNames(mode, 4);
}

function updatePlayerStatesFromGame(gm = getGameManager()) {
  updateLocalIdentityFromGame(gm, gm?._netGame?._client);
  syncRoundStateFromMode();
  syncSpawnedBumpersFromGame();
  const mode = getCurrentMode();
  const collections = [
    mode?.players,
    mode?._players,
    gm?._netGame?.players,
    gm?._netGame?._players,
    gm?._netGame?._client?.players,
  ];
  collections.forEach((collection) => {
    forEachPlayerInCollection(collection, (player, id) => {
      const playerId = normalizePlayerId(id || player?.uid || player?.id);
      if (!playerId || !player?.state) return;
      state.players[playerId] = Object.assign(
        {},
        state.players[playerId] || {},
        clonePlain(player.state),
      );
      if (playerId === state.localUid) {
        state.lastKnownLocalState = clonePlain(state.players[playerId]);
        markPlayableStateSeen(state.lastKnownLocalState);
      }
    });
  });
}

function forEachPlayerInCollection(collection, callback) {
  if (!collection) return;
  if (collection instanceof Map) {
    collection.forEach((player, id) => callback(player, id));
  } else if (Array.isArray(collection)) {
    collection.forEach((player) => callback(player, player?.uid || player?.id));
  } else if (typeof collection === "object") {
    Object.entries(collection).forEach(([id, player]) => callback(player, id));
  }
}

function maybeRecoverLocalJoinState() {
  if (!state.lastSocketOpenedAt || Date.now() - state.lastSocketOpenedAt > 15000) return false;
  if (state.seenPlayableStateSinceSocketOpen) return false;
  if (Date.now() - state.lastJoinRecoveryAt < 5000) return false;
  const local = getLocalNetPlayer();
  if (!local?.state || !local.local) return false;
  const mode = getCurrentMode();
  const currentHole = Number(mode?.currentHole || mode?._currentHole || 0);
  const maxHoles = Number(mode?.maxHoles || mode?.holesPerGame || 0);
  if (maxHoles > 0 && currentHole > maxHoles) return false;
  const phase = Number(local.state.phase);
  if (phase !== PLAYER_PHASE.HoleDone && phase !== PLAYER_PHASE.GameOver) return false;

  const spawn = typeof mode?.GetSpawnPoint === "function" ? mode.GetSpawnPoint() : null;
  local.state.phase = PLAYER_PHASE.StartHole;
  local.state.strokes = 0;
  if (currentHole > 0) local.state.hole = currentHole;
  if (spawn) local.state.pos = spawn;
  local.state.vel = { x: 0, y: 0, z: 0 };
  local.state.active_status_effects = [];
  local.state.timeouts = 0;
  state.lastJoinRecoveryAt = Date.now();
  state.localUid = normalizePlayerId(local.uid || local.id) || state.localUid;
  state.players[state.localUid] = clonePlain(local.state);
  state.lastKnownLocalState = clonePlain(local.state);
  try {
    if (typeof local.stateUpdated === "function") local.stateUpdated();
    else notifyPlayerStateUpdated(local);
  } catch (e) {
    log("[putt:WARN] failed to recover local join state", e);
  }
  return true;
}

function recoverLocalStateForCurrentHole({ force = false } = {}) {
  const local = getLocalNetPlayer();
  const mode = getCurrentMode();
  if (!local?.local || !local.state || !mode) return false;
  const currentHole = Number(mode.currentHole || mode._currentHole || 0);
  if (!currentHole) return false;
  const phase = Number(local.state.phase);
  const terminalOrWrongHole =
    phase === PLAYER_PHASE.HoleDone ||
    phase === PLAYER_PHASE.GameOver ||
    Number(local.state.hole) !== currentHole;
  if (!force && !terminalOrWrongHole) return false;
  if (!terminalOrWrongHole && phase !== PLAYER_PHASE.StartHole) return false;
  const spawn = typeof mode.GetSpawnPoint === "function" ? mode.GetSpawnPoint() : null;
  local.state.hole = currentHole;
  local.state.phase = PLAYER_PHASE.StartHole;
  local.state.strokes = 0;
  local.state.vel = { x: 0, y: 0, z: 0 };
  local.state.timeouts = 0;
  local.state.active_status_effects = [];
  if (spawn) local.state.pos = spawn;
  state.localUid = normalizePlayerId(local.uid || local.id) || state.localUid;
  state.players[state.localUid] = clonePlain(local.state);
  state.lastKnownLocalState = clonePlain(local.state);
  try {
    if (typeof local.stateUpdated === "function") local.stateUpdated();
    else notifyPlayerStateUpdated(local);
    return true;
  } catch (e) {
    log("[putt:WARN] failed to recover current hole state", e);
    return false;
  }
}

function markPlayableStateSeen(playerState) {
  const phase = Number(playerState?.phase);
  if (
    phase === PLAYER_PHASE.StartHole ||
    phase === PLAYER_PHASE.WaitingOnInput ||
    phase === PLAYER_PHASE.InputReceived ||
    phase === PLAYER_PHASE.Simulating ||
    phase === PLAYER_PHASE.StrokeDone
  ) {
    state.seenPlayableStateSinceSocketOpen = true;
  }
}

function isRewindName(name) {
  return String(name || "").toLowerCase() === "rewind";
}

function canApplyRewindToPlayer(playerId) {
  const player = getNetPlayerById(playerId);
  const visual = player?.localState?.visual;
  const phase = Number(player?.state?.phase ?? state.players[playerId]?.phase);
  if (!player || !visual) return { ok: false, reason: "target visual is not ready" };
  if (phase === PLAYER_PHASE.HoleDone || phase === PLAYER_PHASE.GameOver || phase === PLAYER_PHASE.CourseSelect) {
    return { ok: false, reason: "target is not playing this hole" };
  }
  if (visual.inHole) return { ok: false, reason: "target is already in hole" };
  if (typeof visual.hasReversePath !== "function" || !visual.hasReversePath()) {
    return { ok: false, reason: "target has no rewind path" };
  }
  const rewindEffectId = getPlayerEffectId("Rewind");
  const activeEffects = Array.isArray(player.state?.active_status_effects)
    ? player.state.active_status_effects
    : [];
  if (activeEffects.some((effect) => Number(effect?.effect_id) === Number(rewindEffectId))) {
    return { ok: false, reason: "rewind is already active" };
  }
  return { ok: true };
}

function getPlayerActiveStatusEffects(playerId) {
  const livePlayer = getNetPlayerById(playerId);
  const effects =
    livePlayer?.state?.active_status_effects ||
    state.players[playerId]?.active_status_effects ||
    [];
  return Array.isArray(effects) ? effects : [];
}

function getEffectLabelById(effectId) {
  const id = Number(effectId);
  const found = Object.entries(state.playerEffectIds).find(([, mappedId]) => Number(mappedId) === id);
  if (found) return found[0];
  if (Number(state.spawnBumperEffectId) === id) return "SpawnBumper";
  if (Number(state.stealEffectId) === id) return "StealPowerUp";
  return `Effect_${effectId}`;
}

function getStatusEffectId(effect) {
  return Number(effect?.effect_id ?? effect?.effectId);
}

function makeStatusEffectKey(effect, index = 0) {
  const id = getStatusEffectId(effect);
  const start = effect?.start_time ?? effect?.startTime ?? "";
  const charges = effect?.charges_left ?? effect?.chargesLeft ?? "";
  const instigator = normalizePlayerId(effect?.instigator_id ?? effect?.instigatorId) || "";
  const targetData = effect?.target_data ?? effect?.targetData ?? {};
  let targetKey = "";
  try {
    targetKey = JSON.stringify(targetData);
  } catch (_) {
    targetKey = String(targetData);
  }
  return [index, id, start, charges, instigator, targetKey].map((part) => String(part)).join("|");
}

function clearPlayerEffectStateInternal(playerId, effectSelector: any = "__all__", options: any = {}) {
  const targetId = normalizePlayerId(playerId);
  if (!targetId) return false;
  const player = getNetPlayerById(targetId);
  const sourceState = player?.state || state.players[targetId];
  if (!sourceState) return false;
  const playerState = clonePlain(sourceState);
  const effects = Array.isArray(playerState.active_status_effects)
    ? playerState.active_status_effects
    : [];
  const selector = String(effectSelector);
  const isKeySelector = selector.startsWith("__key__:");
  const selectedKey = isKeySelector ? selector.slice("__key__:".length) : null;
  if (isKeySelector && !effects.some((effect, index) => makeStatusEffectKey(effect, index) === selectedKey)) {
    return false;
  }
  const effectId =
    selector === "__all__" || isKeySelector
      ? null
      : Number.isFinite(Number(selector))
        ? Number(selector)
        : Number(getPlayerEffectId(selector));
  if (selector !== "__all__" && !isKeySelector && !Number.isFinite(effectId)) return false;
  const predicate = options.predicate || (() => true);
  const runtimeRemoved = removeRuntimeStatusEffects(targetId, selector, effectId, predicate, selectedKey);
  if (effects.length === 0 && runtimeRemoved === 0) return false;
  const filtered = effects.filter((effect, index) => {
    const currentId = getStatusEffectId(effect);
    const keyMatches = isKeySelector && makeStatusEffectKey(effect, index) === selectedKey;
    const idMatches = selector === "__all__" || currentId === effectId || keyMatches;
    return !(idMatches && predicate(effect));
  });
  if (filtered.length === effects.length && runtimeRemoved === 0) return false;
  playerState.active_status_effects = filtered;
  state.players[targetId] = Object.assign({}, state.players[targetId] || {}, clonePlain(playerState));
  if (targetId === state.localUid) state.lastKnownLocalState = clonePlain(playerState);
  try {
    if (typeof player?.partialStateUpdate === "function") {
      player.partialStateUpdate({ active_status_effects: filtered });
    } else if (typeof player?.stateUpdated === "function") {
      player.stateUpdated();
    }
  } catch (e) {
    if (!options.silent) log("[putt:WARN] failed to update active status effects locally", e);
  }
  sendFrame(OPCODES.PlayerSetState, { id: targetId, state: playerState });
  if (!options.silent) {
    refreshPlayerEffectUI();
    log("[putt:INFO] cleared applied state", { targetId, effectSelector, removed: effects.length - filtered.length });
  }
  return true;
}

function removeRuntimeStatusEffects(playerId, selector, effectId, predicate, selectedKey = null) {
  const statusTarget = getCurrentMode()?.getStatusEffectTargetById?.(playerId);
  const active = statusTarget?._activeStatusEffects;
  if (!Array.isArray(active) || active.length === 0) return 0;
  const isKeySelector = !!selectedKey;
  let removed = 0;
  for (let index = active.length - 1; index >= 0; index--) {
    const runtimeEffect = active[index];
    const currentId = Number(runtimeEffect?.statusEffectRef?.statusEffectId);
    const stateLike = {
      effect_id: currentId,
      start_time: runtimeEffect?.startTime,
      charges_left: runtimeEffect?.chargesLeft,
      instigator_id: runtimeEffect?.instigator?.owner?.uid,
      target_data: runtimeEffect?.targetData,
    };
    const idMatches =
      selector === "__all__" ||
      currentId === Number(effectId) ||
      (isKeySelector && makeStatusEffectKey(stateLike, index) === selectedKey);
    if (!idMatches || !predicate(stateLike)) continue;
    try {
      statusTarget.onStatusEffectRemoved?.(runtimeEffect, runtimeEffect.targetData);
    } catch (e) {
      log("[putt:WARN] failed to remove runtime status effect", e);
    }
    active.splice(index, 1);
    removed++;
  }
  return removed;
}

function clearLocalPlayerState(options: any = {}) {
  puttActions.syncFromGame();
  const localId = state.localUid;
  if (!localId) {
    if (!options.silent) alert("Local player is not ready.");
    return false;
  }
  const cleared = clearPlayerEffectStateInternal(localId, "__all__", { silent: true });
  scrubLocalRuntimeArtifacts({
    clearRewind: true,
    stopTimerWarnings: true,
    haltIfRewinding: true,
  });
  const local = getLocalNetPlayer();
  if (local?.state) {
    const nextState = clonePlain(local.state);
    nextState.active_status_effects = [];
    if (Number(nextState.phase) === PLAYER_PHASE.Simulating && isLocalBallNearlyStopped()) {
      nextState.phase = PLAYER_PHASE.WaitingOnInput;
      nextState.vel = { x: 0, y: 0, z: 0 };
    }
    setLocalState(nextState);
  }
  refreshPlayerEffectUI();
  updateStatus("Cleared local state");
  log("[putt:INFO] cleared local player state", { localId, cleared });
  return true;
}

function scrubLocalRuntimeArtifacts(options: any = {}) {
  const local = getLocalNetPlayer();
  const visual = local?.localState?.visual;
  if (options.clearRewind) scrubRewindVisual(visual, options);
  if (options.stopTimerWarnings) stopHoleTimerWarnings();
  if (visual && Number(local?.state?.phase) === PLAYER_PHASE.WaitingOnInput) {
    try {
      visual.enableControls?.();
    } catch (e) {
      log("[putt:WARN] failed to enable local controls", e);
    }
  }
}

function scrubRewindVisual(visual, options: any = {}) {
  if (!visual) return false;
  const wasRewinding = Boolean(visual.rewindActive ?? visual._rewindActive);
  if (!wasRewinding && !options.force) return false;
  try {
    window.cc?.Tween?.stopAllByTarget?.(visual.node);
    window.cc?.tween?.stopAllByTarget?.(visual.node);
  } catch (_) {}
  try {
    visual._rewindActive = false;
    if (Array.isArray(visual._waypoints)) visual._waypoints = [];
    if (visual.rigidbody) visual.rigidbody.isKinematic = false;
    if (options.haltIfRewinding) {
      visual.haltMotion?.();
      visual.rigidbody?.clearVelocity?.();
      visual.rigidbody?.clearForces?.();
    }
    visual.enableControls?.();
  } catch (e) {
    log("[putt:WARN] failed to scrub rewind visual", e);
  }
  return true;
}

function stopHoleTimerWarnings() {
  const now = Date.now();
  if (now - lastTimerWarningStopAt < 1500) return 0;
  lastTimerWarningStopAt = now;
  const scene = window.cc?.director?.getScene();
  if (!scene) return 0;
  let stopped = 0;
  walkScene(scene, (node) => {
    const components = node?.components || node?._components || [];
    components.forEach((component) => {
      if (!component?.timerLabel) return;
      try {
        component.stopWarning10?.();
        component.stopWarning30?.();
        if (component.timerLabel?.node) {
          window.cc?.Tween?.stopAllByTarget?.(component.timerLabel.node);
          window.cc?.tween?.stopAllByTarget?.(component.timerLabel.node);
        }
        stopped++;
      } catch (e) {
        log("[putt:WARN] failed to stop timer warning", e);
      }
    });
    return false;
  });
  return stopped;
}

function isLocalBallNearlyStopped() {
  return getLocalBallSpeed() < 0.03;
}

function getLocalBallSpeed() {
  const local = getLocalNetPlayer();
  const visual = local?.localState?.visual;
  const cc = window.cc;
  try {
    if (visual?.rigidbody?.getLinearVelocity && cc?.Vec3) {
      const velocity = new cc.Vec3();
      visual.rigidbody.getLinearVelocity(velocity);
      return Math.hypot(Number(velocity.x) || 0, Number(velocity.y) || 0, Number(velocity.z) || 0);
    }
  } catch (_) {}
  const vel = normalizeVec3(local?.state?.vel || state.lastKnownLocalState?.vel);
  return vel ? Math.hypot(vel.x, vel.y, vel.z) : Infinity;
}

function forceLocalBallStopped(reason = "stuck") {
  const local = getLocalNetPlayer();
  const visual = local?.localState?.visual;
  if (!local?.state || !state.localUid) return false;
  if (visual?.inHole) return finishLocalHole(reason);
  const pos =
    normalizeVec3(visual?.node?.worldPosition) ||
    normalizeVec3(local.state.pos) ||
    normalizeVec3(state.lastKnownLocalState?.pos);
  if (!pos) return false;
  try {
    visual?.haltMotion?.();
    visual?.rigidbody?.clearVelocity?.();
    visual?.rigidbody?.clearForces?.();
    visual?.enableControls?.();
  } catch (e) {
    log("[putt:WARN] failed to halt local ball", e);
  }
  setLocalState(Object.assign(clonePlain(local.state), {
    phase: PLAYER_PHASE.WaitingOnInput,
    pos,
    vel: { x: 0, y: 0, z: 0 },
  }));
  sendGameCmd(GAME_CMD.BallStopped, { id: state.localUid, pos });
  updateStatus(`Forced stopped (${reason})`);
  log("[putt:INFO] forced local ball stopped", { reason, pos });
  return true;
}

function finishLocalHole(reason = "in-hole") {
  const local = getLocalNetPlayer();
  const mode = getCurrentMode();
  if (!local?.state || !state.localUid) return false;
  try {
    const localGolfPlayer = mode?.localGolfPlayer || mode?._localGolfPlayer;
    if (typeof localGolfPlayer?.FinishHole === "function") {
      localGolfPlayer.FinishHole(false);
      updateStatus(`Finished local hole (${reason})`);
      return true;
    }
  } catch (e) {
    log("[putt:WARN] failed to call FinishHole", e);
  }
  const nextPhase =
    Number(mode?.currentHole ?? mode?._currentHole ?? 0) + 1 > Number(mode?.maxHoles ?? mode?.holesPerGame ?? Infinity)
      ? PLAYER_PHASE.GameOver
      : PLAYER_PHASE.HoleDone;
  setLocalState(Object.assign(clonePlain(local.state), {
    phase: nextPhase,
    vel: { x: 0, y: 0, z: 0 },
  }));
  updateStatus(`Marked local hole done (${reason})`);
  return true;
}

function startLocalHealthWatchdog() {
  if (localHealthTimer) return;
  if (window.__puttLocalHealthTimer) {
    clearInterval(window.__puttLocalHealthTimer);
  }
  localHealthTimer = setInterval(() => {
    try {
      repairLocalHealthTick();
    } catch (e) {
      log("[putt:WARN] local health watchdog failed", e);
    }
  }, 750);
  window.__puttLocalHealthTimer = localHealthTimer;
}

function repairLocalHealthTick() {
  const mode = getCurrentMode();
  const local = getLocalNetPlayer();
  if (!mode || !local?.state) return;
  const phase = Number(local.state.phase);
  const visual = local.localState?.visual;
  if (visual?.inHole && phase !== PLAYER_PHASE.HoleDone && phase !== PLAYER_PHASE.GameOver) {
    finishLocalHole("visual in hole");
  }

  const visualRewinding = Boolean(visual?.rewindActive || visual?._rewindActive);
  const rewindEffectId =
    visualRewinding && (state.playerEffectIds.Rewind === null || state.playerEffectIds.Rewind === undefined)
      ? getPlayerEffectId("Rewind")
      : state.playerEffectIds.Rewind;
  const hasRewindState =
    Number.isFinite(Number(rewindEffectId)) &&
    getPlayerActiveStatusEffects(state.localUid).some((effect) => Number(getStatusEffectId(effect)) === Number(rewindEffectId));
  if (visualRewinding && !hasRewindState) {
    scrubRewindVisual(visual, { haltIfRewinding: true });
  }

  if (phase === PLAYER_PHASE.Simulating && !visual?.inHole) {
    if (isLocalBallNearlyStopped()) {
      localStillSince ||= Date.now();
      if (Date.now() - localStillSince > 1800) forceLocalBallStopped("low velocity");
    } else {
      localStillSince = 0;
    }
  } else {
    localStillSince = 0;
  }

  const roundState = Number(mode.gameState ?? mode._currentState);
  const holeTimeLeft = Number(mode.holeTimeLeft);
  if (roundState !== GAME_STATE.Play || (Number.isFinite(holeTimeLeft) && holeTimeLeft <= 0)) {
    stopHoleTimerWarnings();
  }
  if (typeof mode.checkIfGameStateNeedsToChange === "function" && mode.IsPrimaryUser?.()) {
    if (mode.AllPlayersFinishedHole?.() || (Number.isFinite(holeTimeLeft) && holeTimeLeft <= 0)) {
      mode.checkIfGameStateNeedsToChange();
    }
  }
}

function updateSpawnedBumpersFromPacket(data) {
  if (data?.cmd !== GAME_CMD.ApplyStatusEffectToPlayer) return;
  const effectId = Number(data.data?.effectId ?? data.data?.effect_id);
  const spawnBumperEffectId = Number(state.spawnBumperEffectId ?? getSpawnBumperEffectId());
  if (!Number.isFinite(effectId) || effectId !== spawnBumperEffectId) return;
  recordSpawnedBumper(data.data?.targetData || data.data?.target_data);
}

function syncSpawnedBumpersFromGame() {
  const mode = getCurrentMode();
  const spawnBumperEffectId = Number(state.spawnBumperEffectId ?? getSpawnBumperEffectId());
  if (!Number.isFinite(spawnBumperEffectId)) return;
  const effects =
    mode?.getActiveStatusEffectStates?.() ||
    mode?._activeStatusEffects ||
    mode?.activeStatusEffects ||
    [];
  if (!Array.isArray(effects)) return;
  effects.forEach((effect) => {
    const effectId = Number(effect?.effect_id ?? effect?.effectId);
    if (effectId !== spawnBumperEffectId) return;
    recordSpawnedBumper(effect?.target_data || effect?.targetData);
  });
  getKnownPlayers().forEach((player) => {
    getPlayerActiveStatusEffects(player.id).forEach((effect) => {
      const effectId = Number(effect?.effect_id ?? effect?.effectId);
      if (effectId !== spawnBumperEffectId) return;
      recordSpawnedBumper(effect?.target_data || effect?.targetData);
    });
  });
}

function removeSpawnedBumperEffectState(keyOrId) {
  const mode = getCurrentMode();
  const spawnBumperEffectId = Number(state.spawnBumperEffectId ?? getSpawnBumperEffectId());
  if (!mode || !Number.isFinite(spawnBumperEffectId)) return false;
  const effects =
    mode.getActiveStatusEffectStates?.() ||
    mode._activeStatusEffects ||
    mode.activeStatusEffects ||
    [];
  if (!Array.isArray(effects)) return false;
  const filtered = effects.filter((effect) => {
    const effectId = Number(effect?.effect_id ?? effect?.effectId);
    const targetData = effect?.target_data || effect?.targetData;
    const position = normalizeVec3(targetData?.position);
    return effectId !== spawnBumperEffectId || !matchesSpawnedBumper(targetData, keyOrId, position);
  });
  if (filtered.length === effects.length) return false;
  if (typeof mode.setActiveStatusEffectStates === "function") {
    mode.setActiveStatusEffectStates(filtered);
  } else {
    mode._activeStatusEffects = filtered;
    mode.UpdateState?.();
  }
  getKnownPlayers().forEach((player) => {
    clearPlayerEffectStateInternal(player.id, spawnBumperEffectId, {
      silent: true,
      predicate: (effect) => matchesSpawnedBumper(effect?.target_data || effect?.targetData, keyOrId),
    });
  });
  return true;
}

function recordSpawnedBumper(targetData) {
  const position = normalizeVec3(targetData?.position);
  if (!position) return null;
  const key = formatPlaceablePositionKey(position);
  const id = String(targetData?.id || key);
  const next = {
    id,
    key,
    position,
    targetData: clonePlain(targetData),
    createdAt: Date.now(),
  };
  const index = state.spawnedBumpers.findIndex((bumper) => bumper.id === id || bumper.key === key);
  if (index >= 0) state.spawnedBumpers[index] = next;
  else state.spawnedBumpers.push(next);
  return next;
}

function matchesSpawnedBumper(targetData, keyOrId, position = normalizeVec3(targetData?.position)) {
  if (!keyOrId) return false;
  if (targetData?.id && String(targetData.id) === String(keyOrId)) return true;
  return position && formatPlaceablePositionKey(position) === String(keyOrId);
}

function formatPlaceablePositionKey(pos) {
  const part = (value) => Number(value || 0).toFixed(2);
  return `(${part(pos.x)}, ${part(pos.y)}, ${part(pos.z)})`;
}

function getNearestAddedBumper(origin) {
  let nearest = null;
  let minDist = Infinity;
  state.spawnedBumpers = state.spawnedBumpers.filter((bumper) => {
    if (!bumper?.key || state.deletedPlaceableKeys.has(bumper.key)) return false;
    return true;
  });
  state.spawnedBumpers.forEach((bumper) => {
    const node = findNodeByPlaceableKey(bumper.key);
    const position = node?.worldPosition || bumper.position;
    const dist = distance3(position, origin);
    if (dist < minDist) {
      minDist = dist;
      nearest = {
        type: "spawnedBumper",
        name: node?.name || "SpawnedBumper",
        key: bumper.key,
        node,
        position,
        dist,
      };
    }
  });
  return nearest;
}

function findNodeByPlaceableKey(key) {
  const scene = window.cc?.director?.getScene();
  let found = null;
  walkScene(scene, (node) => {
    if (found) return true;
    if (getPlaceableKey(node) === key) {
      found = node;
      return true;
    }
    return false;
  });
  return found;
}

function distance3(a, b) {
  if (!a || !b) return Infinity;
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  const dz = Number(a.z) - Number(b.z);
  if (![dx, dy, dz].every(Number.isFinite)) return Infinity;
  return Math.hypot(dx, dy, dz);
}

function createClickOverlay(label) {
  document.getElementById("putt-click-overlay")?.remove();
  document.getElementById("putt-bumper-click-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "putt-click-overlay";
  overlay.style =
    "position:fixed;inset:0;z-index:2147483645;cursor:crosshair;background:rgba(92,200,255,0.08);border:0.32rem solid rgba(92,200,255,0.22);box-sizing:border-box;display:flex;align-items:flex-start;justify-content:center;pointer-events:auto;";
  const title = document.createElement("div");
  title.textContent = label || "Click target";
  title.style =
    "margin-top:8vh;color:#f5f7fb;background:rgba(11,13,16,0.72);border:1px solid rgba(92,200,255,0.36);border-radius:0.45rem;box-shadow:0 0.7rem 2rem rgba(0,0,0,0.35);backdrop-filter:blur(0.35rem);padding:0.72rem 1rem;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:0.9rem;font-weight:900;text-transform:uppercase;letter-spacing:0;";
  overlay.appendChild(title);
  document.body.appendChild(overlay);
  return overlay;
}

function armCanvasClick(label, onPosition, onCancelCallback, resolvePosition = getWorldPositionFromCanvasClick) {
  if (activeCanvasArm) {
    activeCanvasArm.cancel("Click cancelled");
    return false;
  }
  updateStatus(label);
  const canvas = document.getElementById("GameCanvas");
  if (!canvas) return alert("GameCanvas not found.");
  if (document.pointerLockElement) {
    try {
      document.exitPointerLock?.();
    } catch (e) {
      log("[putt:WARN] failed to exit pointer lock", e);
    }
  }
  const overlay = createClickOverlay(label);
  const onClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    cleanup();
    const pos = resolvePosition(event);
    if (!pos) {
      updateStatus("No ground hit");
      return log("[putt:WARN] failed to resolve click world position");
    }
    onPosition(pos);
    updateStatus();
  };
  const onCancel = (event) => {
    if (event.type === "keydown" && event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cancelArm("Click cancelled");
  };
  const cleanup = () => {
    overlay.removeEventListener("click", onClick, true);
    overlay.removeEventListener("contextmenu", onCancel, true);
    document.removeEventListener("keydown", onCancel, true);
    overlay.remove();
    if (activeCanvasArm?.overlay === overlay) activeCanvasArm = null;
  };
  const cancelArm = (message) => {
    cleanup();
    if (typeof onCancelCallback === "function") onCancelCallback();
    updateStatus(message || "Click cancelled");
  };
  activeCanvasArm = { overlay, cancel: cancelArm };
  overlay.addEventListener("click", onClick, { once: true, capture: true });
  overlay.addEventListener("contextmenu", onCancel, { once: true, capture: true });
  document.addEventListener("keydown", onCancel, { capture: true });
  return true;
}

function installWebSocketHook() {
  if (window.__puttWsHookInstalled) return;
  window.__puttWsHookInstalled = true;

  const NativeWebSocket = window.WebSocket;
  window.WebSocket = new Proxy(NativeWebSocket, {
    construct(target: any, args: any[]) {
      const ws = new target(...args);
      state.sockets.push(ws);
      ws.addEventListener("open", () => {
        state.activeSocket = ws;
        state.requestedUserList = false;
        state.lastSocketOpenedAt = Date.now();
        state.lastJoinRecoveryAt = 0;
        state.seenPlayableStateSinceSocketOpen = false;
        requestUserListSoon(100);
        setTimeout(() => maybeRecoverLocalJoinState(), 500);
        setTimeout(() => maybeRecoverLocalJoinState(), 1500);
      });

      const originalSend = ws.send;
      ws.send = function patchedSend(data) {
        if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
          const decoded = decodeOpPack(data);
          if (decoded) {
            if (decoded.opcode === OPCODES.Ping) state.lastPingTime = Date.now();
            state.activeSocket = ws;
            handlePacket("out", decoded.opcode, decoded.data);
          }
        }
        return (originalSend as any).apply(this, arguments as any);
      };

      ws.addEventListener("message", (event) => {
        if (event.data instanceof ArrayBuffer) {
          const decoded = decodeOpPack(event.data);
          if (decoded) handlePacket("in", decoded.opcode, decoded.data);
        }
      });

      return ws;
    },
  });
  window.WebSocket.prototype = NativeWebSocket.prototype;
  Object.setPrototypeOf(window.WebSocket, NativeWebSocket);
}

function ensureUiOnDomReady() {
  if (maybeCreateUiForGameDocument()) {
    return;
  }
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      if (!maybeCreateUiForGameDocument()) {
        observeGameCanvasForUi();
      }
    },
    { once: true },
  );
  observeGameCanvasForUi();
}

function maybeCreateUiForGameDocument() {
  if (!document.body) return false;
  if (!document.getElementById("GameCanvas") && !window.cc?.game) return false;
  createUI();
  schedulePowerupIdDetection();
  startLocalHealthWatchdog();
  updateStatus();
  return true;
}

function observeGameCanvasForUi() {
  if (uiObserver || !document.documentElement) return;
  uiObserver = new MutationObserver(() => {
    if (!maybeCreateUiForGameDocument()) return;
    uiObserver?.disconnect();
    uiObserver = null;
  });
  uiObserver.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => {
    uiObserver?.disconnect();
    uiObserver = null;
  }, 30000);
}

function schedulePowerupIdDetection(attemptsLeft = 20) {
  if (Object.keys(state.powerupMapping).length > 0) return;
  if (detectPowerupIds({ silent: true })) return;
  if (attemptsLeft <= 0) return;
  if (powerupDetectionTimer) return;
  powerupDetectionTimer = setTimeout(() => {
    powerupDetectionTimer = null;
    schedulePowerupIdDetection(attemptsLeft - 1);
  }, 500);
}

const puttActions = createPuttActions({
  state,
  log,
  moduleManager,
  canSend,
  getServerTimeNow,
  patchLocalState,
  sendGameCmd,
  detectPowerupIds,
  getPowerupCount,
  enqueuePowerups,
  getStealEffectId,
  removeCachedPlayerCard,
  refreshPlayerItemUI,
  isRewindName,
  canApplyRewindToPlayer,
  getPlayerEffectId,
  applyPlayerEffectLocally,
  clearLocalPlayerState,
  getSpawnBumperEffectId,
  getCurrentMode,
  normalizeVec3,
  recordSpawnedBumper,
  applyStatusEffectStateLocally,
  armCanvasClick,
  getTeleportPositionFromCanvasClick,
  getLocalBallVisual,
  findNodeByName,
  getCurrentCameraNode,
  getDeleteCandidate,
  getPlaceableKey,
  distance3,
  getNearestAddedBumper,
  removeSpawnedBumperEffectState,
  walkScene,
  updatePlayerStatesFromGame,
  getLocalNetPlayer,
  normalizePlayerId,
  clonePlain,
  markPlayableStateSeen,
  getGameManager,
  updateLocalIdentityFromGame,
  requestUserListSoon,
  forceCreateUI,
  refillPowerupSlots,
  formatPlaceablePositionKey,
  getKnownPlayers,
  hasLocalCardState,
  getTeleportBaseY,
  recoverLocalStateForCurrentHole,
  isLocalBallNearlyStopped,
  forceLocalBallStopped,
  setLocalState,
  refreshPlayerEffectUI,
  updateStatus,
});
window.puttCheats = puttActions;

function detectPowerupIds(options: any = {}) {
  const scene = window.cc?.director?.getScene();
  const puMgr = findComponent(
    scene,
    (c) => Array.isArray(c.cardChoices) && c.cardChoices.length > 0,
  );
  if (!puMgr) {
    if (!options.silent) log("[putt:WARN] powerup manager not found");
    return false;
  }
  state.powerupMapping = {};
  puMgr.cardChoices.forEach((choice, index) => {
    const raw = choice?.PowerupPrefab?.data?.name || `Powerup_${index}`;
    state.powerupMapping[raw.replace("PowerUp_", "")] = index;
  });
  const select = document.getElementById("sel-p");
  if (select) {
    setSelectOptionsStable(
      select,
      Object.keys(state.powerupMapping).map((name) => ({
        value: name,
        label: name,
      })),
    );
  }
  state.stealEffectId = getStealEffectId();
  state.spawnBumperEffectId = getSpawnBumperEffectId();
  state.playerEffectIds = detectPlayerEffectIds();
  refreshPlayerItemUI();
  refreshPlayerEffectUI();
  log("[putt:INFO] powerup ids", state.powerupMapping);
  log("[putt:INFO] steal effect id", state.stealEffectId);
  log("[putt:INFO] spawn bumper effect id", state.spawnBumperEffectId);
  log("[putt:INFO] player effect ids", state.playerEffectIds);
  return true;
}

function refreshPlayerItemUI(options: any = {}) {
  if (refreshingPlayerUi) return;
  const playerSelect = document.getElementById("sel-player");
  if (!playerSelect) return;
  if (!options.skipSync) {
    refreshingPlayerUi = true;
    try {
      puttActions.syncFromGame();
    } finally {
      refreshingPlayerUi = false;
    }
  }
  const cardSelect = document.getElementById("sel-player-card");
  const button = document.getElementById("btn-remove-player-item");
  const previous = playerSelect.value;
  const players = getKnownPlayers().filter((player) =>
    player.id !== state.localUid &&
    Array.isArray(player.state?.cards_in_hand) &&
    player.state.cards_in_hand.length > 0,
  );
  if (players.length === 0) {
    playerSelect.innerHTML = `<option value="" disabled selected>No players with powerups</option>`;
    playerSelect.dataset.optionsSignature = "";
    playerSelect.disabled = true;
    if (cardSelect) {
      cardSelect.innerHTML = `<option value="" disabled selected>No powerups</option>`;
      cardSelect.dataset.optionsSignature = "";
      cardSelect.disabled = true;
    }
    if (button) button.disabled = true;
    return;
  }
  playerSelect.disabled = false;
  setSelectOptionsStable(
    playerSelect,
    players.map((player) => {
      const cards = Array.isArray(player.state?.cards_in_hand) ? player.state.cards_in_hand : [];
      const label = `${getPlayerLabel(player.id)} [${cards.length}]`;
      return { value: player.id, label };
    }),
    previous,
  );
  refreshPlayerCardSelect();
}

function refreshPlayerCardSelect() {
  const playerSelect = document.getElementById("sel-player");
  const cardSelect = document.getElementById("sel-player-card");
  if (!playerSelect || !cardSelect) return;
  const player = state.players[playerSelect.value];
  const cards = Array.isArray(player?.cards_in_hand) ? player.cards_in_hand : [];
  const button = document.getElementById("btn-remove-player-item");
  if (cards.length === 0) {
    cardSelect.innerHTML = `<option value="" disabled selected>No powerups</option>`;
    cardSelect.dataset.optionsSignature = "";
    cardSelect.disabled = true;
    if (button) button.disabled = true;
    return;
  }
  cardSelect.disabled = false;
  if (button) button.disabled = false;
  setSelectOptionsStable(
    cardSelect,
    [
      { value: "__all__", label: `All (${cards.length})` },
      ...cards.map((cardId, index) => {
      const label = `${getPowerupNameById(cardId)} (${cardId})`;
        return { value: cardId, label, attrs: `data-index="${index}"` };
      }),
    ],
  );
}

function refreshPlayerEffectUI() {
  if (refreshingPlayerUi) return;
  const playerSelect = document.getElementById("sel-effect-player");
  const effectSelect = document.getElementById("sel-player-effect");
  if (!playerSelect || !effectSelect) return;
  refreshingPlayerUi = true;
  try {
    puttActions.syncFromGame();
  } finally {
    refreshingPlayerUi = false;
  }
  const previousPlayer = playerSelect.value;
  const previousEffect = effectSelect.value;
  const players = getKnownPlayers();
  if (players.length === 0) {
    playerSelect.innerHTML = `<option value="" disabled selected>No players</option>`;
    playerSelect.dataset.optionsSignature = "";
    playerSelect.disabled = true;
  } else {
    playerSelect.disabled = false;
  }
  if (players.length > 0) {
    setSelectOptionsStable(
      playerSelect,
      players.map((player) => {
        const label = getPlayerLabel(player.id);
        return { value: player.id, label };
      }),
      previousPlayer,
    );
  }

  const effectIds = Object.keys(state.playerEffectIds).length
    ? state.playerEffectIds
    : Object.fromEntries(PLAYER_EFFECTS.map((name) => [name, null]));
  setSelectOptionsStable(
    effectSelect,
    Object.entries(effectIds).map(([name, id]) => {
      const suffix = id === null || id === undefined ? " (?)" : ` (${id})`;
      return { value: name, label: name + suffix };
    }),
    previousEffect,
  );
  const clearButton = document.getElementById("btn-clear-player-effect");
  if (clearButton) clearButton.disabled = !state.localUid;
}

function refreshPlayerEffectStateSelect() {
  refreshPlayerEffectUI();
}

function setSelectOptionsStable(select, entries, preferredValue = select.value) {
  if (!select) return;
  const normalized = entries.map((entry) => ({
    value: String(entry.value),
    label: String(entry.label),
    attrs: entry.attrs || "",
  }));
  const signature = JSON.stringify(normalized);
  if (select.dataset.optionsSignature !== signature) {
    select.dataset.optionsSignature = signature;
    select.innerHTML = normalized
      .map((entry) =>
        `<option value="${escapeAttr(entry.value)}" ${entry.attrs}>${escapeHtml(entry.label)}</option>`,
      )
      .join("");
  }
  const nextValue = normalized.some((entry) => entry.value === preferredValue)
    ? preferredValue
    : normalized[0]?.value;
  if (nextValue !== undefined && select.value !== nextValue) {
    select.value = nextValue;
  }
}

function isSelectBeingEdited() {
  const active = document.activeElement;
  return active?.tagName === "SELECT" && active.closest?.("#putt-ui");
}

function getKnownPlayers() {
  return Object.keys(state.players)
    .sort((a, b) => {
      if (a === state.localUid) return -1;
      if (b === state.localUid) return 1;
      return a.localeCompare(b);
    })
    .map((id) => ({ id, state: state.players[id] }));
}

function getPlayerLabel(id) {
  const name = state.playerNames[id];
  const local = id === state.localUid ? " (local)" : "";
  const shortId = shortenId(id);
  return name ? `${name}${local} / ${shortId}` : `${shortId}${local}`;
}

function shortenId(id) {
  const text = String(id);
  return text.length > 12 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text;
}

function getPowerupNameById(id) {
  for (const [name, mappedId] of Object.entries(state.powerupMapping)) {
    if (Number(mappedId) === Number(id)) return name;
  }
  return `Powerup_${id}`;
}

function removeCachedPlayerCard(playerId, cardId) {
  const cards = state.players[playerId]?.cards_in_hand;
  if (!Array.isArray(cards)) return false;
  const index = cards.findIndex((value) => Number(value) === Number(cardId));
  if (index < 0) return false;
  cards.splice(index, 1);
  return true;
}

function getMaxHandSize() {
  const puMgr = findComponent(
    window.cc?.director?.getScene(),
    (c) => Array.isArray(c.inHandPositions),
  );
  return Math.max(1, puMgr?.inHandPositions?.length || 5);
}

function getPowerupCount() {
  const input = document.getElementById("pu-count");
  const value = Number.parseInt(input?.value || "1", 10);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 99) : 1;
}

function enqueuePowerups(ids, replaceVisible) {
  ids = sanitizeQueuedPowerups(ids);
  if (ids.length === 0) return false;
  if (!hasLocalCardState()) {
    if (replaceVisible) state.powerupQueue = [];
    state.powerupQueue.push(...ids);
    startPowerupRefillLoop();
    return;
  }
  const max = getMaxHandSize();
  let visible = replaceVisible ? [] : getLocalCards().slice(0, max);
  const incoming = ids.slice();

  while (visible.length < max && incoming.length > 0) {
    visible.push(incoming.shift());
  }
  if (replaceVisible) state.powerupQueue = [];
  state.powerupQueue.push(...incoming);

  if (!sameCards(getLocalCards().slice(0, max), visible)) {
    setLocalCards(visible);
    refreshHandUiSoon();
  }
  startPowerupRefillLoop();
  log("[putt:INFO] powerups visible/queued", visible.length, state.powerupQueue.length);
  return true;
}

function refillPowerupSlots() {
  if (!state.localUid || !state.lastKnownLocalState || state.powerupQueue.length === 0) {
    return false;
  }
  if (!hasLocalCardState()) return false;
  state.powerupQueue = sanitizeQueuedPowerups(state.powerupQueue);
  if (state.powerupQueue.length === 0) return false;
  const max = getMaxHandSize();
  const visible = getLocalCards().slice(0, max);
  let changed = false;
  while (visible.length < max && state.powerupQueue.length > 0) {
    visible.push(state.powerupQueue.shift());
    changed = true;
  }
  if (!changed) return false;
  setLocalCards(visible);
  refreshHandUiSoon();
  log("[putt:INFO] refilled powerups", visible.length, state.powerupQueue.length);
  return true;
}

function hasLocalCardState() {
  return Boolean(state.localUid && (getLocalNetPlayer()?.state || state.lastKnownLocalState));
}

function sanitizeQueuedPowerups(ids) {
  return ids.slice();
}

function sameCards(a, b) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => Number(value) === Number(b[index]));
}

function clearPowerupQueue() {
  if (state.powerupQueue.length === 0) return;
  state.powerupQueue = [];
  if (state.powerupRefillTimer) {
    clearInterval(state.powerupRefillTimer);
    state.powerupRefillTimer = null;
  }
  updateStatus();
}

function startPowerupRefillLoop() {
  if (state.powerupRefillTimer) return;
  state.powerupRefillTimer = setInterval(() => {
    if (state.powerupQueue.length === 0) {
      clearInterval(state.powerupRefillTimer);
      state.powerupRefillTimer = null;
      return;
    }
    puttActions.syncFromGame();
    refillPowerupSlots();
  }, 500);
}

function refreshHandUiSoon() {
  setTimeout(() => {
    const puMgr = findComponent(
      window.cc?.director?.getScene(),
      (c) =>
        Array.isArray(c.inHandPositions) &&
        typeof c.clearHandSlots === "function" &&
        typeof c.populateHand === "function",
    );
    try {
      if (puMgr && getLocalCards().length <= getMaxHandSize()) {
        puMgr.clearHandSlots?.();
        puMgr.populateHand?.();
      }
      puMgr?.refreshStateOfCardsInHand?.();
    } catch (e) {
      log("[putt:WARN] failed to refresh hand ui", e);
    }
  }, 50);
}

configureTrajectoryOverlay({
  getCameraNode: getCurrentCameraNode,
});

function teleportToGoal() {
  const goal = getGoalPosition();
  if (!goal) return alert("Goal not found.");
  return puttActions.teleport(goal.x, Number(goal.y) + 15, goal.z);
}

function armClickTeleport() {
  return puttActions.armTeleportFill((pos) => {
    puttActions.teleport(pos.x, pos.y, pos.z);
  });
}

registerBuiltinModules(moduleManager, {
  toggleUI,
  teleportToGoal,
  armTeleportFill: armClickTeleport,
  addPowerup: (name) => puttActions.addPowerup(name),
  refillPowerups: () => puttActions.refillPowerups(),
  repairLocalState: () => puttActions.repairLocalState(),
  clearPlayerEffectState: () => puttActions.clearPlayerEffectState(),
  armPutBumper: () => puttActions.armPutBumper(),
  deleteNearest: () => puttActions.deleteNearest(),
  setTrajectoriesEnabled,
  updateStatus,
  togglePanel: toggleFormPanel,
  isPanelOpen,
});

keybindManager.install();
(window as any).puttModules = moduleManager;
(window as any).puttKeybinds = keybindManager;

configureUI({
  teleport: (...args) => puttActions.teleport(...args),
  armTeleportFill: (...args) => puttActions.armTeleportFill(...args),
  getGoalPosition,
  detectPowerupIds,
  addPowerup: (name) => puttActions.addPowerup(name),
  refreshPlayerItemUI,
  refreshPlayerCardSelect,
  removePlayerItem: (...args) => puttActions.removePlayerItem(...args),
  refreshPlayerEffectUI,
  refreshPlayerEffectStateSelect,
  applyPlayerEffect: (...args) => puttActions.applyPlayerEffect(...args),
  clearPlayerEffectState: (...args) => puttActions.clearPlayerEffectState(...args),
  armPutBumper: () => puttActions.armPutBumper(),
  setTrajectoriesEnabled,
  repairLocalState: (...args) => puttActions.repairLocalState(...args),
  deleteNearest: () => puttActions.deleteNearest(),
  getModules: () => moduleManager.getAll(),
  invokeModule: (id) => moduleManager.invoke(id),
  onModulesChanged: (callback) => moduleManager.subscribe(callback),
  notifyModulesChanged: () => moduleManager.emitChange(),
  refreshModuleBoard,
});

ensureUiOnDomReady();
installWebSocketHook();
installSystemHook(() => {
  createUI();
  schedulePowerupIdDetection();
  startLocalHealthWatchdog();
  updateStatus();
});
