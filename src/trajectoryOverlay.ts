import { state } from "./state.js";
import { getGameCanvasMetrics, getPlayerBallColor } from "./engine.js";
import { normalizeVec3 } from "./utils.js";

let getCameraNode = () => null;

export function configureTrajectoryOverlay(options) {
  getCameraNode = options.getCameraNode;
}

export function recordTrajectory(id, playerState) {
  const pos = normalizeVec3(playerState?.pos);
  const vel = normalizeVec3(playerState?.vel);
  if (!id || !pos || !vel) return;
  if (velocityMagnitude(vel) < 0.02) {
    delete state.trajectories[id];
    return;
  }
  const previous = state.trajectories[id];
  state.trajectories[id] = {
    id,
    pos,
    vel,
    renderPos: previous?.renderPos || pos,
    renderVel: previous?.renderVel || vel,
    color: getPlayerBallColor(id) || previous?.color || null,
    updatedAt: performance.now(),
    drawnAt: previous?.drawnAt || performance.now(),
  };
}

export function setTrajectoriesEnabled(enabled) {
  state.trajectoriesEnabled = Boolean(enabled);
  const checkbox = document.getElementById("chk-traj");
  if (checkbox) checkbox.checked = state.trajectoriesEnabled;
  if (state.trajectoriesEnabled) {
    ensureTrajectoryCanvas();
    drawTrajectories();
  } else {
    if (state.trajectoryRaf) {
      cancelAnimationFrame(state.trajectoryRaf);
      state.trajectoryRaf = null;
    }
    state.trajectoryCanvas?.remove();
    state.trajectoryCanvas = null;
  }
}

function ensureTrajectoryCanvas() {
  if (state.trajectoryCanvas?.isConnected) return state.trajectoryCanvas;
  const canvas = document.createElement("canvas");
  canvas.id = "putt-trajectory-overlay";
  canvas.style =
    "position:fixed;inset:0;z-index:2147483646;pointer-events:none;width:100vw;height:100vh;";
  document.body.appendChild(canvas);
  state.trajectoryCanvas = canvas;
  return canvas;
}

function drawTrajectories() {
  if (!state.trajectoriesEnabled) return;
  const canvas = ensureTrajectoryCanvas();
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(window.innerWidth * dpr));
  const height = Math.max(1, Math.floor(window.innerHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  const camera = getCameraNode()?.getComponent?.(window.cc?.Camera);
  if (camera) {
    const now = performance.now();
    for (const [id, traj] of Object.entries(state.trajectories) as [string, any][]) {
      if (id === state.localUid || now - traj.updatedAt > 5000) {
        delete state.trajectories[id];
        continue;
      }
      smoothTrajectory(traj, now);
      drawTrajectory(ctx, camera, traj);
    }
  }
  state.trajectoryRaf = requestAnimationFrame(drawTrajectories);
}

function drawTrajectory(ctx, camera, traj) {
  const points = predictTrajectoryPoints(traj.renderPos, traj.renderVel);
  const screenPoints = points
    .map((point) => worldToScreen(camera, point))
    .filter(Boolean);
  if (screenPoints.length < 2) return;

  const color = colorForTrajectory(traj);
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
  for (let i = 1; i < screenPoints.length - 1; i++) {
    const current = screenPoints[i];
    const next = screenPoints[i + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    ctx.quadraticCurveTo(current.x, current.y, midX, midY);
  }
  const last = screenPoints[screenPoints.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  const end = screenPoints[screenPoints.length - 1];
  ctx.beginPath();
  ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(playerLabel(traj.id), screenPoints[0].x + 5, screenPoints[0].y - 5);
  ctx.restore();
}

function predictTrajectoryPoints(pos, vel) {
  const points = [];
  const steps = 28;
  const horizonSeconds = 0.9;
  const damping = 0.35;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * horizonSeconds;
    const drag = Math.exp(-damping * t);
    points.push({
      x: pos.x + vel.x * t * drag,
      y: pos.y + vel.y * t * drag,
      z: pos.z + vel.z * t * drag,
    });
  }
  return points;
}

function worldToScreen(camera, point) {
  if (!camera || !window.cc) return null;
  const metrics = getGameCanvasMetrics();
  if (!metrics) return null;
  const vec = new window.cc.Vec3(point.x, point.y, point.z);
  let out = new window.cc.Vec3();
  try {
    const result = camera.worldToScreen?.(vec, out);
    out = result || out;
  } catch (_) {
    try {
      const result = camera.worldToScreen?.(out, vec);
      out = result || out;
    } catch (_) {
      return null;
    }
  }
  const x = Number(out.x);
  const y = Number(out.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: metrics.rect.left + x / metrics.scaleX,
    y: metrics.rect.top + (metrics.height - y) / metrics.scaleY,
  };
}

function velocityMagnitude(vel) {
  return Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
}

function smoothTrajectory(traj, now) {
  const dt = Math.max(0, Math.min(100, now - (traj.drawnAt || now)));
  traj.drawnAt = now;
  const alpha = 1 - Math.exp(-dt / 180);
  traj.renderPos = lerpVec3(traj.renderPos || traj.pos, traj.pos, alpha);
  traj.renderVel = lerpVec3(traj.renderVel || traj.vel, traj.vel, alpha);
  traj.color = getPlayerBallColor(traj.id) || traj.color;
}

function lerpVec3(from, to, alpha) {
  return {
    x: from.x + (to.x - from.x) * alpha,
    y: from.y + (to.y - from.y) * alpha,
    z: from.z + (to.z - from.z) * alpha,
  };
}

function colorForTrajectory(traj) {
  if (traj.color) {
    return `rgb(${traj.color.r} ${traj.color.g} ${traj.color.b})`;
  }
  return colorForId(traj.id);
}

function colorForId(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 90% 62%)`;
}

function playerLabel(id) {
  return state.playerNames[id] || shortPlayerId(id);
}

function shortPlayerId(id) {
  const text = String(id);
  return text.length > 6 ? text.slice(0, 6) : text;
}
