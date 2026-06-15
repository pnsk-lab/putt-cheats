export const OPCODES = {
  Ping: 1,
  Pong: 2,
  CmdAuthenticate: 3,
  CmdUserList: 6,
  CmdGameSetState: 11,
  EvtUserList: 34,
  EvtUserJoined: 35,
  EvtUserUpdated: 37,
  EvtGroupUserJoined: 39,
  EvtGroupListUsers: 41,
  EvtGameState: 45,
  EvtGameUpdated: 46,
  GameEventSend: 65,
  PlayerSetState: 66,
  GameEventRecv: 96,
  GameStateRecv: 97,
  PlayerStateRecv: 98,
  PlayerBulkStateRecv: 100,
};

export const GAME_CMD = {
  QueuedMove: 0,
  ApplyStatusEffectToPlayer: 2,
  ConsumeStatusEffectCharge: 3,
  BallCorrection: 5,
  BallStopped: 6,
  MarkPlaceableDestroyed: 8,
  StatusEffectEvent: 11,
  StartNewHole: 12,
};

export const PLAYER_PHASE = {
  CourseSelect: 0,
  StartHole: 1,
  WaitingOnInput: 2,
  InputReceived: 3,
  Simulating: 4,
  StrokeDone: 5,
  HoleDone: 6,
  GameOver: 7,
};

export const GAME_STATE = {
  Init: 0,
  GameplayModeSelect: 1,
  CourseSelect: 2,
  Play: 3,
  TournamentWait: 6,
  TournamentOver: 7,
};

export const PLAYER_EFFECTS = [
  "PopShot",
  "Unlovaball",
  "OneTooMany",
  "TwistedAim",
  "SuperSize",
  "FunSize",
  "HoleMagnet",
  "GasGiant",
  "Sharpshooter",
  "Rewind",
  "StickyBall",
  "ZanyBall",
  "GhostBall",
  "Reversiball",
  "Guesswork",
];
