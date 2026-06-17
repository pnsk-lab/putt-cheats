import { htmlFragment, section } from "./dom.js";

export function createPlayerEffectsSection(actions) {
  const root = section("APPLY PLAYER EFFECT");
  root.appendChild(htmlFragment(`
    <div style="display:grid;grid-template-columns:1fr;gap:4px;margin-bottom:8px;">
      <select id="sel-effect-player" style="width:100%;"></select>
      <select id="sel-player-effect" style="width:100%;"></select>
    </div>
    <button id="btn-apply-player-effect" class="primary" style="width:100%;margin-bottom:12px;font-weight:900;">APPLY EFFECT</button>
  `));
  root.querySelector("#sel-effect-player").addEventListener("focus", () => actions.refreshPlayerEffectUI?.());
  root.querySelector("#btn-apply-player-effect").addEventListener("click", () => {
    actions.applyPlayerEffect?.(
      root.querySelector("#sel-effect-player").value,
      root.querySelector("#sel-player-effect").value,
    );
  });
  return root;
}
