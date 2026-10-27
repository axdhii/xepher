import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { robot, flash, say, poke, MODE_THINK, MODE_TALK, MODE_HAPPY, MODE_NOPE, MODE_LOVE, MODE_SURPRISED } from "./robot/state";
import { parse, slug, findProject } from "./commands";
import * as gh from "./github";
import { desktop, platform, setExpanded, openLink, speak, listen } from "./bridge";

const Scene = lazy(() => import("./robot/Scene"));

type Settings = { token: string; runner: string; mode: "local" | "cloud"; fullAccess: boolean; speakReplies: boolean };
type Line = { who: "you" | "xepher" | "error"; text: string; project?: string };

function load<T>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? "{}") };
  } catch {
    return fallback;
  }
}
// shortcut: settings (including the GitHub token) live in the app's private storage, not an OS keychain
const save = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));

export default function App() {
  const [settings, setSettings] = useState<Settings>(() =>
    load("xepher.settings", { token: "", runner: "", mode: "local", fullAccess: false, speakReplies: true }),
  );
  const [projects, setProjects] = useState<gh.Project[]>([]);
  const [current, setCurrent] = useState<string>(() => localStorage.getItem("xepher.current") ?? "");
  const [log, setLog] = useState<Line[]>(() => load<{ lines: Line[] }>("xepher.log", { lines: [] }).lines);
  const [expanded, setExpandedState] = useState(false);
  const [view, setView] = useState<"chat" | "projects" | "settings">(settings.token ? "chat" : "settings");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [listening, setListening] = useState(false);
  const [hasClaude, setHasClaude] = useState(false);
  const [hooks, setHooks] = useState(false);
  const voiceArmed = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const project = projects.find((p) => p.full_name === current);
  const runsLocally = platform === "desktop" && settings.mode === "local" && hasClaude;

  useEffect(() => save("xepher.settings", settings), [settings]);
  useEffect(() => localStorage.setItem("xepher.current", current), [current]);
  useEffect(() => {
    save("xepher.log", { lines: log.slice(-60) });
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);

  const add = (who: Line["who"], text: string) => setLog((l) => [...l, { who, text, project: project?.name }]);

  async function refresh() {
    gh.setToken(settings.token);
    if (!settings.token) return;
    try {
      const [login, list] = await Promise.all([gh.me(), gh.listProjects()]);
      setProjects(list);
      if (!settings.runner) setSettings((s) => ({ ...s, runner: `${login}/xepher` }));
      if (!list.some((p) => p.full_name === current) && list[0]) setCurrent(list[0].full_name);
    } catch (e: any) {
      add("error", e.message);
    }
  }
  useEffect(() => {
    refresh();
  }, [settings.token]);

  useEffect(() => {
    if (!desktop) return;
    desktop.hasClaude().then(setHasClaude);
    desktop.hooksInstalled().then(setHooks);
    // Claude Code sessions Aadhil runs himself in a terminal report here through hooks.
    desktop.onHookStatus(({ busy: b, text }) => {
      if (busyRef.current) return; // a Xepher job owns the robot right now
      robot.activity = b ? MODE_THINK : null;
      setStatus(b ? text : "");
      if (!b) flash(MODE_HAPPY, 1.5);
    });
    desktop.onHotkey(() => {
      expand(true);
      setTimeout(startVoice, 150);
    });
  }, []);
  const busyRef = useRef(false);
  busyRef.current = busy;

  useEffect(() => {
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
    setExpanded(on);
    poke();
  }

  async function run(textIn: string) {
    const text = textIn.trim();
    if (!text || busy) return;
    setInput("");
    add("you", text);
    robot.lastActivity = performance.now() / 1000;
    const action = parse(text);
    try {
      if (action.kind === "switch") {
        const p = findProject(projects, action.name);
        if (!p) return add("xepher", `I can't find "${action.name}". Say "create project ${action.name}" to make it.`);
        setCurrent(p.full_name);
        say(p.name);
        return add("xepher", `Switched to ${p.name}.`);
      }
      if (action.kind === "projects") {
        setView("projects");
        return expand(true);
      }
      if (action.kind === "create" || action.kind === "add") {
        const name = slug(action.name);
        if (!name) return add("error", "That name has no letters or numbers in it.");
        setBusy(true);
        setStatus(action.kind === "create" ? `Creating ${name} on GitHub…` : `Adding ${name}…`);
        robot.activity = MODE_THINK;
        const p = action.kind === "create" ? await gh.createProject(name) : await gh.addProject((await gh.me()), name);
        setProjects((ps) => [p, ...ps.filter((x) => x.full_name !== p.full_name)]);
        setCurrent(p.full_name);
        flash(MODE_LOVE, 2);
        return add("xepher", `${p.name} is ready: ${p.html_url}`);
      }
      if (action.kind === "link") {
        if (!project) return add("xepher", "Pick a project first.");
        if (action.url) {
          await gh.setLink(project.full_name, action.url);
          setProjects((ps) => ps.map((p) => (p.full_name === project.full_name ? { ...p, homepage: action.url! } : p)));
          return add("xepher", `Saved the Claude link for ${project.name}.`);
        }
        if (!project.homepage) return add("xepher", `No Claude link for ${project.name} yet. Say "set link to https://claude.ai/project/…".`);
        return openLink(project.homepage);
      }

      // Everything else is a job for Claude Code on the current project.
      if (!project) return add("xepher", "Pick or create a project first.");
      setBusy(true);
      robot.activity = MODE_THINK;
      say("ON IT", 1.2);
      setStatus("Starting…");
      let reply = "";
      if (runsLocally) {
        const sessions = load<Record<string, string>>("xepher.sessions", {});
        await desktop!.runLocal(
          { repo: project.full_name, cloneUrl: project.clone_url, prompt: text, sessionId: sessions[project.full_name], fullAccess: settings.fullAccess },
          (e) => {
            // errors reject the runLocal promise instead
            if (e.type === "status") setStatus(e.text);
            else if (e.type === "reply") {
              reply = e.text;
              if (e.sessionId) save("xepher.sessions", { ...sessions, [project.full_name]: e.sessionId });
            }
          },
        );
      } else {
        if (!settings.runner) throw new Error("Set the cloud runner repo in settings.");
        reply = await gh.runCloud(settings.runner, project, text, setStatus);
      }
      add("xepher", reply || "Done.");
      // Talk for about as long as reading the reply takes.
      robot.activity = MODE_TALK;
      if (settings.speakReplies) speak(reply || "Done");
      setTimeout(() => {
        if (robot.activity === MODE_TALK) robot.activity = null;
        flash(MODE_HAPPY, 1.5);
      }, Math.min(12000, 2500 + reply.length * 40));
    } catch (e: any) {
      robot.activity = null;
      flash(MODE_NOPE, 1.8);
      add("error", e.message ?? String(e));
    } finally {
      setBusy(false);
      setStatus("");
      if (robot.activity === MODE_THINK) robot.activity = null;
    }
  }

  async function startVoice() {
    if (listening) return;
    if (platform === "desktop") {
      // Windows voice typing writes into the focused box; we send once it goes quiet.
      inputRef.current?.focus();
      voiceArmed.current = true;
      robot.activity = MODE_SURPRISED;
      setListening(true);
      desktop!.dictate();
      return;
    }
    setListening(true);
    robot.activity = MODE_SURPRISED;
    try {
      const heard = await listen(setInput);
      robot.activity = null;
      setListening(false);
      if (heard) run(heard);
    } catch (e: any) {
      robot.activity = null;
      setListening(false);
      add("error", `Voice: ${e.message}`);
    }
  }

  // Desktop voice: once the dictated text stops changing for 2 s, send it.
  useEffect(() => {
    if (!voiceArmed.current || !input.trim()) return;
    const t = setTimeout(() => {
      voiceArmed.current = false;
      setListening(false);
      robot.activity = null;
      run(input);
    }, 2000);
    return () => clearTimeout(t);
  }, [input]);

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
      {!expanded && (busy || listening) && <div className="dot" />}
    </div>
  );

  // One tree for both states, so the robot isn't rebuilt (and rebooted) on every toggle.
  return (
    <div className={expanded ? "panel" : "bubble"}>
      <header>
        {bubble}
        {expanded && (<>
        <div className="head-text">
          <b>Xepher</b>
          <span className="status">{listening ? "Listening…" : status || (busy ? "Working…" : project ? project.name : "No project")}</span>
          <span className="where">{runsLocally ? "Runs on this laptop" : "Runs in the cloud"}</span>
        </div>
        <div className="head-buttons">
          <button title="Projects" onClick={() => setView(view === "projects" ? "chat" : "projects")}>☰</button>
          <button title="Settings" onClick={() => setView(view === "settings" ? "chat" : "settings")}>⚙</button>
          <button title="Minimise" onClick={() => expand(false)}>–</button>
        </div>
        </>)}
      </header>
      {expanded && (
      <>

      {view === "chat" && (
        <div className="log" ref={logRef}>
          {log.length === 0 && (
            <p className="hint">
              Try: “create project weather app”, “open kastay”, “add a contact form”, or tap the mic.
            </p>
          )}
          {log.map((l, i) => (
            <div key={i} className={`line ${l.who}`}>
              {l.project && l.who === "you" && <small>{l.project}</small>}
              {l.text}
            </div>
          ))}
          {busy && <div className="line xepher typing">{status || "…"}</div>}
        </div>
      )}

      {view === "projects" && (
        <div className="list">
          {projects.length === 0 && <p className="hint">No projects yet. Say “create project my app”.</p>}
          {projects.map((p) => (
            <div key={p.full_name} className={`project ${p.full_name === current ? "on" : ""}`}>
              <button className="name" onClick={() => (setCurrent(p.full_name), setView("chat"), say(p.name))}>
                {p.name}
              </button>
              {p.homepage && <button onClick={() => openLink(p.homepage!)}>Claude ↗</button>}
              <button onClick={() => openLink(p.html_url)}>GitHub ↗</button>
            </div>
          ))}
          <button className="wide" onClick={refresh}>Refresh</button>
        </div>
      )}

      {view === "settings" && (
        <div className="list settings">
          <label>
            GitHub token (classic, scopes: repo, workflow)
            <input type="password" value={settings.token} onChange={(e) => setSettings({ ...settings, token: e.target.value })} placeholder="ghp_…" />
          </label>
          <label>
            Cloud runner repo
            <input value={settings.runner} onChange={(e) => setSettings({ ...settings, runner: e.target.value })} placeholder="axdhii/xepher" />
          </label>
          {platform === "desktop" && (
            <>
              <label className="row">
                <input type="checkbox" checked={settings.mode === "local"} onChange={(e) => setSettings({ ...settings, mode: e.target.checked ? "local" : "cloud" })} />
                Run commands on this laptop {hasClaude ? "" : "(Claude Code not found, using cloud)"}
              </label>
              <label className="row">
                <input type="checkbox" checked={settings.fullAccess} onChange={(e) => setSettings({ ...settings, fullAccess: e.target.checked })} />
                Let Claude run terminal commands here without asking
              </label>
              <button className="wide" onClick={() => desktop!.installHooks().then(() => setHooks(true))} disabled={hooks}>
                {hooks ? "Showing my terminal Claude sessions ✓" : "Show my terminal Claude sessions too"}
              </button>
            </>
          )}
          <label className="row">
            <input type="checkbox" checked={settings.speakReplies} onChange={(e) => setSettings({ ...settings, speakReplies: e.target.checked })} />
            Speak replies out loud
          </label>
          <button className="wide" onClick={() => (refresh(), setView("chat"))}>Save</button>
        </div>
      )}

      <form
        className="input"
        onSubmit={(e) => {
          e.preventDefault();
          voiceArmed.current = false;
          setListening(false);
          run(input);
        }}
      >
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? "Listening…" : busy ? "Working…" : "Tell Xepher…"} />
        <button type="button" className={`mic ${listening ? "on" : ""}`} onClick={startVoice} title="Speak" aria-label="Speak">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
          </svg>
        </button>
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send">➤</button>
      </form>
      </>
      )}
    </div>
  );
}
