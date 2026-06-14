#!/usr/bin/env bun

const wsUrl = process.env.CDP_WS || process.argv[2];
const mode = process.argv[3] || "snapshot";
const expressionArg = process.argv.slice(4).join(" ");

if (!wsUrl) {
  console.error("Usage: CDP_WS=ws://127.0.0.1:9222/devtools/browser/... bun scripts/cdp-putt.js [mode|expr] [expression]");
  process.exit(1);
}

let nextId = 0;
const pending = new Map();
const events = [];
const ws = new WebSocket(wsUrl);

function send(method, params = {}, sessionId = null) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    ws.send(JSON.stringify(message));
  });
}

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.method) events.push(message);
  if (!message.id || !pending.has(message.id)) return;
  const request = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
};

ws.onerror = (event) => {
  console.error(event.message || event);
  process.exit(1);
};

ws.onopen = async () => {
  try {
    const { sessionId, contextId } = await attachToGameContext();
    const expression = getExpression(mode, expressionArg);
    const result = await send(
      "Runtime.evaluate",
      { expression, contextId, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    const value = result.result?.value ?? result.result;
    console.log(JSON.stringify(value, null, 2));
    await send("Target.detachFromTarget", { sessionId }).catch(() => {});
    ws.close();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exit(1);
  }
};

async function attachToGameContext() {
  const targets = await send("Target.getTargets");
  const outer = targets.targetInfos.find(
    (target) => target.type === "iframe" && target.url.includes("945737671223947305"),
  );
  if (!outer) throw new Error("Putt Party outer iframe target not found");

  const { sessionId } = await send("Target.attachToTarget", {
    targetId: outer.targetId,
    flatten: true,
  });
  await send("Runtime.enable", {}, sessionId);
  await send("Page.enable", {}, sessionId);
  await sleep(600);

  const contexts = events
    .filter((event) => event.sessionId === sessionId && event.method === "Runtime.executionContextCreated")
    .map((event) => event.params.context);
  const inner = contexts.find(
    (context) => context.auxData?.isDefault && context.auxData?.frameId !== outer.targetId,
  );
  if (!inner) throw new Error("Putt Party inner game iframe default context not found");
  return { sessionId, contextId: inner.id };
}

function getExpression(name, expression) {
  if (name === "expr") {
    if (!expression) throw new Error("expr mode requires a JavaScript expression");
    return expression;
  }
  if (name === "deletables") {
    return `(() => {
      const arr = window.puttCheats?.listDeletables?.() || [];
      return {
        count: arr.length,
        first: arr.slice(0, 20).map((item) => ({
          name: item.name,
          key: item.key,
          id: item.id || item.targetData?.id || null,
          pos: item.worldPos || item.pos,
          virtual: Boolean(item.virtual),
        })),
      };
    })()`;
  }
  return `(() => {
    const snapshot = window.puttCheats?.debugSnapshot?.();
    const ui = document.getElementById("putt-ui");
    return {
      hasPuttCheats: Boolean(window.puttCheats),
      hasCc: Boolean(window.cc),
      hasCanvas: Boolean(document.getElementById("GameCanvas")),
      hasUi: Boolean(ui),
      uiWidth: ui ? getComputedStyle(ui).width : null,
      snapshot,
    };
  })()`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
