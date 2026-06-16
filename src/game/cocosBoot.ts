import { state, log } from "../state.js";

type CocosReadyCallback = (engine: any) => void;

export function installSystemHook(onReady: CocosReadyCallback) {
  if (state.systemHookInstalled) return;
  state.systemHookInstalled = true;

  const wrapSystem = (system) => {
    if (!system || system.__puttSystemHooked || typeof system.import !== "function") {
      return system;
    }
    system.__puttSystemHooked = true;
    const nativeImport = system.import.bind(system);
    system.import = function patchedSystemImport(specifier, ...args) {
      const result = nativeImport(specifier, ...args);
      if (specifier === "cc") {
        result.then((engine) => hookCocosBoot(engine, onReady));
      }
      return result;
    };
    return system;
  };

  if (window.System) {
    wrapSystem(window.System);
    if (window.cc?.game) hookCocosBoot(window.cc, onReady);
    return;
  }

  let systemValue;
  Object.defineProperty(window, "System", {
    configurable: true,
    get() {
      return systemValue;
    },
    set(value) {
      systemValue = wrapSystem(value);
      if (window.cc?.game) hookCocosBoot(window.cc, onReady);
    },
  });
}

function hookCocosBoot(engine, onReady: CocosReadyCallback) {
  if (!engine?.game || engine.game.__puttBootHooked) return;
  engine.game.__puttBootHooked = true;
  const show = () => {
    window.cc = window.cc || engine;
    onReady(engine);
  };
  try {
    engine.game.onPostSubsystemInitDelegate?.add?.(show);
    engine.game.onPostBaseInitDelegate?.add?.(show);
  } catch (e) {
    log("[putt:WARN] failed to hook cocos boot", e);
  }
  if (document.body && engine.director) show();
}

