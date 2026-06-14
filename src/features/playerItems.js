import { htmlFragment, section } from "./dom.js";

export function createPlayerItemsSection(actions) {
  const root = section("REMOVE PLAYER ITEM");
  root.appendChild(htmlFragment(`
    <div style="display:grid;grid-template-columns:1fr;gap:4px;margin-bottom:8px;">
      <select id="sel-player" style="width:100%;"></select>
      <select id="sel-player-card" style="width:100%;"></select>
    </div>
    <button id="btn-remove-player-item" class="primary" style="width:100%;margin-bottom:12px;font-weight:900;">REMOVE ITEM</button>
  `));
  root.querySelector("#sel-player").addEventListener("focus", () => actions.refreshPlayerItemUI?.());
  root.querySelector("#sel-player").addEventListener("change", () => actions.refreshPlayerCardSelect?.());
  root.querySelector("#btn-remove-player-item").addEventListener("click", () => {
    actions.removePlayerItem?.(
      root.querySelector("#sel-player").value,
      root.querySelector("#sel-player-card").value,
    );
  });
  return root;
}
