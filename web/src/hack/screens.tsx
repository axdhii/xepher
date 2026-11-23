// The switchable screens. Each reads the simulated world; none of it is real.
import { useEffect, useRef, useState } from "react";
import { DOORS, ip, pick, rnd, selected, zoneName, type Sys } from "./scripts";
import type { Alert } from "./Console";

type Props = { sys: Sys; alerts: Alert[]; select: (ip: string) => void };
export type ScreenId = "ops" | "recon" | "intel" | "pcap" | "crack" | "sessions" | "crypto" | "facility";
export const SCREENS: { id: ScreenId; label: string; view: (p: Props) => React.ReactNode }[] = [
  { id: "ops", label: "OPS", view: Ops },
  { id: "recon", label: "RECON", view: Recon },
  { id: "intel", label: "INTEL", view: Intel },
  { id: "pcap", label: "PCAP", view: Pcap },
  { id: "crack", label: "CRACK", view: Crack },
  { id: "sessions", label: "SESSIONS", view: Sessions },
  { id: "crypto", label: "CRYPTO", view: Crypto },
  { id: "facility", label: "FACILITY", view: Facility },
];

// One line per screen for the helpbook.
export const SCREEN_HELP: Record<ScreenId, string> = {
  ops: "The big picture: a map of the hosts you can reach, the security team's live alert feed, and how much data is leaving on the tunnel.",
  recon: "Every host you know and its details. Tap a row to make it your target; most actions act on the target.",
  intel: "People and inboxes. The staff directory (OSINT) and mailboxes (MAIL) feed PHISH, BADGE and the story; wireless networks come from WIFI.",
  pcap: "A live packet capture, like Wireshark. It gets busy while an action runs. Pure show, nothing to do here.",
  crack: "The password-cracking rig. Records you HARVEST land here; CRACK recovers them and the GPU meters light up.",
  sessions: "The machines you control and the files you have pulled out. Tap a session to target that host.",
  crypto: "A vault you can seal and open, its key material, and a live memory dump. ENCRYPT / DECRYPT flip it.",
  facility: "The building itself: six camera feeds you can loop, the doors you can open with a cloned badge, lighting, and the rooftop uplink.",
};

// Repaints a canvas on an interval with the latest props.
function useCanvas<T>(data: T, ms: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number, d: T, t: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const d = useRef(data);
  d.current = data;
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const id = setInterval(() => {
      const w = (c.width = c.clientWidth * 2);
      const h = (c.height = c.clientHeight * 2);
      ctx.clearRect(0, 0, w, h);
      draw(ctx, w, h, d.current, performance.now());
    }, ms);
    return () => clearInterval(id);
  }, []);
  return ref;
}

const C = { line: "rgba(126,226,168,0.35)", fg: "#7ee2a8", dim: "#46624f", red: "#f05d5e", amber: "#e3b341", cyan: "#5ec8f0" };

// ---------------- OPS: topology, alert feed, traffic ----------------
function Ops({ sys, alerts }: Props) {
  return (
    <div className="grid ops">
      <Pane title={`topology // ${sys.zones + 1} zones reachable`} className="topo">
        <Topology sys={sys} />
      </Pane>
      <Pane title="helix soc // alert feed" className="feed">
        <Feed alerts={alerts} />
      </Pane>
      <Pane title="egress tun0" className="traffic">
        <Traffic sys={sys} />
      </Pane>
    </div>
  );
}

function Topology({ sys }: { sys: Sys }) {
  const ref = useCanvas(sys, 80, (ctx, w, h, s, t) => {
    ctx.font = "19px ui-monospace, monospace";
    const cols = [0.07, 0.3, 0.55, 0.8];
    const me = { x: w * 0.03 + 10, y: h / 2 };
    // zone columns
    [0, 1, 2, 3].forEach((z) => {
      if (z >= s.zones + 1) return;
      ctx.fillStyle = "rgba(126,226,168,0.05)";
      ctx.fillRect(w * cols[z] + 20, 6, w * 0.2, h - 12);
      ctx.fillStyle = C.dim;
      ctx.fillText(zoneName(z).split(" ")[0], w * cols[z] + 28, 28);
    });
    const pos = new Map<string, { x: number; y: number }>();
    [0, 1, 2, 3].forEach((z) => {
      const hs = s.hosts.filter((x) => x.zone === z);
      hs.forEach((x, i) => pos.set(x.ip, { x: w * cols[z] + 20 + w * 0.1, y: (h * (i + 1)) / (hs.length + 1) }));
    });
    // links: me -> edge -> zone hosts
    const edge = pos.get(s.hosts[0].ip)!;
    const link = (a: { x: number; y: number }, b: { x: number; y: number }, hot: boolean) => {
      ctx.strokeStyle = hot ? C.fg : C.line;
      ctx.lineWidth = hot ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (hot) {
        const k = ((t / 900) % 1);
        ctx.fillStyle = C.cyan;
        ctx.fillRect(a.x + (b.x - a.x) * k - 3, a.y + (b.y - a.y) * k - 3, 6, 6);
      }
    };
    link(me, edge, s.tunnel || s.sessions.length > 0);
    s.hosts.slice(1).forEach((x) => {
      const parent = s.hosts.find((p) => p.zone === x.zone - 1 && p.owned) ?? s.hosts.find((p) => p.zone === x.zone - 1) ?? s.hosts[0];
      link(pos.get(parent.ip)!, pos.get(x.ip)!, x.owned);
    });
    // nodes
    ctx.fillStyle = C.cyan;
    ctx.fillRect(me.x - 7, me.y - 7, 14, 14);
    ctx.fillText(`op${s.hops ? ` +${s.hops}` : ""}`, me.x - 10, me.y - 16);
    s.hosts.forEach((x) => {
      const p = pos.get(x.ip)!;
      const sel = x.ip === s.target;
      ctx.strokeStyle = x.owned ? C.red : C.fg;
      ctx.fillStyle = x.owned ? "rgba(240,93,94,0.35)" : "#0c1012";
      ctx.lineWidth = sel ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, sel ? 11 : 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = sel ? "#e8fff0" : C.fg;
      ctx.fillText(x.name.split(".")[0], p.x + 14, p.y + 6);
    });
  });
  return <canvas ref={ref} aria-label="Network topology" />;
}

function Feed({ alerts }: { alerts: Alert[] }) {
  return (
    <div className="rows bottom">
      {alerts.slice(-30).map((a, i) => (
        <div key={i} className={a.sev === "high" ? "err" : a.sev === "med" ? "warn" : "dim"}>
          <span className="sev">{a.sev}</span>{a.t}
        </div>
      ))}
    </div>
  );
}

function Traffic({ sys }: { sys: Sys }) {
  const vals = useRef<number[]>(Array(80).fill(0.05));
  const ref = useCanvas(sys, 200, (ctx, w, h, s) => {
    const base = s.activity === "exfil" ? 0.85 : s.activity ? 0.35 : s.sessions.length ? 0.12 : 0.04;
    vals.current.push(Math.min(1, base * (0.6 + Math.random() * 0.7)));
    vals.current.shift();
    const v = vals.current;
    ctx.beginPath();
    v.forEach((y, i) => ctx.lineTo((i / (v.length - 1)) * w, h - y * (h - 30) - 2));
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fillStyle = "rgba(126,226,168,0.12)";
    ctx.fill();
    ctx.strokeStyle = C.fg;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = C.fg;
    ctx.font = "19px ui-monospace, monospace";
    ctx.fillText(`${(v[v.length - 1] * 412).toFixed(1)} Mbit/s`, 8, 24);
  });
  return <canvas ref={ref} aria-label="Traffic graph" />;
}

// ---------------- RECON: host table + detail ----------------
function Recon({ sys, select }: Props) {
  const h = selected(sys);
  return (
    <div className="grid recon">
      <Pane title={`hosts // ${sys.hosts.length} known`} className="hosts">
        <table>
          <thead>
            <tr><th>ip</th><th>name</th><th>os</th><th>svc</th><th>state</th></tr>
          </thead>
          <tbody>
            {sys.hosts.map((x) => (
              <tr key={x.ip} className={x.ip === sys.target ? "sel" : ""} onClick={() => select(x.ip)}>
                <td>{x.ip}</td>
                <td>{x.name.split(".")[0]}</td>
                <td className="dim">{x.services.length ? x.os : "?"}</td>
                <td>{x.services.length || "-"}</td>
                <td className={x.owned ? "err" : x.findings.length ? "warn" : "dim"}>{x.owned ? "OWNED" : x.findings.length ? "VULN" : "seen"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Pane>
      <Pane title={`detail // ${h.name}`} className="detail">
        <div className="rows">
          <div><span className="dim">address   </span>{h.ip}</div>
          <div><span className="dim">zone      </span>{zoneName(h.zone)}</div>
          <div><span className="dim">os        </span>{h.services.length ? h.os : "unknown (PROBE)"}</div>
          <div className="dim">services</div>
          {h.services.length ? h.services.map((x) => <div key={x}>  {x}</div>) : <div className="dim">  none probed</div>}
          <div className="dim">findings</div>
          {h.findings.length ? h.findings.map((x) => <div key={x} className="err">  {x}</div>) : <div className="dim">  none (AUDIT)</div>}
          <div className="dim">tap a row to target it</div>
        </div>
      </Pane>
    </div>
  );
}

// ---------------- PCAP: live capture ----------------
type Pkt = { n: number; t: string; src: string; dst: string; proto: string; len: number; info: string };
function Pcap({ sys }: Props) {
  const [rows, setRows] = useState<Pkt[]>([]);
  const s = useRef(sys);
  s.current = sys;
  useEffect(() => {
    let n = 0;
    const t0 = performance.now();
    const id = setInterval(() => {
      const st = s.current;
      const tgt = selected(st).ip;
      const me = "10.99.0.7";
      const burst = st.activity ? rnd(2, 4) : 1;
      const add: Pkt[] = [];
      for (let i = 0; i < burst; i++) {
        n++;
        const t = ((performance.now() - t0) / 1000 + i * 0.000173).toFixed(6);
        const a = st.activity;
        let p: Omit<Pkt, "n" | "t">;
        if (a === "sweep") p = { src: me, dst: `10.40.${st.zones > 2 ? 2 : 1}.${rnd(1, 254)}`, proto: "ICMP", len: 42, info: "Echo (ping) request" };
        else if (a === "probe") p = Math.random() < 0.7 ? { src: me, dst: tgt, proto: "TCP", len: 58, info: `${rnd(40000, 60000)} → ${rnd(1, 65535)} [SYN] Seq=0 Win=1024` } : { src: tgt, dst: me, proto: "TCP", len: 54, info: `${rnd(1, 9000)} → ${rnd(40000, 60000)} [RST, ACK]` };
        else if (a === "exfil") p = { src: tgt, dst: me, proto: "GWIRE", len: 1380, info: `Data seq=${rnd(1e5, 9e5)} [encrypted]` };
        else if (a === "spray") p = { src: me, dst: tgt, proto: "AUTH", len: rnd(180, 420), info: "Login request (redacted)" };
        else if (a) p = { src: Math.random() < 0.5 ? me : tgt, dst: Math.random() < 0.5 ? tgt : me, proto: pick(["TCP", "GWIRE", "TLSv1.3"]), len: rnd(60, 1380), info: "Application Data" };
        else p = pick([
          { src: `10.40.2.${rnd(10, 60)}`, dst: "10.40.2.10", proto: "DNS", len: 74, info: `Standard query A ${pick(["intranet", "files02", "ledger-db", "mailhub"])}.helix.local` },
          { src: "10.40.1.1", dst: "ff:ff:ff:ff:ff:ff", proto: "ARP", len: 42, info: `Who has 10.40.1.${rnd(2, 40)}? Tell 10.40.1.1` },
          { src: `10.40.2.${rnd(40, 60)}`, dst: ip(), proto: "TLSv1.3", len: rnd(90, 1500), info: "Application Data" },
          { src: "10.40.1.5", dst: "10.40.1.1", proto: "NTP", len: 90, info: "NTP Version 4, client" },
        ]);
        add.push({ n, t, ...p });
      }
      setRows((r) => [...r.slice(-80), ...add]);
    }, 160);
    return () => clearInterval(id);
  }, []);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo(0, ref.current.scrollHeight);
  }, [rows]);
  return (
    <div className="grid single">
      <Pane title={`capture // tun0 // ${rows.length ? rows[rows.length - 1].n : 0} packets`} className="pcap">
        <div className="tablewrap" ref={ref}>
          <table>
            <thead>
              <tr><th>no.</th><th>time</th><th>source</th><th>destination</th><th>proto</th><th>len</th><th>info</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.n} className={`p-${p.proto.replace(/\W/g, "").toLowerCase()}`}>
                  <td className="dim">{p.n}</td><td className="dim">{p.t}</td><td>{p.src}</td><td>{p.dst}</td><td>{p.proto}</td><td>{p.len}</td><td>{p.info}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Pane>
    </div>
  );
}

// ---------------- CRACK: GPU board + queue ----------------
function Crack({ sys }: Props) {
  const busy = sys.activity === "crack";
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, []);
  const gpu = (i: number) => ({
    temp: busy ? 71 + ((tick + i * 3) % 9) : 38 + i,
    fan: busy ? 78 + ((tick * 7 + i) % 15) : 30,
    util: busy ? 97 + ((tick + i) % 3) : 0,
    speed: busy ? (41.2 + ((tick * 13 + i * 7) % 40) / 10).toFixed(1) : "0.0",
  });
  const rec = sys.records.filter((r) => r.recovered).length;
  return (
    <div className="grid crack">
      <Pane title="cipherforge 7.0 // status" className="board">
        <div className="rows">
          <div><span className="dim">Session........: </span>ops-{sys.keyId.slice(0, 6)}</div>
          <div><span className="dim">Status.........: </span><span className={busy ? "warn" : "dim"}>{busy ? "Running" : sys.records.length ? "Paused" : "Idle"}</span></div>
          <div><span className="dim">Mode...........: </span>hybrid (wordlist + deep64 rules)</div>
          <div><span className="dim">Queue..........: </span>{sys.records.length} records</div>
          <div><span className="dim">Recovered......: </span>{rec}/{sys.records.length} ({sys.records.length ? Math.round((rec / sys.records.length) * 100) : 0}%)</div>
          <div><span className="dim">Keyspace.......: </span>{busy ? `${((tick * 3.7) % 100).toFixed(2)}%` : "-"}</div>
          {[0, 1].map((i) => {
            const g = gpu(i);
            return (
              <div key={i} className="gpu">
                <span className="dim">Device #{i + 1}......: </span>XG-9000 48GB  {g.speed} GH/s
                <span className="meter"><u><i style={{ width: `${g.util}%` }} /></u></span>
                <span className={g.temp > 75 ? "warn" : "dim"}> {g.temp}°C fan {g.fan}%</span>
              </div>
            );
          })}
        </div>
      </Pane>
      <Pane title="records" className="records">
        <table>
          <thead>
            <tr><th>account</th><th>host</th><th>digest</th><th>state</th></tr>
          </thead>
          <tbody>
            {sys.records.length === 0 && (
              <tr><td colSpan={4} className="dim">empty. HARVEST from an elevated session.</td></tr>
            )}
            {sys.records.map((r) => (
              <tr key={r.id}>
                <td>{r.label}</td><td className="dim">{r.host}</td><td className="dim">{r.digest.slice(0, 16)}…</td>
                <td className={r.recovered ? "ok" : "dim"}>{r.recovered ? "recovered" : "queued"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Pane>
    </div>
  );
}

// ---------------- SESSIONS: implants + loot ----------------
function Sessions({ sys, select }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const ago = (ms: number) => {
    const s = Math.floor((Date.now() - ms) / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
  };
  return (
    <div className="grid sessions">
      <Pane title={`sessions // ${sys.sessions.length} active`} className="sess">
        <table>
          <thead>
            <tr><th>id</th><th>host</th><th>user</th><th>priv</th><th>anchor</th><th>up</th></tr>
          </thead>
          <tbody>
            {sys.sessions.length === 0 && (
              <tr><td colSpan={6} className="dim">no sessions. RECON → PROBE → AUDIT → BREACH.</td></tr>
            )}
            {sys.sessions.map((x) => (
              <tr key={x.id} className={x.ip === sys.target ? "sel" : ""} onClick={() => select(x.ip)}>
                <td>{x.id}</td><td>{x.host}</td><td>{x.user}</td>
                <td className={x.elevated ? "err" : "dim"}>{x.elevated ? "high" : "med"}</td>
                <td className={x.anchored ? "ok" : "dim"}>{x.anchored ? "yes" : "no"}</td>
                <td className="dim">{ago(x.opened)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Pane>
      <Pane title={`loot // ${sys.loot.reduce((a, l) => a + l.size, 0)} MB`} className="loot">
        <div className="rows">
          {sys.loot.length === 0 && <div className="dim">nothing pulled yet (EXFIL)</div>}
          {sys.loot.map((l) => (
            <div key={l.name}><span className="dim">{String(l.size).padStart(5)} MB  </span>{l.name}</div>
          ))}
        </div>
      </Pane>
    </div>
  );
}

// ---------------- CRYPTO: vault + key material + memory ----------------
const PLAIN = "HELIX DYNAMICS // RESTRICTED\nproject.......: ORBITAL-9\nuplink key....: 7A3F-99C1-0E52\nbudget........: 41.7M\nowner.........: board-sec";
const GLYPHS = "0123456789ABCDEFabcdef+/=";
function Crypto({ sys }: Props) {
  return (
    <div className="grid crypto">
      <Pane title={`vault // ${sys.sealed ? "sealed" : "open"}`} className="vault">
        <Cipher sealed={sys.sealed} />
      </Pane>
      <Pane title="key material" className="keys">
        <div className="rows">
          <div><span className="dim">key id  </span>{sys.keyId}</div>
          <div><span className="dim">aead    </span>xchacha20-poly1305</div>
          <div><span className="dim">nonce   </span>{sys.keyId.slice(0, 12)}{sys.keyId.slice(4, 16)}</div>
          <div><span className="dim">tag     </span>{sys.keyId.split("").reverse().join("")}</div>
          <div><span className="dim">shares  </span>3 of 5 required</div>
        </div>
      </Pane>
      <Pane title="memory" className="mem">
        <HexDump sealed={sys.sealed} />
      </Pane>
    </div>
  );
}

function Cipher({ sealed }: { sealed: boolean }) {
  const [out, setOut] = useState("");
  useEffect(() => {
    const t0 = performance.now();
    const flip = Array.from(PLAIN, () => t0 + Math.random() * 1600);
    const cipher = Array.from(PLAIN, (ch) => (ch === "\n" ? ch : pick(GLYPHS))).join("");
    const id = setInterval(() => {
      const t = performance.now();
      setOut(Array.from(PLAIN, (ch, i) => (ch === "\n" ? ch : t < flip[i] ? pick(GLYPHS) : sealed ? cipher[i] : ch)).join(""));
    }, 60);
    return () => clearInterval(id);
  }, [sealed]);
  return <pre className={sealed ? "dim" : "ok"}>{out}</pre>;
}

function HexDump({ sealed }: { sealed: boolean }) {
  const [rows, setRows] = useState<string[]>([]);
  const offRef = useRef(0x7f3a0000);
  useEffect(() => {
    const id = setInterval(() => {
      const off = (offRef.current += 8);
      const bytes = Array.from({ length: 8 }, (_, i) => (sealed ? rnd(0, 255) : PLAIN.charCodeAt((off + i) % PLAIN.length)));
      setRows((r) => [...r.slice(-14), `${off.toString(16)}  ${bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")}  ${bytes.map((b) => (b > 31 && b < 127 ? String.fromCharCode(b) : ".")).join("")}`]);
    }, 180);
    return () => clearInterval(id);
  }, [sealed]);
  return <pre>{rows.join("\n")}</pre>;
}

// ---------------- INTEL: people, mail, wireless ----------------
function Intel({ sys }: Props) {
  return (
    <div className="grid intel">
      <Pane title={`staff directory // ${sys.staff.length}`} className="staff">
        <table>
          <thead>
            <tr><th>name</th><th>role</th><th>mail</th></tr>
          </thead>
          <tbody>
            {sys.staff.length === 0 && <tr><td colSpan={3} className="dim">empty. RECON &gt; OSINT.</td></tr>}
            {sys.staff.map((p) => (
              <tr key={p.mail} className={sys.badge === p.name ? "sel" : ""}>
                <td>{p.name}</td><td className="dim">{p.role}</td><td>{p.mail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Pane>
      <Pane title={`mail // ${sys.inbox.length}`} className="inbox">
        <div className="rows">
          {sys.inbox.length === 0 && <div className="dim">no mailbox open. POST &gt; MAIL in a session.</div>}
          {sys.inbox.map((m, i) => (
            <div key={i} className="line"><span className="dim">{m.from.padEnd(12)}</span>{m.subject}</div>
          ))}
        </div>
      </Pane>
      <Pane title={`wireless // ${sys.wifi.length}`} className="air">
        <div className="rows">
          {sys.wifi.length === 0 && <div className="dim">no scan yet. RECON &gt; WIFI.</div>}
          {sys.wifi.map((n) => (
            <div key={n.ssid} className="line">
              <span className="meter"><u><i style={{ width: `${Math.round(((n.sig + 95) / 60) * 100)}%` }} /></u></span> {n.ssid.padEnd(18)} <span className="dim">ch{String(n.ch).padEnd(4)}{n.sec}</span>
            </div>
          ))}
        </div>
      </Pane>
    </div>
  );
}

// ---------------- FACILITY: cameras, doors, building ----------------
const CAMS = ["LOBBY", "STAIR C", "SERVER B2", "FLOOR 9", "DOCK", "ROOF"];
function Facility({ sys }: Props) {
  return (
    <div className="grid facility">
      <Pane title={`cctv // ${sys.cams ? "feeds looped" : "live"}`} className="cams">
        <Cams sys={sys} />
      </Pane>
      <Pane title="building" className="bldg">
        <div className="rows">
          <div><span className="dim">badge     </span>{sys.badge ?? <span className="dim">none (ACCESS &gt; BADGE)</span>}</div>
          <div><span className="dim">lighting  </span><span className={sys.lights ? "" : "warn"}>{sys.lights ? "normal" : "off, floors 2-9"}</span></div>
          <div><span className="dim">uplink    </span><span className={sys.uplink ? "ok" : "dim"}>{sys.uplink ? "operator: us" : "ground station"}</span></div>
          <div className="dim">doors</div>
          {DOORS.map((d) => (
            <div key={d}>  <span className={sys.doors.includes(d) ? "ok" : "dim"}>{sys.doors.includes(d) ? "open  " : "locked"}</span> {d}</div>
          ))}
        </div>
      </Pane>
    </div>
  );
}

function Cams({ sys }: { sys: Sys }) {
  const frozen = useRef(Date.now());
  const ref = useCanvas(sys, 120, (ctx, w, h, s, t) => {
    if (!s.cams) frozen.current = Date.now();
    const cols = w > h * 1.6 ? 3 : 2;
    const rows = Math.ceil(CAMS.length / cols);
    const cw = w / cols;
    const ch = h / rows;
    const stamp = new Date(s.cams ? frozen.current - 240000 + ((t / 1000) % 240) * 1000 : Date.now()).toTimeString().slice(0, 8);
    CAMS.forEach((name, i) => {
      const x = (i % cols) * cw + 3;
      const y = Math.floor(i / cols) * ch + 3;
      const fw = cw - 6;
      const fh = ch - 6;
      const lit = s.lights || i === 5 ? 1 : 0.25;
      ctx.fillStyle = `rgba(${Math.round(30 * lit)},${Math.round(38 * lit)},${Math.round(34 * lit)},1)`;
      ctx.fillRect(x, y, fw, fh);
      // a simple room: floor lines in perspective
      ctx.strokeStyle = `rgba(160,180,170,${0.25 * lit})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 1; k < 5; k++) {
        ctx.moveTo(x + fw / 2, y + fh * 0.35);
        ctx.lineTo(x + (fw * k) / 5, y + fh);
      }
      ctx.moveTo(x, y + fh * 0.62);
      ctx.lineTo(x + fw, y + fh * 0.62);
      ctx.stroke();
      // grain
      for (let k = 0; k < 90; k++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
        ctx.fillRect(x + Math.random() * fw, y + Math.random() * fh, 3, 3);
      }
      ctx.font = "18px ui-monospace, monospace";
      ctx.fillStyle = "rgba(220,230,225,0.8)";
      ctx.fillText(`CAM-0${i + 1} ${name}`, x + 8, y + 22);
      ctx.fillText(stamp, x + fw - 98, y + fh - 10);
      ctx.fillStyle = s.cams ? C.amber : C.red;
      if (s.cams || Math.floor(t / 700) % 2) ctx.fillRect(x + fw - 16, y + 12, 8, 8);
      if (s.cams) ctx.fillText("LOOP", x + fw - 62, y + 22);
    });
  });
  return <canvas ref={ref} aria-label="Camera feeds" />;
}

function Pane({ title, className, children }: { title: string; className: string; children: React.ReactNode }) {
  return (
    <section className={`pane ${className}`}>
      <h3>{title}</h3>
      <div className="body">{children}</div>
    </section>
  );
}
