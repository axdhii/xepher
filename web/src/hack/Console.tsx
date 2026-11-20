// The hacking machine: terminals, network map, cipher, hex dump, traffic graph,
// IDS feed and the action pad. All fake; driven by scripts.ts.
import { useEffect, useRef, useState } from "react";
import { ACTIONS, HELP, busted, find, hex, initial, ip, pick, stepsFor, traceRate, type Action, type Cls, type Flash, type Step, type Sys } from "./scripts";
import { robot, flash as faceFlash, say, MODE_THINK, MODE_HAPPY, MODE_ANGRY } from "../robot/state";
import { beep } from "../Hacker";

type Line = { t: string; c: Cls };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bar = (k: number) => `[${"#".repeat(Math.round(k * 20)).padEnd(20, ".")}] ${String(Math.round(k * 100)).padStart(3)}%`;

export default function Console({ voice, sound, speak }: { voice: boolean; sound: boolean; speak: (t: string) => void }) {
  const [sys, setSys] = useState<Sys>(initial);
  const sysRef = useRef(sys);
  sysRef.current = sys;
  const [lines, setLines] = useState<Line[]>(() => [
    { t: "XEPHER OS 6.6.6 // tty1", c: "hi" },
    { t: "type 'help' or hit a button. start with CONNECT.", c: "dim" },
  ]);
  const [ids, setIds] = useState<Line[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [fx, setFx] = useState<Flash | null>(null);
  const [cmd, setCmd] = useState("");
  const runId = useRef(0);
  const termRef = useRef<HTMLDivElement>(null);
  const opts = useRef({ voice, sound, speak });
  opts.current = { voice, sound, speak };

  const print = (t: string, c: Cls = "") => setLines((l) => [...l.slice(-250), ...t.split("\n").map((x) => ({ t: x, c }))]);
  const idsLog = (t: string, c: Cls = "") => setIds((l) => [...l.slice(-40), { t: `${new Date().toTimeString().slice(0, 8)} ${t}`, c }]);
  useEffect(() => {
    termRef.current?.scrollTo(0, termRef.current.scrollHeight); // newer Chromium returns a Promise here
  }, [lines]);

  function show(f: Flash) {
    setFx(f);
    setTimeout(() => setFx((x) => (x === f ? null : x)), f === "boom" ? 1600 : 1300);
    if (!opts.current.sound) return;
    if (f === "granted" || f === "wiped") (beep(660, 0.08), setTimeout(() => beep(990, 0.12), 90));
    else beep(f === "boom" ? 60 : 140, f === "boom" ? 0.9 : 0.35, "sawtooth");
  }

  async function play(name: string, steps: Step[], echo?: string) {
    const id = ++runId.current;
    if (running) print("^C", "dim");
    if (echo) print(echo, "cmd");
    setRunning(name);
    robot.activity = MODE_THINK;
    for (const s of steps) {
      await sleep(s.d ?? 70);
      if (id !== runId.current) return; // interrupted by another action
      if (s.bar) {
        print(`${s.bar} ${bar(0)}`, "warn");
        const t0 = performance.now();
        for (let k = 0; k < 1; k = Math.min(1, (performance.now() - t0) / s.ms!)) {
          await sleep(60);
          if (id !== runId.current) return;
          const now = Math.min(1, (performance.now() - t0) / s.ms!);
          setLines((l) => [...l.slice(0, -1), { t: `${s.bar} ${bar(now)}`, c: "warn" }]);
        }
      }
      if (s.t !== undefined) {
        print(s.t, s.c);
        if (opts.current.sound && s.t) beep(1800 + Math.random() * 400, 0.012, "square", 0.02);
      }
      if (s.set) setSys((o) => ({ ...o, ...s.set }));
      if (s.flash) show(s.flash);
      if (s.say) {
        say(s.say, 1.8);
        if (opts.current.voice) opts.current.speak(s.say);
      }
      if (s.flash === "granted" || s.flash === "wiped") faceFlash(MODE_HAPPY, 1.6);
      if (s.flash === "alert" || s.flash === "denied") faceFlash(MODE_ANGRY, 1.6);
    }
    if (id === runId.current) {
      setRunning(null);
      robot.activity = null;
    }
  }

  function act(a: Action, echo?: string) {
    if (sound) beep(1200, 0.04, "square", 0.05);
    robot.lastActivity = performance.now() / 1000;
    idsLog(...IDS[a.id](sysRef.current));
    play(a.id, stepsFor(a, sysRef.current), echo);
  }

  function typed(text: string) {
    const t = text.trim();
    setCmd("");
    if (!t) return;
    const w = t.toLowerCase().split(/\s+/)[0];
    if (w === "clear") return setLines([]);
    const echo = `${sysRef.current.connected ? (sysRef.current.root ? "root" : "www-data") + "@" + sysRef.current.host.split(".")[0] : "ghost@xepher"}:~$ ${t}`;
    if (w === "help") return (print(echo, "cmd"), print(HELP.join("\n"), "dim"));
    if (w === "whoami") return (print(echo, "cmd"), print(sysRef.current.root ? "root" : "ghost", "ok"));
    if (w === "ls") return (print(echo, "cmd"), print("exploits/  loot/  rockyou.txt  shadow.hash  vault.db.enc  burn_everything.sh", ""));
    const a = find(t);
    if (!a) return (print(echo, "cmd"), print(`bash: ${w}: command not found`, "err"), sound && beep(140, 0.15, "sawtooth"));
    print(echo, "dim");
    act(a);
  }

  // The trace closes in while connected; the IDS chatters more the louder we are.
  useEffect(() => {
    const id = setInterval(() => {
      const s = sysRef.current;
      if (s.connected) {
        const trace = Math.min(100, s.trace + traceRate(s));
        if (trace >= 100) return play("busted", busted(s));
        setSys((o) => ({ ...o, trace }));
        if (trace > 75 && Math.random() < 0.4) idsLog(`[SOC] tracing ${ip()} -> hop ${Math.ceil(trace / 12)}`, "err");
      }
      setSys((o) => ({ ...o, alert: Math.max(0, o.alert - 0.4) }));
      if (Math.random() < 0.25 + s.alert / 120) idsLog(...NOISE(s));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const alertHi = sys.alert > 70 || sys.trace > 75;
  return (
    <div className={`hack ${alertHi ? "red" : ""} ${fx === "boom" ? "boom" : ""} ${fx === "alert" || fx === "denied" ? "shake" : ""}`}>
      <Status sys={sys} running={running} />
      <section className="pane term" onClick={() => document.getElementById("hack-cmd")?.focus()}>
        <h3>TTY1 // {sys.connected ? `${sys.root ? "root" : "www-data"}@${sys.host}` : "local"}</h3>
        <div className="scroll" ref={termRef}>
          {lines.map((l, i) => (
            <div key={i} className={l.c}>{l.t || " "}</div>
          ))}
        </div>
        <form onSubmit={(e) => (e.preventDefault(), typed(cmd))}>
          <span className="ok">{sys.connected ? (sys.root ? "#" : "$") : ">"}</span>
          <input id="hack-cmd" value={cmd} onChange={(e) => setCmd(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="type a command or 'help'" aria-label="Command" />
        </form>
      </section>
      <section className="pane map">
        <h3>NET // {sys.connected ? `${sys.proxies} HOPS` : "NO CARRIER"}</h3>
        <NetMap sys={sys} />
      </section>
      <section className="pane cipher">
        <h3>VAULT // {sys.encrypted ? "AES-256 LOCKED" : "DECRYPTED"}</h3>
        <Cipher encrypted={sys.encrypted} />
      </section>
      <section className="pane hexp">
        <h3>MEM // 0x7ffd{hex(4)}</h3>
        <HexDump sys={sys} />
      </section>
      <section className="pane ids">
        <h3>IDS // {sys.host}</h3>
        <div className="scroll">
          {ids.slice(-14).map((l, i) => (
            <div key={i} className={l.c}>{l.t}</div>
          ))}
        </div>
      </section>
      <section className="pane graph">
        <h3>TRAFFIC</h3>
        <Graph load={sys.load} />
      </section>
      <nav className="pad">
        {ACTIONS.map((a) => (
          <button key={a.id} className={`${running === a.id ? "on" : ""} ${a.id === "panic" ? "danger" : ""} ${a.needs && !sys.connected ? "off" : ""}`} onClick={() => act(a)}>
            {a.label}
          </button>
        ))}
      </nav>
      {fx && fx !== "boom" && (
        <div className={`fx ${fx}`} aria-live="assertive">
          <span className="glitch" data-text={FX_TEXT[fx]}>{FX_TEXT[fx]}</span>
        </div>
      )}
    </div>
  );
}

const FX_TEXT: Record<Flash, string> = { granted: "ACCESS GRANTED", denied: "ACCESS DENIED", alert: "!! ALERT !!", wiped: "TRACKS COVERED", boom: "" };

// What the target's intrusion detection sees when we do something.
const IDS: Record<string, (s: Sys) => [string, Cls]> = {
  connect: (s) => [`sshd[${4000 + Math.floor(Math.random() * 5000)}]: Accepted password for root from ${ip()} port ${40000 + Math.floor(Math.random() * 20000)} ssh2`, "warn"],
  disconnect: () => ["sshd: pam_unix(sshd:session): session closed for user root", "dim"],
  scan: () => ["[**] ET SCAN Nmap Scripting Engine User-Agent Detected [**] [Priority: 1]", "err"],
  brute: () => ["[**] ET SCAN Potential SSH Scan OUTBOUND [**] 37 failed logins/min", "err"],
  bypass: () => ["[**] ET POLICY Fragmented IP Packet (MTU 8) [**] [Priority: 2]", "warn"],
  escalate: () => ["kernel: audit: type=1400 apparmor=\"DENIED\" operation=\"exec\" comm=\"pwn\"", "warn"],
  inject: () => ["[**] ET WEB_SERVER Possible SQL Injection Attempt UNION SELECT [**]", "err"],
  encrypt: () => ["auditd: openssl opened vault.db O_RDWR", "dim"],
  decrypt: () => ["auditd: hashcat GPU load 99% on host 'unknown'", "warn"],
  exfil: () => ["[**] ET POLICY Large Outbound Transfer to Unusual Port [**] [Priority: 1]", "err"],
  trace: () => ["icmp: time exceeded in-transit (TTL probe burst)", "dim"],
  proxy: () => [`tor: new circuit built via ${ip()}`, "dim"],
  wipe: () => ["rsyslogd: file '/var/log/auth.log' truncated, re-opening", "warn"],
  botnet: (s) => [`[**] ET DOS Possible SYN Flood against ${s.ip} [**] [Priority: 1]`, "err"],
  panic: () => ["kernel: Kernel panic - not syncing: Attempted to kill init!", "err"],
};
const NOISE = (s: Sys): [string, Cls] =>
  s.alert > 60
    ? pick<[string, Cls]>([
        [`[SOC] analyst ${pick(["jkim", "mreyes", "a.volkova", "t.okafor"])} escalated ticket INC-${hex(5)}`, "err"],
        [`fail2ban: Ban ${ip()}`, "warn"],
        ["[**] ET INFO Suspicious Outbound Activity [**]", "err"],
      ])
    : pick<[string, Cls]>([
        [`cron[${Math.floor(Math.random() * 9000)}]: (root) CMD (/usr/lib/php/sessionclean)`, "dim"],
        [`nginx: ${ip()} - - "GET /index.html HTTP/1.1" 200 ${Math.floor(Math.random() * 9000)}`, "dim"],
        ["systemd[1]: Started Daily apt download activities.", "dim"],
        [`kernel: [UFW BLOCK] IN=eth0 SRC=${ip()} DPT=23`, "dim"],
      ]);

function Status({ sys, running }: { sys: Sys; running: string | null }) {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="statusbar">
      <span className={sys.connected ? "ok" : "err"}>● {sys.connected ? "LINKED" : "OFFLINE"}</span>
      <span>{sys.connected ? `${sys.ip}` : "--.--.--.--"}</span>
      <span className={sys.root ? "ok" : ""}>{sys.root ? "UID 0" : "UID 33"}</span>
      <span>FW {sys.firewall ? "UP" : <b className="ok">DOWN</b>}</span>
      <span>PROXY {sys.proxies}</span>
      <span className="meter">TRACE <u><i style={{ width: `${sys.trace}%` }} className={sys.trace > 75 ? "hot" : ""} /></u></span>
      <span className="meter">ALERT <u><i style={{ width: `${sys.alert}%` }} className={sys.alert > 70 ? "hot" : ""} /></u></span>
      <span>LOOT {sys.loot >= 1024 ? `${(sys.loot / 1024).toFixed(1)} GB` : `${sys.loot} MB`}</span>
      <span className="dim">{running ? `PID ${4000 + running.length * 97} ${running}` : "IDLE"}</span>
      <span>{clock.toTimeString().slice(0, 8)}</span>
    </div>
  );
}

// Route from us through the proxies to the target, with packets and a red trace creeping back.
function NetMap({ sys }: { sys: Sys }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const s = useRef(sys);
  s.current = sys;
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const seeds = Array.from({ length: 12 }, () => Math.random());
    let raf = 0;
    const draw = (ms: number) => {
      const w = (c.width = c.clientWidth * 2), h = (c.height = c.clientHeight * 2);
      const st = s.current;
      ctx.clearRect(0, 0, w, h);
      // faint grid
      ctx.strokeStyle = "rgba(57,255,20,0.07)";
      for (let x = 0; x < w; x += 24) (ctx.beginPath(), ctx.moveTo(x, 0), ctx.lineTo(x, h), ctx.stroke());
      for (let y = 0; y < h; y += 24) (ctx.beginPath(), ctx.moveTo(0, y), ctx.lineTo(w, y), ctx.stroke());
      const n = st.connected ? st.proxies + 2 : 1;
      const pts = Array.from({ length: n }, (_, i) => ({
        x: n === 1 ? w * 0.12 : w * (0.1 + (0.8 * i) / (n - 1)),
        y: h * (0.5 + (i && i < n - 1 ? (seeds[i] - 0.5) * 0.6 : 0)),
      }));
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(57,255,20,0.45)";
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      const along = (k: number) => {
        const f = k * (n - 1), i = Math.min(n - 2, Math.floor(f)), r = f - i;
        return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * r, y: pts[i].y + (pts[i + 1].y - pts[i].y) * r };
      };
      if (n > 1) {
        // packets
        const count = 3 + Math.round(st.load * 10);
        for (let j = 0; j < count; j++) {
          const p = along(((ms / 1400) * (0.6 + st.load) + j / count) % 1);
          ctx.fillStyle = "#b6ff9e";
          ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
        }
        // trace creeping back from the target
        if (st.trace > 0) {
          ctx.strokeStyle = "#ff3b3b";
          ctx.lineWidth = 4;
          ctx.beginPath();
          const steps = 30;
          for (let j = 0; j <= steps; j++) {
            const p = along(1 - (st.trace / 100) * (j / steps));
            j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
          }
          ctx.stroke();
        }
      }
      ctx.font = "20px monospace";
      pts.forEach((p, i) => {
        const target = n > 1 && i === n - 1;
        ctx.fillStyle = target ? "#ff3b3b" : "#39ff14";
        ctx.beginPath();
        ctx.arc(p.x, p.y, i === 0 || target ? 9 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(i === 0 ? "YOU" : target ? "TARGET" : `P${i}`, target ? p.x - 70 : p.x - 16, p.y - 16);
      });
      if (n === 1) {
        ctx.fillStyle = Math.floor(ms / 600) % 2 ? "#39ff14" : "transparent";
        ctx.fillText("NO CARRIER", w * 0.42, h * 0.52);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} aria-hidden />;
}

const PLAIN = "CLASSIFIED // EYES ONLY\nPROJECT: XEPHER\nLAUNCH CODE: 7-ALPHA-3-NINER\nOWNER: AADHIL\nSTATUS: ACTIVE";
const GLYPHS = "!@#$%^&*<>?/\\|{}[]0123456789ABCDEFabcdef=+~";

// Text that scrambles into ciphertext or resolves into plaintext, one character at a time.
function Cipher({ encrypted }: { encrypted: boolean }) {
  const [out, setOut] = useState("");
  const st = useRef({ flipAt: [] as number[], cipher: "" });
  useEffect(() => {
    const now = performance.now();
    st.current.flipAt = Array.from(PLAIN, () => now + Math.random() * 1800);
    st.current.cipher = Array.from(PLAIN, (ch) => (ch === "\n" ? ch : pick(GLYPHS))).join("");
    const id = setInterval(() => {
      const t = performance.now();
      const { flipAt, cipher } = st.current;
      setOut(
        Array.from(PLAIN, (ch, i) => {
          if (ch === "\n") return ch;
          if (t < flipAt[i]) return pick(GLYPHS);
          return encrypted ? (Math.random() < 0.03 ? pick(GLYPHS) : cipher[i]) : ch;
        }).join(""),
      );
    }, 60);
    return () => clearInterval(id);
  }, [encrypted]);
  return <pre className={encrypted ? "dim" : "ok"}>{out}</pre>;
}

const DUMP = "root:$6$xK9f$Jd8a...:19700:0:99999:7:::\nadmin:x:1000:1000:sysadmin:/home/admin:/bin/bash\nINSERT INTO payments VALUES (4417,'VISA',****1337);\nAWS_SECRET=wJalrXUtnFEMI/K7MDENG/bPxRfiCY\n";

function HexDump({ sys }: { sys: Sys }) {
  const [rows, setRows] = useState<string[]>([]);
  const s = useRef({ sys, off: 0x4000 });
  s.current.sys = sys;
  useEffect(() => {
    const id = setInterval(() => {
      const r = s.current;
      const bytes = Array.from({ length: 8 }, (_, i) => (r.sys.encrypted ? Math.floor(Math.random() * 256) : DUMP.charCodeAt((r.off + i) % DUMP.length)));
      const row = `${r.off.toString(16).padStart(8, "0")}  ${bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")}  ${bytes.map((b) => (b > 31 && b < 127 ? String.fromCharCode(b) : ".")).join("")}`;
      r.off += 8;
      setRows((x) => [...x.slice(-9), row]);
    }, 160 - s.current.sys.load * 100);
    return () => clearInterval(id);
  }, [sys.load > 0.7]);
  return <pre>{rows.join("\n")}</pre>;
}

function Graph({ load }: { load: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const l = useRef(load);
  l.current = load;
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const vals: number[] = Array(60).fill(0.1);
    const id = setInterval(() => {
      const w = (c.width = c.clientWidth * 2), h = (c.height = c.clientHeight * 2);
      vals.push(Math.min(1, l.current * (0.7 + Math.random() * 0.5)));
      vals.shift();
      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      vals.forEach((v, i) => ctx.lineTo((i / (vals.length - 1)) * w, h - v * (h - 24) - 4));
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fillStyle = l.current > 0.8 ? "rgba(255,59,59,0.25)" : "rgba(57,255,20,0.18)";
      ctx.fill();
      ctx.strokeStyle = l.current > 0.8 ? "#ff3b3b" : "#39ff14";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#39ff14";
      ctx.font = "20px monospace";
      ctx.fillText(`${Math.round(vals[vals.length - 1] * 940)} Mb/s`, 8, 22);
    }, 200);
    return () => clearInterval(id);
  }, []);
  return <canvas ref={ref} aria-hidden />;
}
