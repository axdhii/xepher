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
};

export type Cls = "cmd" | "ok" | "err" | "warn" | "dim" | "hi" | "info" | "";
// One step: wait, print, animate a progress bar, and/or change the world.
export type Step = { t?: string; c?: Cls; d?: number; bar?: string; ms?: number; set?: (s: Sys) => Partial<Sys> };
export type Action = { id: string; label: string; group: Group; words: string[]; help: string; run: (s: Sys) => Step[] };
export type Group = "RECON" | "ACCESS" | "POST" | "CRYPTO" | "OPSEC";
export const GROUPS: Group[] = ["RECON", "ACCESS", "POST", "CRYPTO", "OPSEC"];

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
