import { state } from "./state.js";
import { getGameCanvasMetrics, getNetPlayerById, getPlayerBallColor } from "./engine.js";
import { normalizeVec3 } from "./utils.js";

let getCameraNode = () => null;

const COURSE_GROUND_MASK = 8;
const BALL_RADIUS = 0.34;
const STALE_TTL_MS = 5200;
const DEFAULT_GRAVITY = { x: 0, y: -9.2, z: 0 };

export function configureTrajectoryOverlay(options) {
  getCameraNode = options.getCameraNode;
}

export function recordTrajectory(id, playerState) {
  const pos = normalizeVec3(playerState?.pos);
  const packetVel = normalizeVec3(playerState?.vel);
  if (!id || !pos) return;
  const previous = state.trajectories[id];
  const now = performance.now();
  const vel = resolveObservedVelocity(previous, pos, packetVel, now);
  if (!vel || velocityMagnitude(vel) < 0.02) {
    delete state.trajectories[id];
    return;
  }
  state.trajectories[id] = {
    id,
    pos,
    vel,
    physics: resolveTrajectoryPhysics(id, previous?.physics),
    renderPos: previous?.renderPos || pos,
    renderVel: previous?.renderVel || vel,
    color: getPlayerBallColor(id) || previous?.color || null,
    measuredAt: now,
    updatedAt: now,
    drawnAt: previous?.drawnAt || now,
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
      if (id === state.localUid || now - traj.updatedAt > STALE_TTL_MS) {
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
  const color = colorForTrajectory(traj);
  const points = predictTrajectoryPoints(traj.renderPos, traj.renderVel, traj.physics);
  drawWorldLine(ctx, camera, points, color, 0.92, true, traj.id);
}

function drawWorldLine(ctx, camera, points, color, alpha, drawEndpoint, id) {
  const screenPoints = points
    .map((point) => worldToScreen(camera, point))
    .filter(Boolean);
  if (screenPoints.length < 2 || alpha <= 0) return;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
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
  if (!drawEndpoint) {
    ctx.restore();
    return;
  }
  const end = screenPoints[screenPoints.length - 1];
  ctx.beginPath();
  ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(playerLabel(id), screenPoints[0].x + 5, screenPoints[0].y - 5);
  ctx.restore();
}

function predictTrajectoryPoints(pos, vel, physics = null) {
  const spec = physics || makeDefaultTrajectoryPhysics();
  const points = [{ ...pos }];
  const steps = 58;
  const dt = clamp(Number(spec.fixedTimeStep) || 1 / 60, 1 / 120, 1 / 30);
  const radius = clamp(Number(spec.radius) || BALL_RADIUS, 0.1, 1.2);
  const groundDistance = clamp(Number(spec.groundDistanceCheck) || 2, 0.8, 8);
  const gravity = spec.gravity || DEFAULT_GRAVITY;
  const damping = Number(spec.linearDamping);
  const dampingFactor = Number.isFinite(damping)
    ? clamp(Math.exp(-Math.max(0, damping) * dt), 0.9, 1)
    : 0.987;
  let p = { ...pos };
  let v = { ...vel };
  clampVelocity(v, spec.maxSpeed);
  let idleTime = 0;
  let simTime = 0;
  let lastGround = sampleCourseGround(p, p.y + 0.5, groundDistance + 0.6);
  for (let i = 0; i < steps; i++) {
    simTime += dt;
    v.x += gravity.x * dt;
    v.y += gravity.y * dt;
    v.z += gravity.z * dt;
    v.x *= dampingFactor;
    v.z *= dampingFactor;
    v.y *= Number.isFinite(damping) ? clamp(Math.exp(-Math.max(0, damping * 0.35) * dt), 0.94, 1) : 0.995;
    clampVelocity(v, spec.maxSpeed);
    const next = {
      x: p.x + v.x * dt,
      y: p.y + v.y * dt,
      z: p.z + v.z * dt,
    };
    const ground = sampleCourseGround(next, next.y + 0.5, groundDistance + 0.8);
    if (ground) {
      lastGround = ground;
      const floorY = Number(ground.y) + radius;
      if (next.y < floorY) {
        next.y = floorY;
        if (v.y < -0.2) v.y = -v.y * 0.22;
        else v.y = 0;
        v.x *= 0.975;
        v.z *= 0.975;
      }
    } else if (lastGround && next.y < Number(lastGround.y) + radius) {
      next.y = Number(lastGround.y) + radius;
      v.y = Math.max(0, v.y);
    }
    points.push(next);
    const displacement = Math.hypot(next.x - p.x, next.y - p.y, next.z - p.z);
    idleTime = displacement <= 0.005 ? idleTime + dt : 0;
    p = next;
    if (simTime > 2 && idleTime >= 0.5) break;
    if (velocityMagnitude(v) < 0.04) break;
  }
  return points;
}

function resolveTrajectoryPhysics(id, previous = null) {
  const visual = getNetPlayerById(id)?.localState?.visual;
  const physics = window.cc?.PhysicsSystem?.instance;
  const gravity = normalizeVec3(physics?.gravity) || previous?.gravity || DEFAULT_GRAVITY;
  const collider = visual?._sphereCollider || visual?.sphereCollider || visual?.collider;
  const rigidbody = visual?._rigidbody || visual?.rigidbody;
  const scale = maxFiniteNumber(
    visual?.node?.worldScale?.x,
    visual?.node?.worldScale?.y,
    visual?.node?.worldScale?.z,
    visual?.node?.scale?.x,
    visual?.node?.scale?.y,
    visual?.node?.scale?.z,
    1,
  );
  const radius = firstFiniteNumber(
    Number(collider?.radius) * scale,
    Number(collider?._radius) * scale,
    previous?.radius,
    BALL_RADIUS,
  );
  return {
    radius: clamp(radius, 0.1, 1.2),
    gravity,
    fixedTimeStep: firstFiniteNumber(physics?.fixedTimeStep, previous?.fixedTimeStep, 1 / 60),
    linearDamping: firstFiniteNumber(
      rigidbody?.linearDamping,
      rigidbody?._linearDamping,
      visual?._linearDamping,
      previous?.linearDamping,
      null,
    ),
    maxSpeed: firstFiniteNumber(visual?.maxSpeed, visual?._maxSpeed, previous?.maxSpeed, null),
    groundDistanceCheck: firstFiniteNumber(
      visual?.groundDistanceCheck,
      visual?._groundDistanceCheck,
      previous?.groundDistanceCheck,
      2,
    ),
  };
}

function makeDefaultTrajectoryPhysics() {
  const physics = window.cc?.PhysicsSystem?.instance;
  return {
    radius: BALL_RADIUS,
    gravity: normalizeVec3(physics?.gravity) || DEFAULT_GRAVITY,
    fixedTimeStep: firstFiniteNumber(physics?.fixedTimeStep, 1 / 60),
    linearDamping: null,
    maxSpeed: null,
    groundDistanceCheck: 2,
  };
}

function resolveObservedVelocity(previous, pos, packetVel, now) {
  const measured = estimateVelocityFromDelta(previous, pos, now);
  if (packetVel && measured) {
    return {
      x: packetVel.x * 0.55 + measured.x * 0.45,
      y: packetVel.y * 0.55 + measured.y * 0.45,
      z: packetVel.z * 0.55 + measured.z * 0.45,
    };
  }
  return packetVel || measured;
}

function estimateVelocityFromDelta(previous, pos, now) {
  if (!previous?.pos || !previous?.measuredAt) return null;
  const dt = Math.max(0.04, Math.min(0.5, (now - previous.measuredAt) / 1000));
  const vel = {
    x: (pos.x - previous.pos.x) / dt,
    y: (pos.y - previous.pos.y) / dt,
    z: (pos.z - previous.pos.z) / dt,
  };
  if (![vel.x, vel.y, vel.z].every(Number.isFinite)) return null;
  if (velocityMagnitude(vel) > 80) return null;
  return vel;
}

function sampleCourseGround(point, startY = null, distance = 80) {
  const fromY = Number.isFinite(Number(startY)) ? Number(startY) : Number(point.y) + 8;
  const hit = raycastClosest(
    { x: point.x, y: fromY, z: point.z },
    { x: 0, y: -1, z: 0 },
    distance,
    COURSE_GROUND_MASK,
  );
  if (!hit?.point || !Number.isFinite(Number(hit.point.y))) return null;
  return {
    y: Number(hit.point.y),
    normal: hit.normal,
    distance: hit.distance,
  };
}

function raycastClosest(origin, direction, distance, mask = null, allowFallback = true) {
  const cc = window.cc;
  const physics = cc?.PhysicsSystem?.instance;
  if (!cc?.geometry?.Ray || !physics?.raycastClosest) return null;
  const ray = new cc.geometry.Ray(
    Number(origin.x),
    Number(origin.y),
    Number(origin.z),
    Number(direction.x),
    Number(direction.y),
    Number(direction.z),
  );
  const attempts = mask === null
    ? [[ray, undefined, distance]]
    : allowFallback
      ? [[ray, mask, distance], [ray, undefined, distance]]
      : [[ray, mask, distance]];
  for (const args of attempts) {
    try {
      const ok = args[1] === undefined
        ? physics.raycastClosest(args[0])
        : physics.raycastClosest(args[0], args[1], args[2]);
      if (!ok) continue;
      const result = physics.raycastClosestResult;
      return {
        point: normalizeVec3(result?.hitPoint),
        normal: normalizeVec3(result?.hitNormal),
        distance: Number.isFinite(Number(result?.distance)) ? Number(result.distance) : null,
        collider: result?.collider || null,
      };
    } catch (_) {}
  }
  return null;
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
  traj.physics = resolveTrajectoryPhysics(traj.id, traj.physics);
}

function clampVelocity(vel, maxSpeed) {
  const max = Number(maxSpeed);
  if (!Number.isFinite(max) || max <= 0) return;
  const mag = velocityMagnitude(vel);
  if (!Number.isFinite(mag) || mag <= max) return;
  const scale = max / mag;
  vel.x *= scale;
  vel.y *= scale;
  vel.z *= scale;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function maxFiniteNumber(...values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
