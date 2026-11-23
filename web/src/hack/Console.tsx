// The ops console: status bar, screen tabs, the active screen, a persistent
// terminal and the action pad. Driven by scripts.ts.
import { useEffect, useRef, useState } from "react";
import { ACTIONS, GROUPS, HELP, caught, clock, exposure, find, initial, next, selected, type Action, type Cls, type Group, type Step, type Sys } from "./scripts";
import { robot, MODE_THINK } from "../robot/state";
import { SCREENS, type ScreenId } from "./screens";

type Line = { t: string; c: Cls };
export type Alert = { t: string; sev: "low" | "med" | "high" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bar = (k: number) => `${"━".repeat(Math.round(k * 24)).padEnd(24, "─")} ${String(Math.round(k * 100)).padStart(3)}%`;

export default function Console() {
  const [sys, setSys] = useState<Sys>(initial);
  const sysRef = useRef(sys);
  sysRef.current = sys;
  const [lines, setLines] = useState<Line[]>(() => [
    { t: "helix-ops // operator console", c: "hi" },
    { t: "type 'help', or follow the 'next' hint on the pad.", c: "dim" },
  ]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [screen, setScreen] = useState<ScreenId>("ops");
  const [group, setGroup] = useState<Group>("RECON");
  const [cmd, setCmd] = useState("");
  const runId = useRef(0);
  const termRef = useRef<HTMLDivElement>(null);

  const print = (t: string, c: Cls = "") => setLines((l) => [...l.slice(-300), ...t.split("\n").map((x) => ({ t: x, c }))]);
  const alert = (t: string, sev: Alert["sev"]) => setAlerts((a) => [...a.slice(-60), { t: `${clock()}  ${t}`, sev }]);
  useEffect(() => {
    termRef.current?.scrollTo(0, termRef.current.scrollHeight); // newer Chromium returns a Promise here
  }, [lines]);

  async function play(name: string, steps: Step[]) {
    const id = ++runId.current;
    setSys((o) => ({ ...o, activity: name }));
    robot.activity = MODE_THINK;
    robot.lastActivity = performance.now() / 1000;
    for (const s of steps) {
      await sleep(s.d ?? 70);
      if (id !== runId.current) return; // interrupted by another action
      if (s.bar) {
        print(`${s.bar}  ${bar(0)}`, "bar");
        const t0 = performance.now();
        for (let k = 0; k < 1; ) {
          await sleep(70);
          if (id !== runId.current) return;
          k = Math.min(1, (performance.now() - t0) / s.ms!);
          setLines((l) => [...l.slice(0, -1), { t: `${s.bar}  ${bar(k)}`, c: "bar" }]);
        }
      }
      if (s.t !== undefined) print(s.t, s.c);
      if (s.set) setSys((o) => ({ ...o, ...s.set!(o) }));
    }
    if (id === runId.current) {
      setSys((o) => ({ ...o, activity: null }));
      robot.activity = null;
    }
  }

  function act(a: Action, echo = true) {
    if (runId.current && sysRef.current.activity) print("^C", "dim");
    if (echo) print(`${prompt(sysRef.current)} ${a.words[0]}`, "dim");
    const sev = ({ RECON: "low", ACCESS: "high", POST: "med", CRYPTO: "low", OPSEC: "low", FACILITY: "med" } as const)[a.group];
    if (a.group !== "CRYPTO" && a.group !== "OPSEC") alert(`${a.group.toLowerCase()} ${pickSrc()} → ${selected(sysRef.current).name.split(".")[0]}`, sev);
    play(a.id, a.run(sysRef.current));
  }

  function typed(text: string) {
    const t = text.trim();
    setCmd("");
    if (!t) return;
    const [w, arg] = t.toLowerCase().split(/\s+/);
    print(`${prompt(sysRef.current)} ${t}`, "cmd");
    if (w === "clear") return setLines([]);
    if (w === "help") return print(HELP.join("\n"), "dim");
    if (w === "target") {
      const h = sysRef.current.hosts.find((x) => x.ip === arg || x.name.toLowerCase().startsWith(arg ?? "-"));
      if (!h) return print(`target: unknown host '${arg ?? ""}'`, "err");
      setSys((o) => ({ ...o, target: h.ip }));
      return print(`target -> ${h.name} (${h.ip})`, "info");
    }
    if (SCREENS.some((x) => x.id === w)) return setScreen(w as ScreenId);
    const a = find(t);
    if (!a) return print(`${w}: command not found`, "err");
    act(a, false);
  }

  // F1..F8 switch screens on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = /^F(\d)$/.exec(e.key);
      const x = n && SCREENS[+n[1] - 1];
      if (x) (e.preventDefault(), setScreen(x.id));
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // Detection rises while sessions are open; the SOC's alert feed gets busier.
  useEffect(() => {
    const id = setInterval(() => {
      const s = sysRef.current;
      const detection = Math.max(0, Math.min(100, s.detection + exposure(s)));
      if (detection >= 100 && s.sessions.length) return play("caught", caught(s));
      setSys((o) => ({ ...o, detection }));
      if (Math.random() < 0.12 + s.detection / 140) alert(background(s), s.detection > 70 ? "high" : s.detection > 35 ? "med" : "low");
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const Screen = SCREENS.find((x) => x.id === screen)!.view;
  const hint = next(sys);
  const hintGroup = ACTIONS.find((a) => a.id === hint.id)?.group;
  return (
    <div className={`hack ${sys.detection > 80 ? "hot" : ""}`}>
      <Status sys={sys} />
      <nav className="tabs" role="tablist">
        {SCREENS.map((x, i) => (
          <button key={x.id} role="tab" aria-selected={screen === x.id} className={screen === x.id ? "on" : ""} onClick={() => setScreen(x.id)}>
            <span className="dim">F{i + 1}</span> {x.label}
          </button>
        ))}
      </nav>
      <section className="screen">
        <Screen sys={sys} alerts={alerts} select={(ip) => setSys((o) => ({ ...o, target: ip }))} />
      </section>
      <section className="pane term" onClick={() => document.getElementById("hack-cmd")?.focus()}>
        <h3>
          <span>tty1  {prompt(sys)}</span>
          <span className="dim">{sys.activity ? `running: ${sys.activity}` : "idle"}</span>
        </h3>
        <div className="scroll" ref={termRef}>
          {lines.map((l, i) => (
            <div key={i} className={l.c}>{l.t || " "}</div>
          ))}
        </div>
        <form onSubmit={(e) => (e.preventDefault(), typed(cmd))}>
          <span className="ok">{prompt(sys)}</span>
          <input id="hack-cmd" value={cmd} onChange={(e) => setCmd(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="Command" />
        </form>
      </section>
      <nav className="pad">
        <div className="groups">
          {GROUPS.map((g) => (
            <button key={g} className={`${group === g ? "on" : ""} ${hintGroup === g ? "hint" : ""}`} onClick={() => setGroup(g)}>{g}</button>
          ))}
        </div>
        <button
          className="next"
          disabled={!hint.id || !!sys.activity}
          onClick={() => {
            const a = ACTIONS.find((x) => x.id === hint.id)!;
            setGroup(a.group);
            act(a);
          }}
        >
          <span className="dim">next</span> <b>{hint.id ? ACTIONS.find((a) => a.id === hint.id)!.label : "—"}</b> <span>{hint.why}</span>
          <span className="dim target">target {selected(sys).name.split(".")[0]}</span>
        </button>
        <div className="actions">
          {ACTIONS.filter((a) => a.group === group).map((a) => (
            <button key={a.id} title={a.help} className={`${sys.activity === a.id ? "on" : ""} ${hint.id === a.id ? "hint" : ""}`} onClick={() => act(a)}>
              <b>{a.label}</b>
              <small>{a.help}</small>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

const prompt = (s: Sys) => {
  const sess = s.sessions.find((x) => x.ip === s.target);
  return sess ? `${sess.user.split("\\").pop()}@${sess.host}${sess.elevated ? "#" : "$"}` : "op@helix-ops:~$";
};
const pickSrc = () => `10.40.${[1, 2, 9][Math.floor(Math.random() * 3)]}.${Math.floor(Math.random() * 250) + 2}`;
const background = (s: Sys) =>
  s.detection > 60
    ? [`analyst escalated case HX-IR-${Math.floor(Math.random() * 9000) + 1000}`, "beaconing pattern matched on egress", `account lockout: ${["a.reyes", "svc_backup", "j.okafor"][Math.floor(Math.random() * 3)]}`, "threat hunt query started on all endpoints"][Math.floor(Math.random() * 4)]
    : ["scheduled vuln scan finished", "certificate renewal ok on portal", "backup job 2231 completed", "dns resolver latency normal", "patch window approved for Sunday"][Math.floor(Math.random() * 5)];

function Status({ sys }: { sys: Sys }) {
  const [t, setT] = useState(clock());
  useEffect(() => {
    const id = setInterval(() => setT(clock()), 1000);
    return () => clearInterval(id);
  }, []);
  const det = Math.round(sys.detection);
  return (
    <div className="statusbar">
      <span className={sys.tunnel ? "ok" : "dim"}>{sys.tunnel ? "● tun0" : "○ tun0"}</span>
      <span>sessions <b>{sys.sessions.length}</b></span>
      <span>owned <b>{sys.hosts.filter((h) => h.owned).length}/{sys.hosts.length}</b></span>
      <span>relays <b>{sys.hops}</b></span>
      <span className="meter">
        detect <u><i style={{ width: `${det}%` }} className={det > 70 ? "hot" : det > 35 ? "warm" : ""} /></u> {det}%
      </span>
      <span className="dim clock">{t}</span>
    </div>
  );
}
