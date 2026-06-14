import { htmlFragment, section } from "./dom.js";

export function createTeleportSection(actions) {
  const root = section("TELEPORT");
  root.appendChild(htmlFragment(`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:6px;">
      <input id="tx" placeholder="X" style="width:100%;">
      <input id="ty" placeholder="Y" style="width:100%;">
      <input id="tz" placeholder="Z" style="width:100%;">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:12px;">
      <button id="btn-sync-h">Sync Goal</button>
      <button id="btn-click-tp">Click Fill</button>
      <button id="btn-tp" class="primary" style="font-weight:900;">TELEPORT</button>
    </div>
  `));

  root.querySelector("#btn-tp").addEventListener("click", () => {
    actions.teleport?.(
      root.querySelector("#tx").value,
      root.querySelector("#ty").value,
      root.querySelector("#tz").value,
    );
  });
  root.querySelector("#btn-sync-h").addEventListener("click", () => {
    const goal = actions.getGoalPosition?.();
    if (!goal) return;
    root.querySelector("#tx").value = goal.x.toFixed(2);
    root.querySelector("#ty").value = goal.y.toFixed(2) + 10;
    root.querySelector("#tz").value = goal.z.toFixed(2);
  });
  root.querySelector("#btn-click-tp").addEventListener("click", () => {
    actions.armTeleportFill?.((pos) => {
      root.querySelector("#tx").value = pos.x.toFixed(2);
      root.querySelector("#ty").value = pos.y.toFixed(2);
      root.querySelector("#tz").value = pos.z.toFixed(2);
    });
  });
  return root;
}
