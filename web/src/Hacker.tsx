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

// A tiny synth for blips and alarms. Created on first use (after a tap).
let audio: AudioContext | null = null;
export function beep(freq: number, seconds: number, type: OscillatorType = "square", volume = 0.06) {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(volume, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + seconds);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + seconds);
  } catch {} // no audio device: stay silent
}
