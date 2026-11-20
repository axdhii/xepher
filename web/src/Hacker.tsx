// Movie-hacker set dressing for the open panel. All of it is fake and cosmetic.
import { useEffect, useRef, useState } from "react";

const GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789ABCDEF<>/{}$#";
const pick = <T,>(a: ArrayLike<T>) => a[Math.floor(Math.random() * a.length)];
const hex = (n: number) => Array.from({ length: n }, () => pick("0123456789abcdef")).join("");
const ip = () => Array.from({ length: 4 }, () => 10 + Math.floor(Math.random() * 245)).join(".");

export function MatrixRain() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const size = 14;
    let drops: number[] = [];
    const resize = () => {
      c.width = c.clientWidth;
      c.height = c.clientHeight;
      drops = Array.from({ length: Math.ceil(c.width / size) }, () => Math.random() * -50);
    };
    resize();
    addEventListener("resize", resize);
    const id = setInterval(() => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.font = `${size}px monospace`;
      drops.forEach((y, i) => {
        ctx.fillStyle = Math.random() < 0.05 ? "#d8ffd8" : "#1f8f1f";
        ctx.fillText(pick(GLYPHS), i * size, y * size);
        drops[i] = y * size > c.height && Math.random() > 0.97 ? 0 : y + 1;
      });
    }, 55);
    return () => (clearInterval(id), removeEventListener("resize", resize));
  }, []);
  return <canvas ref={ref} className="rain" aria-hidden />;
}

const BREACH = [
  "XEPHER OS v1.0 // KERNEL 6.6.6-r00t",
  "[*] spoofing MAC address ......... OK",
  () => `[*] bouncing through ${ip()} -> ${ip()} -> ${ip()}`,
  "[*] handshake with mainframe ..... OK",
  () => `[*] cracking RSA-4096 key 0x${hex(12)}`,
  "[*] bypassing firewall ████████████ 100%",
  "[*] disabling the mainframe's feelings",
] as const;

// The "connecting…" sequence that plays every time the panel opens. Tap to skip.
export function Breach({ onDone }: { onDone: () => void }) {
  const [lines] = useState(() => BREACH.map((l) => (typeof l === "function" ? l() : l)));
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n > lines.length) {
      const t = setTimeout(onDone, 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setN(n + 1), 170 + Math.random() * 160);
    return () => clearTimeout(t);
  }, [n]);
  return (
    <div className="breach" onClick={onDone}>
      {lines.slice(0, n).map((l, i) => (
        <div key={i}>{l}</div>
      ))}
      {n <= lines.length && <span className="cursor" />}
      {n > lines.length && (
        <div className="granted glitch" data-text="ACCESS GRANTED">
          ACCESS GRANTED
        </div>
      )}
    </div>
  );
}

// Types text out a few characters at a time.
export function Typed({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) return;
    const t = setTimeout(() => setN(n + Math.max(1, Math.ceil(text.length / 120))), 14);
    return () => clearTimeout(t);
  }, [n, text]);
  return <>{text.slice(0, n)}{n < text.length && <span className="cursor" />}</>;
}

const HACKS = [
  (p: string) => `[+] injecting payload into ${p}/src`,
  () => `[+] decrypting packet 0x${hex(8)}`,
  () => `[~] tracing route via ${ip()}`,
  () => `[+] buffer overflow at 0x${hex(6)} ... contained`,
  (p: string) => `[+] compiling exploits for ${p}`,
  () => `[~] rerouting satellite uplink ${Math.floor(Math.random() * 99)}%`,
  () => `[+] brute forcing hash ${hex(16)}`,
  () => "[!] intrusion countermeasures detected, evading",
] as const;

// Fake activity that scrolls under the real status while a job runs.
export function HackLog({ project }: { project: string }) {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    const id = setInterval(() => setLines((l) => [...l.slice(-3), pick(HACKS)(project)]), 650);
    return () => clearInterval(id);
  }, [project]);
  return (
    <div className="hacklog" aria-hidden>
      {lines.map((l, i) => (
        <div key={i + l}>{l}</div>
      ))}
    </div>
  );
}

// Fake live readouts for the status bar.
export function Readout() {
  const [s, setS] = useState({ ip: ip(), ping: 12, cpu: 40, enc: hex(4) });
  useEffect(() => {
    const id = setInterval(
      () => setS((o) => ({ ip: Math.random() < 0.15 ? ip() : o.ip, ping: 8 + Math.floor(Math.random() * 30), cpu: 20 + Math.floor(Math.random() * 79), enc: hex(4) })),
      900,
    );
    return () => clearInterval(id);
  }, []);
  return (
    <div className="readout" aria-hidden>
      <span>IP {s.ip}</span>
      <span>PING {s.ping}ms</span>
      <span>CPU {s.cpu}%</span>
      <span>AES-256 {s.enc}</span>
    </div>
  );
}
