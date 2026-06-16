import { htmlFragment, section } from "./dom.js";

export function createWorldSection(actions, options: any = {}) {
  const root = section("WORLD");
  root.appendChild(htmlFragment(`
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer;user-select:none;">
      <input id="chk-traj" type="checkbox" style="margin:0;cursor:pointer;">
      <span style="font-size:11px;">Show Trajectories</span>
    </label>
    <button id="btn-resync-state" style="width:100%;margin-bottom:4px;">Resync State</button>
    <button id="btn-put-bumper" style="width:100%;margin-bottom:4px;">Place Bumper</button>
    <button id="btn-del-n" style="width:100%;">Delete Nearest Object</button>
  `));
  const trajectories = root.querySelector("#chk-traj");
  trajectories.checked = Boolean(options.getTrajectoriesEnabled?.());
  trajectories.addEventListener("change", (event) => {
    actions.setTrajectoriesEnabled?.(event.target.checked);
  });
  root.querySelector("#btn-resync-state").addEventListener("click", () => {
    actions.repairLocalState?.();
    options.updateStatus?.();
  });
  root.querySelector("#btn-put-bumper").addEventListener("click", () => actions.armPutBumper?.());
  root.querySelector("#btn-del-n").addEventListener("click", () => {
    actions.deleteNearest?.();
    options.updateStatus?.();
  });
  return root;
}
