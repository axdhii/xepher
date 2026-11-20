import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { robot, poke } from "./robot/state";
import * as gh from "./github";
import { desktop, android, platform, setExpanded, speak } from "./bridge";
import { MatrixRain, Breach } from "./Hacker";

const Scene = lazy(() => import("./robot/Scene"));
const Console = lazy(() => import("./hack/Console"));

// The GitHub token is only for updates: the repo is private.
type Settings = { token: string; runner: string; voice: boolean; sound: boolean };

function load<T>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? "{}") };
  } catch {
    return fallback;
  }
}
// shortcut: the GitHub token lives in the app's private storage, not an OS keychain
const save = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => load("xepher.settings", { token: "", runner: "axdhii/xepher", voice: true, sound: true }));
  const [expanded, setExpandedState] = useState(false);
  const [breach, setBreach] = useState(false);
  const [cfg, setCfg] = useState(false);
  const [update, setUpdate] = useState<{ text: string; install?: () => void } | null>(null);

  useEffect(() => save("xepher.settings", settings), [settings]);

  // Updates: Windows downloads in the background and asks to restart; Android asks
  // to install (Android always shows its own "Update this app?" confirmation).
  useEffect(() => {
    if (!settings.token || !settings.runner) return;
    gh.setToken(settings.token);
    const check = async () => {
      if (desktop) return desktop.checkUpdates(settings.runner, settings.token);
      if (!android) return;
      try {
        const r = await gh.latestRelease(settings.runner);
        if (r.apkUrl && r.build > android.version())
          setUpdate({
            text: `Xepher ${r.version} is out`,
            install: () => {
              setUpdate({ text: "Downloading the update…" });
              android!.installUpdate(r.apkUrl!, settings.token);
            },
          });
      } catch {} // offline or no release yet: try again next time
    };
    check();
    const id = setInterval(check, 6 * 3600_000);
    return () => clearInterval(id);
  }, [settings.token, settings.runner]);
  useEffect(() => {
    desktop?.onUpdateReady((v) => setUpdate({ text: `Xepher ${v} is ready`, install: () => desktop!.installUpdate() }));
    window.__xepherUpdate = (text) => setUpdate({ text });
    desktop?.onHotkey(() => expand(true));
    window.__xepherBack = () => expand(false);
    window.__xepherFly = (on, dir) => {
      robot.flying = on;
      robot.flyDir = dir;
    };
  }, []);

  // Track the pointer so the robot's eyes follow it.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      robot.pointer.x = (e.clientX / innerWidth) * 2 - 1;
      robot.pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    };
    addEventListener("pointermove", move);
    return () => removeEventListener("pointermove", move);
  }, []);

  function expand(on: boolean) {
    setExpandedState(on);
    setBreach(on);
    setExpanded(on);
    poke();
  }

  // --- dragging the bubble (desktop; Android moves its window natively) ---
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (platform !== "desktop") return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.screenX, y: e.screenY, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.screenX - d.x;
    const dy = e.screenY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    robot.flying = true;
    if (dx) robot.flyDir = Math.sign(dx);
    desktop!.moveBy(dx, dy);
    d.x = e.screenX;
    d.y = e.screenY;
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    robot.flying = false;
    if (d?.moved) return;
    if (!expanded) expand(true);
    else poke();
  };
  // Android passes taps through as clicks.
  const onClick = () => {
    if (platform === "desktop") return;
    if (!expanded) expand(true);
    else poke();
  };

  const bubble = (
    <div className={`robot ${expanded ? "small" : ""}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onClick={onClick}>
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
      {!expanded && update?.install && <div className="dot" />}
    </div>
  );

  // One tree for both states, so the robot isn't rebuilt (and rebooted) on every toggle.
  return (
    <div className={expanded ? "panel" : "bubble"}>
      <header>
        {bubble}
        {expanded && (
          <>
            <div className="head-text">
              <b className="glitch" data-text="XEPHER//ROOT">XEPHER//ROOT</b>
              <span className="where">intrusion suite v6.6.6</span>
            </div>
            <div className="head-buttons">
              <button title="Settings" aria-label="Settings" onClick={() => setCfg(!cfg)}>CFG</button>
              <button title="Minimise" aria-label="Minimise" onClick={() => expand(false)}>×</button>
            </div>
          </>
        )}
      </header>
      {expanded && (
        <>
          <MatrixRain />
          <div className="crt" aria-hidden />
          {update && (
            <div className="update">
              <span>{update.text}</span>
              {update.install && <button className="primary" onClick={update.install}>{platform === "desktop" ? "Restart to update" : "Update"}</button>}
              <button aria-label="Dismiss" onClick={() => setUpdate(null)}>✕</button>
            </div>
          )}
          {cfg ? (
            <div className="list settings">
              <label>
                GitHub token (for updates; classic, scope: repo)
                <input type="password" value={settings.token} onChange={(e) => setSettings({ ...settings, token: e.target.value })} placeholder="ghp_…" />
              </label>
              <label>
                Update from repo
                <input value={settings.runner} onChange={(e) => setSettings({ ...settings, runner: e.target.value })} placeholder="axdhii/xepher" />
              </label>
              <label className="row">
                <input type="checkbox" checked={settings.sound} onChange={(e) => setSettings({ ...settings, sound: e.target.checked })} />
                Beeps and alarms
              </label>
              <label className="row">
                <input type="checkbox" checked={settings.voice} onChange={(e) => setSettings({ ...settings, voice: e.target.checked })} />
                Robot voice ("access granted")
              </label>
              <button className="wide" onClick={() => setCfg(false)}>[ SAVE CONFIG ]</button>
            </div>
          ) : (
            <Suspense fallback={null}>
              <Console voice={settings.voice} sound={settings.sound} speak={speak} />
            </Suspense>
          )}
          {breach && <Breach onDone={() => setBreach(false)} />}
        </>
      )}
    </div>
  );
}
