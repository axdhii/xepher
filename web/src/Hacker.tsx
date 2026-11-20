// The boot log that plays each time the console opens. Tap to skip.
import { useEffect, useState } from "react";

const BOOT = [
  "[    0.000000] helix-ops kernel 6.9.2-hardened #1 SMP PREEMPT",
  "[    0.104311] crypto: self-tests passed (xchacha20, poly1305, ed448)",
  "[    0.338920] tun0: ghostwire driver loaded",
  "[    0.512004] mounting encrypted /ops ... ok",
  "[    0.731877] opsec: memory scrubber armed, swap disabled",
  "[    0.902216] console: operator profile loaded",
];

export function Breach({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => (n >= BOOT.length ? onDone() : setN(n + 1)), n >= BOOT.length ? 350 : 90 + Math.random() * 90);
    return () => clearTimeout(t);
  }, [n]);
  return (
    <div className="breach" onClick={onDone}>
      {BOOT.slice(0, n).map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}
