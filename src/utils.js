export function clonePlain(obj) {
  if (!obj || typeof obj !== "object") return {};
  try {
    return structuredClone(obj);
  } catch (_) {
    return JSON.parse(JSON.stringify(obj));
  }
}

export function normalizeVec3(value) {
  const pos = cloneVec3Like(value);
  if (!pos) return null;
  return [pos.x, pos.y, pos.z].every(Number.isFinite) ? pos : null;
}

export function cloneVec3Like(value) {
  if (!value) return null;
  return { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

export function escapeAttr(value) {
  return escapeHtml(value);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function findNodeByName(root, name) {
  let result = null;
  walkScene(root, (node) => {
    if (node.name === name || node.name.includes(name)) {
      result = node;
      return true;
    }
    return false;
  });
  return result;
}

export function walkScene(node, callback) {
  if (!node) return false;
  if (callback(node)) return true;
  for (const child of node.children || []) {
    if (walkScene(child, callback)) return true;
  }
  return false;
}

export function findComponent(node, predicate) {
  if (!node) return null;
  for (const component of node.components || node._components || []) {
    if (predicate(component)) return component;
  }
  for (const child of node.children || []) {
    const found = findComponent(child, predicate);
    if (found) return found;
  }
  return null;
}
