import { htmlFragment, section } from "./dom.js";

export function createPowerupsSection(actions) {
  const root = section("POWERUPS");
  root.appendChild(htmlFragment(`
    <div style="display:flex;gap:4px;margin-bottom:8px;">
      <select id="sel-p" style="flex:1 1 auto;min-width:0;max-width:124px;text-overflow:ellipsis;"></select>
      <input id="pu-count" value="1" title="count" style="width:36px;">
      <button id="btn-add-p" class="primary" style="flex:0 0 46px;font-weight:900;">ADD</button>
    </div>
  `));
  root.querySelector("#btn-add-p").addEventListener("click", () => {
    actions.addPowerup?.(root.querySelector("#sel-p").value);
  });
  return root;
}
