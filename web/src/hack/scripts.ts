// The simulation: a fictional company network, invented tools, and how each
// action changes the pretend world. Pure theatre: no real tools, no real
// targets, nothing touches a network.

export type Host = { ip: string; name: string; os: string; services: string[]; findings: string[]; owned: boolean; zone: number };
export type Session = { id: number; host: string; ip: string; user: string; elevated: boolean; anchored: boolean; opened: number };
export type Record = { id: string; host: string; label: string; digest: string; recovered: boolean };
export type Sys = {
  hosts: Host[];
  target: string; // selected host ip
  sessions: Session[];
  records: Record[];
  loot: { name: string; size: number }[];
  hops: number; // relay hops between us and them
  zones: number; // deepest zone index reachable (1 = DMZ)
  tunnel: boolean;
  detection: number; // 0..100, at 100 the defenders cut every session
  sealed: boolean; // crypto workbench state
  keyId: string;
  activity: string | null; // running action, drives the packet capture
  nextId: number;
  staff: Person[]; // from OSINT
  inbox: { from: string; subject: string; host: string }[];
  wifi: { ssid: string; ch: number; sig: number; sec: string }[];
  badge: string | null; // whose badge we cloned
  cams: boolean; // camera feeds looped
  doors: string[]; // unlocked doors
  lights: boolean;
  uplink: boolean;
  cert: string | null; // forged signing cert
};
export type Person = { name: string; role: string; mail: string };

export type Cls = "cmd" | "ok" | "err" | "warn" | "dim" | "hi" | "info" | "bar" | "";
// One step: wait, print, animate a progress bar, and/or change the world.
export type Step = { t?: string; c?: Cls; d?: number; bar?: string; ms?: number; set?: (s: Sys) => Partial<Sys> };
export type Action = { id: string; label: string; group: Group; words: string[]; help: string; run: (s: Sys) => Step[] };
export type Group = "RECON" | "ACCESS" | "POST" | "CRYPTO" | "OPSEC" | "FACILITY";
export const GROUPS: Group[] = ["RECON", "ACCESS", "POST", "CRYPTO", "OPSEC", "FACILITY"];

export const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = <T,>(a: ArrayLike<T>): T => a[Math.floor(Math.random() * a.length)];
export const hex = (n: number) => Array.from({ length: n }, () => pick("0123456789abcdef")).join("");
export const ip = () => `${rnd(23, 213)}.${rnd(0, 255)}.${rnd(0, 255)}.${rnd(1, 254)}`;
const clamp = (v: number) => Math.max(0, Math.min(100, v));
export const clock = () => new Date().toTimeString().slice(0, 8);

// Helix Dynamics: an invented company. Services and findings are invented too.
const WORLD: Omit<Host, "owned">[] = [
  { zone: 0, ip: "198.18.40.10", name: "edge-gw.helixdyn.net", os: "HelixOS 9.4 appliance", services: ["443 portal-core 3.1", "8443 admin-ui 2.7"], findings: ["HX-0113 session token reuse in portal-core"] },
  { zone: 1, ip: "10.40.1.5", name: "web01", os: "Linux 6.1 (Deb)", services: ["22 sshd", "443 aurora-web 5.2"], findings: ["HX-0207 template eval in aurora-web"] },
  { zone: 1, ip: "10.40.1.12", name: "mailhub", os: "WinSrv 2022", services: ["25 smtp", "443 owa-proxy"], findings: ["HX-0311 relay misconfig"] },
  { zone: 1, ip: "10.40.1.20", name: "buildbox", os: "Linux 5.15", services: ["22 sshd", "8080 forge-ci 11.4"], findings: ["HX-0419 unauthenticated job API"] },
  { zone: 2, ip: "10.40.2.10", name: "dc-alpha", os: "WinSrv 2022", services: ["53 dns", "88 krb", "389 dir", "445 share"], findings: ["HX-0502 stale service account"] },
  { zone: 2, ip: "10.40.2.15", name: "files02", os: "WinSrv 2019", services: ["445 share", "5985 remote-mgmt"], findings: ["HX-0618 writable admin share"] },
  { zone: 2, ip: "10.40.2.31", name: "ledger-db", os: "Linux 6.1 (RHEL)", services: ["22 sshd", "6432 ledgerdb 13"], findings: ["HX-0733 default operator password"] },
  { zone: 2, ip: "10.40.2.44", name: "FIN-WS-07", os: "Win 11", services: ["445 share", "3389 desk"], findings: ["HX-0840 unpatched print spooler"] },
  { zone: 3, ip: "10.40.9.2", name: "vault-core", os: "VaultOS 4", services: ["9401 vault-api", "1792 hsm-bridge"], findings: ["HX-0999 debug endpoint left enabled"] },
  { zone: 3, ip: "10.40.9.9", name: "sat-uplink", os: "RTOS 2.8", services: ["5600 uplink-ctl"], findings: [] },
];
const ZONE_NAMES = ["EDGE", "DMZ 10.40.1.0/24", "CORP 10.40.2.0/24", "CORE 10.40.9.0/24"];
export const zoneName = (z: number) => ZONE_NAMES[z];
const STAFF: Person[] = [
  { name: "Ana Reyes", role: "Finance Director", mail: "a.reyes" },
  { name: "Jide Okafor", role: "IT Operations Lead", mail: "j.okafor" },
  { name: "Mira Volkova", role: "Head of R&D", mail: "m.volkova" },
  { name: "Tomas Lindqvist", role: "Facilities Manager", mail: "t.lindqvist" },
  { name: "Priya Nair", role: "Security Analyst", mail: "p.nair" },
  { name: "Owen Hart", role: "Executive Assistant", mail: "o.hart" },
];
export const DOORS = ["lobby turnstiles", "stairwell C", "server room B2", "exec floor 9", "loading dock"];
const full = (ipAddr: string) => WORLD.find((h) => h.ip === ipAddr)!;

export const initial = (): Sys => ({
  hosts: [{ ...WORLD[0], services: [], findings: [], owned: false }],
  target: WORLD[0].ip,
  sessions: [],
  records: [],
  loot: [],
  hops: 0,
  zones: 1,
  tunnel: false,
  detection: 0,
  sealed: true,
  keyId: hex(16),
  activity: null,
  nextId: 1,
  staff: [],
  inbox: [],
  wifi: [],
  badge: null,
  cams: false,
  doors: [],
  lights: true,
  uplink: false,
  cert: null,
});

export const selected = (s: Sys) => s.hosts.find((h) => h.ip === s.target) ?? s.hosts[0];
const sessionOn = (s: Sys, ipAddr: string) => s.sessions.find((x) => x.ip === ipAddr);
const noisy = (n: number) => (s: Sys) => ({ detection: clamp(s.detection + n / (1 + s.hops * 0.35)) });
const fail = (...lines: string[]): Step[] => lines.map((t, i) => ({ t, c: i ? "dim" : "err", d: i ? 40 : 250 }));
const needSession = (s: Sys) =>
  sessionOn(s, selected(s).ip) ? null : fail(`[x] no session on ${selected(s).name}`, "    breach it first, or pick an owned host in RECON");
const mb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${n} MB`);

export const ACTIONS: Action[] = [
  // ---------------- RECON ----------------
  {
    id: "sweep",
    label: "SWEEP",
    group: "RECON",
    words: ["sweep", "discover"],
    help: "find live hosts in every zone you can reach",
    run: (s) => {
      const fresh = WORLD.filter((h) => h.zone < s.zones + 1 && h.zone > 0 && !s.hosts.some((x) => x.ip === h.ip));
      const zone = Math.min(s.zones, 3);
      return [
        { t: `$ xscan sweep --zone ${zoneName(zone)} --rate 4k --quiet`, c: "cmd" },
        { t: `xscan 4.12  |  ${new Date().toISOString().slice(0, 19)}Z  |  iface tun0`, c: "dim", d: 200 },
        { bar: "probing 256 addresses", ms: 1500 },
        ...(fresh.length
          ? fresh.map((h) => ({ t: `  [up]  ${h.ip.padEnd(13)} ${h.name.padEnd(12)} rtt ${rnd(1, 40)}.${rnd(0, 9)}ms`, c: "ok" as Cls, d: 140 }))
          : [{ t: "  no new hosts in reachable zones. PIVOT deeper.", c: "dim" as Cls }]),
        { t: `sweep complete: ${fresh.length} new, ${s.hosts.length + fresh.length} total`, c: "info", set: (o) => ({ hosts: [...o.hosts, ...fresh.map((h) => ({ ...h, services: [], findings: [], owned: false }))], ...noisy(5)(o) }) },
      ];
    },
  },
  {
    id: "probe",
    label: "PROBE",
    group: "RECON",
    words: ["probe", "ports", "services"],
    help: "list services on the selected host",
    run: (s) => {
      const h = selected(s);
      const w = full(h.ip);
      return [
        { t: `$ xscan probe ${h.ip} --all-ports --banners`, c: "cmd" },
        { bar: `scanning 65535 ports on ${h.name}`, ms: 1800 },
        { t: "PORT    STATE  SERVICE", c: "hi", d: 100 },
        ...w.services.map((x) => ({ t: `${x.split(" ")[0].padEnd(7)} open   ${x.split(" ").slice(1).join(" ")}`, d: 110 })),
        { t: `os guess: ${w.os}  (confidence ${rnd(86, 98)}%)`, c: "dim" },
        { t: `${w.services.length} open, ${65535 - w.services.length} filtered`, c: "info", set: (o) => ({ hosts: o.hosts.map((x) => (x.ip === h.ip ? { ...x, services: w.services } : x)), ...noisy(7)(o) }) },
      ];
    },
  },
  {
    id: "audit",
    label: "AUDIT",
    group: "RECON",
    words: ["audit", "findings", "weak"],
    help: "look for weaknesses on the selected host",
    run: (s) => {
      const h = selected(s);
      const w = full(h.ip);
      if (!h.services.length) return fail(`[x] nothing known about ${h.name}`, "    PROBE it first");
      return [
        { t: `$ specter audit ${h.ip} --profile deep --rules 2026.11`, c: "cmd" },
        { t: `specter: ${rnd(9000, 12000)} rules loaded`, c: "dim", d: 300 },
        { bar: "evaluating", ms: 2000 },
        ...(w.findings.length
          ? w.findings.map((f) => ({ t: `  [CRIT] ${f}`, c: "err" as Cls, d: 200 }))
          : [{ t: "  no exploitable findings", c: "dim" as Cls }]),
        { t: `audit done: ${w.findings.length} critical`, c: "info", set: (o) => ({ hosts: o.hosts.map((x) => (x.ip === h.ip ? { ...x, findings: w.findings } : x)), ...noisy(9)(o) }) },
      ];
    },
  },
  {
    id: "dns",
    label: "DNS MAP",
    group: "RECON",
    words: ["dns", "dnsmap", "subdomains"],
    help: "map the company's public names",
    run: () => {
      const subs = ["portal", "vpn", "mail", "ci", "sso", "api", "staging", "intranet", "status", "files"];
      return [
        { t: "$ dnsmap helixdyn.net --passive --resolve", c: "cmd" },
        ...subs.map((x) => ({ t: `  ${(x + ".helixdyn.net").padEnd(24)} ${ip().padEnd(15)} ${pick(["200", "302", "401", "403"])}`, d: 150 })),
        { t: `${subs.length} names, ${rnd(5, 8)} answering`, c: "info", set: noisy(1) },
      ];
    },
  },
  {
    id: "osint",
    label: "OSINT",
    group: "RECON",
    words: ["osint", "people", "staff"],
    help: "build a staff directory from public sources",
    run: () => [
      { t: "$ dossier collect helixdyn.net --sources press,jobs,social", c: "cmd" },
      { bar: "collecting public profiles", ms: 1400 },
      ...STAFF.map((p) => ({ t: `  ${p.name.padEnd(16)} ${p.role.padEnd(20)} ${p.mail}@helixdyn.net`, d: 120 })),
      { t: `${STAFF.length} people indexed. see INTEL`, c: "info", set: () => ({ staff: STAFF }) },
    ],
  },
  {
    id: "wifi",
    label: "WIFI",
    group: "RECON",
    words: ["wifi", "wireless", "airscan"],
    help: "list wireless networks around the building",
    run: () => {
      const nets = [
        { ssid: "HELIX-CORP", sec: "WPA3-ENT" },
        { ssid: "HELIX-GUEST", sec: "open+portal" },
        { ssid: "HX-LAB-5G", sec: "WPA2-PSK" },
        { ssid: "FLOOR9-EXEC", sec: "WPA3-SAE" },
        { ssid: "DIRECT-41-printer", sec: "WPA2-PSK" },
        { ssid: "(hidden)", sec: "WPA2-ENT" },
      ].map((n) => ({ ...n, ch: pick([1, 6, 11, 36, 44, 149]), sig: -rnd(38, 86) }));
      return [
        { t: "$ airscan --iface wl0 --passive --dwell 250ms", c: "cmd" },
        { bar: "hopping channels", ms: 1300 },
        { t: "SSID                 CH   dBm  SECURITY", c: "hi" },
        ...nets.map((n) => ({ t: `${n.ssid.padEnd(20)} ${String(n.ch).padStart(3)}  ${n.sig}  ${n.sec}`, d: 120 })),
        { t: `${nets.length} networks. see INTEL`, c: "info", set: () => ({ wifi: nets }) },
      ];
    },
  },
  // ---------------- ACCESS ----------------
  {
    id: "breach",
    label: "BREACH",
    group: "ACCESS",
    words: ["breach", "exploit", "pwn"],
    help: "open a session on the selected host",
    run: (s) => {
      const h = selected(s);
      if (sessionOn(s, h.ip)) return fail(`[x] already holding ${h.name}`);
      if (!h.findings.length) return fail(`[x] no known weakness on ${h.name}`, "    PROBE then AUDIT it first");
      const id = s.nextId;
      const user = /Win/.test(h.os) ? "HELIX\\svc_portal" : "svc-web";
      return [
        { t: `$ phantom breach ${h.ip} --finding ${h.findings[0].split(" ")[0]} --callback tun0`, c: "cmd" },
        { t: `phantom 2.9  |  staging payload for ${h.os}`, c: "dim", d: 300 },
        { bar: "delivering stage", ms: 1600 },
        { t: `[+] callback from ${h.ip} after ${rnd(2, 9)}.${rnd(0, 9)}s`, c: "ok", d: 300 },
        { t: `[+] session ${id} open  user=${user}  integrity=medium`, c: "ok", set: (o) => ({ sessions: [...o.sessions, { id, host: h.name, ip: h.ip, user, elevated: false, anchored: false, opened: Date.now() }], hosts: o.hosts.map((x) => (x.ip === h.ip ? { ...x, owned: true } : x)), nextId: id + 1, ...noisy(14)(o) }) },
      ];
    },
  },
  {
    id: "spray",
    label: "SPRAY",
    group: "ACCESS",
    words: ["spray", "brute", "creds"],
    help: "try leaked passwords against the selected host",
    run: (s) => {
      const h = selected(s);
      const users = ["a.reyes", "j.okafor", "svc_backup", "m.volkova", "helpdesk", "t.lindqvist"];
      const tries: Step[] = users.map((u) => ({ t: `  ${u.padEnd(14)} ${"*".repeat(rnd(8, 14))}  rejected`, c: "dim" as Cls, d: 230 }));
      const win = Math.random() < 0.5;
      return [
        { t: `$ keyring spray ${h.ip} --list leaked-2026.kr --delay 30s`, c: "cmd" },
        { t: `keyring: ${rnd(1200, 4000)} candidate pairs, lockout guard on`, c: "dim", d: 250 },
        ...tries,
        win
          ? { t: `  ${pick(users).padEnd(14)} ${"*".repeat(11)}  ACCEPTED`, c: "ok", d: 400, set: (o: Sys) => ({ hosts: o.hosts.map((x) => (x.ip === h.ip ? { ...x, findings: [...new Set([...x.findings, "valid credential from spray"])] } : x)), ...noisy(12)(o) }) }
          : { t: "  no valid pairs this round (lockout guard paused)", c: "warn", d: 400, set: noisy(10) },
      ];
    },
  },
  {
    id: "tunnel",
    label: "TUNNEL",
    group: "ACCESS",
    words: ["tunnel", "ghostwire", "vpn"],
    help: "bring up an encrypted tunnel to the edge",
    run: (s) =>
      s.tunnel
        ? fail("[x] tunnel already up")
        : [
            { t: "$ ghostwire up --profile edge --cipher chacha20 --jitter 40ms", c: "cmd" },
            { t: "ghostwire: handshake 1/3 ... ok\nghostwire: handshake 2/3 ... ok\nghostwire: handshake 3/3 ... ok", d: 500 },
            { t: `tun0 up  mtu 1380  peer ${ip()}`, c: "ok", set: () => ({ tunnel: true }) },
          ],
  },
  {
    id: "phish",
    label: "PHISH",
    group: "ACCESS",
    words: ["phish", "lure"],
    help: "send a staged lure to staff; a click gives a credential",
    run: (s) => {
      if (!s.staff.length) return fail("[x] no recipients", "    run OSINT first");
      const h = selected(s);
      const who = pick(s.staff);
      return [
        { t: `$ lure send --template "Q4 bonus schedule" --to ${s.staff.length} --landing sso-helixdyn.net`, c: "cmd" },
        { bar: "delivering", ms: 1500 },
        { t: `  delivered ${s.staff.length}/${s.staff.length}   opened ${rnd(2, 4)}   reported 0`, c: "dim", d: 600 },
        { t: `  [+] ${who.name} (${who.role}) signed in on the landing page`, c: "ok", d: 900 },
        { t: `credential added to ${h.name}`, c: "info", set: (o) => ({ hosts: o.hosts.map((x) => (x.ip === h.ip ? { ...x, findings: [...new Set([...x.findings, `valid credential: ${who.mail}`])] } : x)), ...noisy(8)(o) }) },
      ];
    },
  },
  {
    id: "badge",
    label: "BADGE",
    group: "ACCESS",
    words: ["badge", "rfid", "clone"],
    help: "clone an access badge from a staff member",
    run: (s) => {
      if (!s.staff.length) return fail("[x] no one to target", "    run OSINT first");
      if (s.badge) return fail(`[x] already holding ${s.badge}'s badge`);
      const who = s.staff.find((p) => /Facilities/.test(p.role)) ?? s.staff[0];
      return [
        { t: `$ rfclone listen --reader lobby-07 --match "${who.name}"`, c: "cmd" },
        { t: "  waiting for badge tap ...", c: "dim", d: 900 },
        { bar: "reading card", ms: 1200 },
        { t: `  card uid ${hex(8).toUpperCase()}  site 0x2F  level FAC-ALL`, d: 200 },
        { t: `[+] badge of ${who.name} cloned`, c: "ok", set: () => ({ badge: who.name }) },
        { t: "    FACILITY > DOORS now works", c: "dim" },
      ];
    },
  },
  // ---------------- POST ----------------
  {
    id: "elevate",
    label: "ELEVATE",
    group: "POST",
    words: ["elevate", "root", "admin"],
    help: "raise privileges in the current session",
    run: (s) => {
      const blocked = needSession(s);
      if (blocked) return blocked;
      const sess = sessionOn(s, selected(s).ip)!;
      if (sess.elevated) return fail(`[x] session ${sess.id} already elevated`);
      return [
        { t: `$ phantom -s ${sess.id} elevate --auto`, c: "cmd" },
        { t: "  checking 214 local paths ...", c: "dim", d: 400 },
        { bar: "elevating", ms: 1500 },
        { t: `[+] session ${sess.id} now ${/\\/.test(sess.user) ? "NT AUTHORITY\\SYSTEM" : "root"}  integrity=system`, c: "ok", set: (o) => ({ sessions: o.sessions.map((x) => (x.id === sess.id ? { ...x, elevated: true, user: /\\/.test(x.user) ? "SYSTEM" : "root" } : x)), ...noisy(10)(o) }) },
      ];
    },
  },
  {
    id: "harvest",
    label: "HARVEST",
    group: "POST",
    words: ["harvest", "dump", "secrets"],
    help: "collect credential records (needs elevation)",
    run: (s) => {
      const blocked = needSession(s);
      if (blocked) return blocked;
      const sess = sessionOn(s, selected(s).ip)!;
      if (!sess.elevated) return fail("[x] access denied reading the secret store", "    ELEVATE first");
      const names = ["administrator", "svc_backup", "a.reyes", "j.okafor", "krb-gate", "m.volkova", "ops-admin"];
      const recs: Record[] = names.map((n) => ({ id: hex(6), host: sess.host, label: n, digest: hex(32), recovered: false }));
      return [
        { t: `$ siphon -s ${sess.id} harvest --store all`, c: "cmd" },
        { bar: "reading secret store", ms: 1300 },
        ...recs.map((r) => ({ t: `  ${r.label.padEnd(14)} XH5:${r.digest}`, d: 90 })),
        { t: `${recs.length} records saved to the CRACK queue`, c: "info", set: (o) => ({ records: [...o.records, ...recs], ...noisy(12)(o) }) },
      ];
    },
  },
  {
    id: "pivot",
    label: "PIVOT",
    group: "POST",
    words: ["pivot", "route"],
    help: "route through this host into the next zone",
    run: (s) => {
      const blocked = needSession(s);
      if (blocked) return blocked;
      if (s.zones >= 3) return fail("[x] no deeper zone to reach");
      const via = selected(s);
      const next = zoneName(s.zones + 1);
      return [
        { t: `$ ghostwire route add ${next.split(" ")[1]} via session ${sessionOn(s, via.ip)!.id}`, c: "cmd" },
        { bar: "building relay", ms: 1200 },
        { t: `[+] ${next} reachable through ${via.name}`, c: "ok", set: (o) => ({ zones: o.zones + 1, ...noisy(8)(o) }) },
        { t: "    run SWEEP to find what's in there", c: "dim" },
      ];
    },
  },
  {
    id: "exfil",
    label: "EXFIL",
    group: "POST",
    words: ["exfil", "pull", "download"],
    help: "copy data out of the current session",
    run: (s) => {
      const blocked = needSession(s);
      if (blocked) return blocked;
      const h = selected(s);
      const size = rnd(200, 4800);
      const name = `${h.name}_${pick(["finance", "hr", "rnd", "mail", "board", "contracts"])}_${hex(4)}.xpk`;
      return [
        { t: `$ siphon -s ${sessionOn(s, h.ip)!.id} pull /data --pack --chunk 8M --via tun0`, c: "cmd" },
        { t: `  packing ${mb(size)} ...`, c: "dim", d: 300 },
        { bar: `transferring ${mb(size)}`, ms: 2600 },
        { t: `[+] ${name}  ${mb(size)}  checksum ok`, c: "ok", set: (o) => ({ loot: [...o.loot, { name, size }], ...noisy(16)(o) }) },
      ];
    },
  },
  {
    id: "anchor",
    label: "ANCHOR",
    group: "POST",
    words: ["anchor", "persist", "implant"],
    help: "keep the session alive across reboots",
    run: (s) => {
      const blocked = needSession(s);
      if (blocked) return blocked;
      const sess = sessionOn(s, selected(s).ip)!;
      if (sess.anchored) return fail(`[x] session ${sess.id} already anchored`);
      return [
        { t: `$ anchor plant -s ${sess.id} --disguise ${pick(["update-agent", "telemetry-svc", "print-helper"])} --beacon 300s±25%`, c: "cmd" },
        { bar: "planting", ms: 1100 },
        { t: `[+] anchor ${hex(8)} armed on ${sess.host}`, c: "ok", set: (o) => ({ sessions: o.sessions.map((x) => (x.id === sess.id ? { ...x, anchored: true } : x)), ...noisy(6)(o) }) },
      ];
    },
  },
  {
    id: "mail",
    label: "MAIL",
    group: "POST",
    words: ["mail", "inbox", "email"],
    help: "read the newest messages in the session's mailbox",
    run: (s) => {
      const blocked = needSession(s);
      if (blocked) return blocked;
      const h = selected(s);
      const people = s.staff.length ? s.staff : STAFF;
      const subjects = ["RE: ORBITAL-9 budget sign-off", "Server room access list (updated)", "Board pack - draft 3", "Uplink maintenance window", "FW: vendor invoice 88-2193", "Badge reader firmware", "Q4 headcount plan", "Do not forward: audit findings"];
      const msgs = Array.from({ length: 6 }, () => ({ from: pick(people).mail, subject: pick(subjects), host: h.name }));
      return [
        { t: `$ siphon -s ${sessionOn(s, h.ip)!.id} mail --folder inbox --latest 6`, c: "cmd" },
        { bar: "syncing mailbox", ms: 1100 },
        ...msgs.map((m) => ({ t: `  ${m.from.padEnd(12)} ${m.subject}`, d: 110 })),
        { t: `${msgs.length} messages. see INTEL`, c: "info", set: (o) => ({ inbox: [...msgs, ...o.inbox].slice(0, 30), ...noisy(5)(o) }) },
      ];
    },
  },
  // ---------------- CRYPTO ----------------
  {
    id: "crack",
    label: "CRACK",
    group: "CRYPTO",
    words: ["crack", "cipherforge"],
    help: "recover passwords from harvested records on GPUs",
    run: (s) => {
      const open = s.records.filter((r) => !r.recovered);
      if (!open.length) return fail("[x] crack queue empty", "    HARVEST records from an elevated session first");
      const got = open.filter(() => Math.random() < 0.6);
      return [
        { t: `$ cipherforge run --queue ${open.length} --mode hybrid --rules deep64 --devices 0,1`, c: "cmd" },
        { t: "cipherforge 7.0  |  2 devices  |  workload: insane", c: "dim", d: 300 },
        { bar: "keyspace", ms: 3200 },
        ...got.map((r) => ({ t: `  [recovered] ${r.label.padEnd(14)} ${"•".repeat(rnd(8, 13))}`, c: "ok" as Cls, d: 150 })),
        { t: `recovered ${got.length}/${open.length}`, c: "info", set: (o) => ({ records: o.records.map((r) => (got.some((g) => g.id === r.id) ? { ...r, recovered: true } : r)) }) },
      ];
    },
  },
  {
    id: "seal",
    label: "ENCRYPT",
    group: "CRYPTO",
    words: ["encrypt", "seal", "lock"],
    help: "seal the vault on the CRYPTO screen",
    run: (s) =>
      s.sealed
        ? fail("[x] vault already sealed")
        : [
            { t: `$ vaultctl seal --key ${s.keyId.slice(0, 8)} --aead xchacha20-poly1305`, c: "cmd" },
            { bar: "sealing", ms: 1300 },
            { t: "vault sealed", c: "ok", set: () => ({ sealed: true }) },
          ],
  },
  {
    id: "unseal",
    label: "DECRYPT",
    group: "CRYPTO",
    words: ["decrypt", "unseal", "unlock"],
    help: "open the vault on the CRYPTO screen",
    run: (s) =>
      !s.sealed
        ? fail("[x] vault already open")
        : [
            { t: `$ vaultctl unseal --key ${s.keyId.slice(0, 8)} --shares 3/5`, c: "cmd" },
            { t: "  share 1/3 accepted\n  share 2/3 accepted\n  share 3/3 accepted", d: 600 },
            { bar: "decrypting", ms: 1500 },
            { t: "vault open", c: "ok", set: () => ({ sealed: false }) },
          ],
  },
  {
    id: "keygen",
    label: "KEYGEN",
    group: "CRYPTO",
    words: ["keygen", "newkey"],
    help: "generate a fresh key pair",
    run: () => {
      const id = hex(16);
      return [
        { t: "$ vaultctl keygen --type ed448 --label ops", c: "cmd" },
        { t: Array.from({ length: 4 }, () => ".".repeat(rnd(6, 20)) + "+++").join("\n"), c: "dim", d: 500 },
        { t: `key ${id} created`, c: "ok", set: () => ({ keyId: id }) },
      ];
    },
  },
  {
    id: "forge",
    label: "FORGE",
    group: "CRYPTO",
    words: ["forge", "cert", "sign"],
    help: "mint a look-alike signing certificate",
    run: (s) => {
      const cn = `update.helixdyn.net`;
      return [
        { t: `$ certsmith forge --cn ${cn} --key ${s.keyId.slice(0, 8)} --valid 397d`, c: "cmd" },
        { bar: "signing", ms: 1200 },
        { t: `  serial ${hex(20)}\n  sha256 ${hex(32)}`, c: "dim", d: 200 },
        { t: `certificate for ${cn} ready`, c: "ok", set: () => ({ cert: cn }) },
      ];
    },
  },
  {
    id: "stego",
    label: "STEGO",
    group: "CRYPTO",
    words: ["stego", "hide"],
    help: "hide the latest pulled file inside an image",
    run: (s) => {
      const last = s.loot[s.loot.length - 1];
      if (!last) return fail("[x] nothing to hide", "    EXFIL a file first");
      const name = `IMG_${rnd(1000, 9999)}.png`;
      return [
        { t: `$ inkwell embed ${last.name} --into ${name} --bits 2`, c: "cmd" },
        { bar: "embedding", ms: 1300 },
        { t: `${name}  ${mb(last.size + rnd(2, 9))}  looks like a holiday photo`, c: "ok", set: (o) => ({ loot: [...o.loot.filter((l) => l !== last), { name, size: last.size }] }) },
      ];
    },
  },
  // ---------------- OPSEC ----------------
  {
    id: "relay",
    label: "RELAY+",
    group: "OPSEC",
    words: ["relay", "proxy", "hop"],
    help: "add relay hops; detection grows slower",
    run: (s) => {
      if (s.hops >= 9) return fail("[x] relay chain at maximum depth (9)");
      const add = Math.min(3, 9 - s.hops);
      return [
        { t: `$ ghostwire relay extend +${add}`, c: "cmd" },
        ...Array.from({ length: add }, (_, i) => ({ t: `  hop ${s.hops + i + 1}  ${ip().padEnd(15)} ${pick(["IS", "CH", "SG", "PA", "EE", "NL"])}  ok`, c: "ok" as Cls, d: 350 })),
        { t: `chain depth ${s.hops + add}`, c: "info", set: (o) => ({ hops: o.hops + add }) },
      ];
    },
  },
  {
    id: "scrub",
    label: "SCRUB",
    group: "OPSEC",
    words: ["scrub", "wipe", "clean"],
    help: "remove our traces from logs (needs a session)",
    run: (s) => {
      const blocked = needSession(s);
      if (blocked) return blocked;
      return [
        { t: `$ phantom -s ${sessionOn(s, selected(s).ip)!.id} scrub --logs all --timestamps restore`, c: "cmd" },
        { bar: "rewriting log segments", ms: 1300 },
        { t: `removed ${rnd(80, 400)} entries`, c: "ok", set: (o) => ({ detection: Math.max(0, o.detection - 35) }) },
      ];
    },
  },
  {
    id: "drop",
    label: "DROP",
    group: "OPSEC",
    words: ["drop", "close", "exit"],
    help: "close the session on the selected host",
    run: (s) => {
      const sess = sessionOn(s, selected(s).ip);
      if (!sess) return fail("[x] no session here");
      return [
        { t: `$ phantom -s ${sess.id} close`, c: "cmd" },
        { t: `session ${sess.id} closed`, c: "dim", set: (o) => ({ sessions: o.sessions.filter((x) => x.id !== sess.id) }) },
      ];
    },
  },
  {
    id: "burn",
    label: "KILLSWITCH",
    group: "OPSEC",
    words: ["killswitch", "burn", "panic"],
    help: "drop everything and reset the operation",
    run: (s) => [
      { t: "$ opsec killswitch --confirm", c: "cmd" },
      ...s.sessions.map((x) => ({ t: `  session ${x.id} (${x.host}) terminated`, c: "dim" as Cls, d: 150 })),
      { t: "  tun0 down\n  relay chain dissolved\n  local cache shredded", c: "dim", d: 400 },
      { t: "operation reset", c: "warn", d: 300, set: () => initial() },
    ],
  },
  {
    id: "spoof",
    label: "SPOOF",
    group: "OPSEC",
    words: ["spoof", "identity", "mac"],
    help: "rotate our network identity; lowers detection a little",
    run: () => [
      { t: "$ ghostwire identity rotate --mac --hostname --ttl", c: "cmd" },
      { t: `  mac      ${Array.from({ length: 6 }, () => hex(2)).join(":")}\n  hostname ${pick(["LT-ACC-", "WS-HR-", "MBP-"])}${rnd(100, 999)}\n  ttl      ${pick([64, 128])}`, d: 400 },
      { t: "identity rotated", c: "ok", set: (o) => ({ detection: clamp(o.detection - 10) }) },
    ],
  },
  {
    id: "decoy",
    label: "DECOY",
    group: "OPSEC",
    words: ["decoy", "distract"],
    help: "trip harmless alarms elsewhere to pull analysts away",
    run: () => [
      { t: "$ chaff fire --pattern scanner-noise --zone guest --count 400", c: "cmd" },
      { bar: "firing decoys", ms: 1200 },
      { t: "soc attention shifted to the guest network", c: "ok", set: (o) => ({ detection: clamp(o.detection - 15) }) },
    ],
  },
  // ---------------- FACILITY ----------------
  {
    id: "cams",
    label: "CAMS",
    group: "FACILITY",
    words: ["cams", "cctv", "loop"],
    help: "loop the camera feeds (or restore them)",
    run: (s) => {
      if (s.zones < 2) return fail("[x] camera controller not reachable", "    PIVOT into CORP first");
      return s.cams
        ? [
            { t: "$ vms-ctl feed --all --live", c: "cmd" },
            { t: "camera feeds live again", c: "ok", set: () => ({ cams: false }) },
          ]
        : [
            { t: "$ vms-ctl feed --all --replay 00:04:00 --loop", c: "cmd" },
            { bar: "buffering 4 minutes of footage", ms: 1500 },
            { t: "6 feeds looping. see FACILITY", c: "ok", set: (o) => ({ cams: true, ...noisy(4)(o) }) },
          ];
    },
  },
  {
    id: "doors",
    label: "DOORS",
    group: "FACILITY",
    words: ["doors", "door"],
    help: "unlock the next door with the cloned badge",
    run: (s) => {
      if (!s.badge) return fail("[x] no badge", "    ACCESS > BADGE first");
      const door = DOORS.find((d) => !s.doors.includes(d));
      if (!door) return fail("[x] every door is already open");
      return [
        { t: `$ pacs-ctl door "${door}" --as "${s.badge}" --hold 30s`, c: "cmd" },
        { bar: "authorising", ms: 1000 },
        { t: `${door}: unlocked`, c: "ok", set: (o) => ({ doors: [...o.doors, door], ...noisy(s.cams ? 1 : 6)(o) }) },
      ];
    },
  },
  {
    id: "lights",
    label: "LIGHTS",
    group: "FACILITY",
    words: ["lights", "power", "blackout"],
    help: "cut or restore lighting on floors 2 to 9",
    run: (s) => {
      if (s.zones < 2) return fail("[x] building controller not reachable", "    PIVOT into CORP first");
      return [
        { t: `$ bms-ctl lighting --floors 2-9 --${s.lights ? "off" : "on"}`, c: "cmd" },
        { bar: s.lights ? "switching relays off" : "switching relays on", ms: 900 },
        { t: `lighting ${s.lights ? "off" : "restored"} on floors 2-9`, c: s.lights ? "warn" : "ok", set: (o) => ({ lights: !o.lights, ...noisy(5)(o) }) },
      ];
    },
  },
  {
    id: "uplink",
    label: "UPLINK",
    group: "FACILITY",
    words: ["uplink", "satellite", "sat"],
    help: "take over the rooftop satellite uplink (needs CORE)",
    run: (s) => {
      if (s.zones < 3) return fail("[x] uplink controller is in CORE", "    keep pivoting: DMZ > CORP > CORE");
      if (s.uplink) return fail("[x] uplink already ours");
      return [
        { t: "$ uplink-ctl attach 10.40.9.9:5600 --operator", c: "cmd" },
        { t: `  az ${rnd(120, 240)}.${rnd(0, 9)}°  el ${rnd(20, 60)}.${rnd(0, 9)}°  lock ok`, c: "dim", d: 500 },
        { bar: "handshaking with ground station", ms: 2200 },
        { t: "[+] uplink control transferred", c: "ok", set: (o) => ({ uplink: true, ...noisy(10)(o) }) },
      ];
    },
  },
];

// The defenders caught up: every session dies.
export const caught = (s: Sys): Step[] => [
  { t: `[!] ${clock()} defender response: hosts isolated by Helix SOC`, c: "err" },
  ...s.sessions.map((x) => ({ t: `[!] session ${x.id} (${x.host}) died: connection reset`, c: "err" as Cls, d: 200 })),
  { t: "    RELAY+ slows detection, SCRUB rolls it back", c: "dim", set: (o) => ({ sessions: [], detection: 60, hosts: o.hosts.map((h) => ({ ...h, owned: false })) }) },
];

export function find(text: string): Action | undefined {
  const w = text.trim().toLowerCase().split(/\s+/)[0];
  return ACTIONS.find((a) => a.id === w || a.words.includes(w) || a.label.toLowerCase() === w);
}

// How much detection grows per second with sessions open.
export const exposure = (s: Sys) => (s.sessions.length ? (0.35 + s.sessions.length * 0.15) / (1 + s.hops * 0.35) : -0.3);

export const HELP = [
  "commands (or use the buttons):",
  ...ACTIONS.map((a) => `  ${a.words[0].padEnd(11)} ${a.help}`),
  "  target <ip|name>  select a host",
  "  clear      clear the screen",
];

// The suggested next move for the pad's hint line: the story, one step at a time.
export function next(s: Sys): { id: string; why: string } | { id: null; why: string } {
  const h = selected(s);
  const sess = sessionOn(s, h.ip);
  if (s.detection > 75 && s.sessions.length) return s.hops < 9 ? { id: "relay", why: "detection is high, add relay hops" } : { id: "scrub", why: "detection is high, clean the logs" };
  if (!sess) {
    if (!h.services.length) return { id: "probe", why: `find services on ${h.name}` };
    if (!full(h.ip).findings.length) return { id: null, why: `nothing to break on ${h.name}, pick another host on RECON` };
    if (!h.findings.length) return { id: "audit", why: `look for a weakness on ${h.name}` };
    return { id: "breach", why: `open a session on ${h.name}` };
  }
  if (!sess.elevated) return { id: "elevate", why: "get admin rights in this session" };
  if (!s.records.some((r) => r.host === sess.host)) return { id: "harvest", why: "collect password records" };
  if (s.records.some((r) => !r.recovered)) return { id: "crack", why: "recover the harvested passwords" };
  const unseen = WORLD.some((w) => w.zone > 0 && w.zone <= s.zones && !s.hosts.some((x) => x.ip === w.ip));
  if (unseen) return { id: "sweep", why: "find the hosts in the new zone" };
  if (s.zones < 3) return { id: "pivot", why: "route into the next zone" };
  if (!s.uplink) return { id: "uplink", why: "the CORE is open, take the satellite uplink" };
  return { id: "exfil", why: "pull data out, or try FACILITY" };
}
