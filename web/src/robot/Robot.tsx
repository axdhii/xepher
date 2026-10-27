// Xepher's body. Ported from aadhil-portfolio's components/robot/Robot.tsx,
// minus the page-only behaviour (service cycle, scroll stations, chat terminal, kiss).
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { createEyeMaterial } from "./eye-material";
import {
  robot,
  flash,
  say,
  now as wallNow,
  MODE_EYES,
  MODE_HAPPY,
  MODE_SLEEP,
  MODE_SURPRISED,
  MODE_ANGRY,
  MODE_WINK,
  MODE_LOVE,
  MODE_TEXT,
  MODE_FLY,
  MODE_THINK,
  MODE_NOPE,
  MODE_TALK,
} from "./state";

const ACCENT = "#ffae4a"; // phosphor amber
const SCREEN_W = 1.48;
const SCREEN_H = 1.02;
const TEXT_HALF = 0.62; // usable half-width of the screen for text, screen units

const BOOT_END = 1.8; // screen flickers on
const SCAN_END = 3.0; // eyes look left-right once
const SLEEP_AFTER = 45;
const SWITCH = 0.22; // close + open duration for a mode switch

const damp = THREE.MathUtils.damp;

// HDR colours (> 1) so Bloom makes the flame glow.
const FLAME_OUTER = new THREE.Color(3.2, 1.6, 0.5);
const FLAME_CORE = new THREE.Color(4, 3.3, 2.4);

export function Robot() {
  const root = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const handL = useRef<THREE.Group>(null!);
  const handR = useRef<THREE.Group>(null!);
  const antenna = useRef<THREE.MeshStandardMaterial>(null!);
  const ring = useRef<THREE.MeshStandardMaterial>(null!);
  const flameRef = useRef<THREE.Group>(null!);

  // Messages are drawn on a hidden canvas; the LED shader samples it.
  const text = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 128;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return { canvas, ctx: canvas.getContext("2d")!, tex };
  }, []);
  // The shader also takes a terminal texture; Xepher never shows it, so it stays blank.
  const termTex = useMemo(() => new THREE.DataTexture(new Uint8Array(4), 1, 1), []);
  const eyes = useMemo(() => createEyeMaterial(SCREEN_W / SCREEN_H, ACCENT, text.tex, termTex), [text, termTex]);
  useEffect(
    () => () => {
      eyes.dispose();
      text.tex.dispose();
      termTex.dispose();
    },
    [eyes, text, termTex],
  );

  const { viewport } = useThree();
  // Fit the whole robot (hands and hover ring included) in the canvas.
  const scale = Math.min(viewport.width / 3.9, viewport.height / 3.2);

  const s = useRef({
    start: -1,
    switchStart: -1,
    switchTo: MODE_EYES,
    nextBlink: 4,
    greeted: false,
    wasAsleep: false,
    drawn: "",
    textW: 0,
    textStart: 0,
    fly: 0,
  });

  function drawMessage(msg: string) {
    const { canvas, ctx, tex } = text;
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-mono") || "monospace";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `800 92px ${family}`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(msg, 0, 68);
    tex.needsUpdate = true;
    // canvas px -> screen units
    return (ctx.measureText(msg).width / canvas.height) * eyes.uniforms.uTextH.value;
  }

  useFrame((state, dt) => {
    const st = s.current;
    const n = wallNow();
    if (st.start < 0) st.start = n;
    const t = n - st.start;
    const u = eyes.uniforms;
    u.uTime.value = state.clock.elapsedTime;

    const power = Math.min(1, t / BOOT_END);
    u.uPower.value = power;

    // Sleepy only when nothing is going on.
    const asleep = robot.activity === null && n - Math.max(robot.lastActivity, st.start + SCAN_END) > SLEEP_AFTER;
    if (st.wasAsleep && !asleep && n >= robot.flashUntil) say("OH! HI", 1.8);
    st.wasAsleep = asleep;
    if (!st.greeted && t > SCAN_END) {
      st.greeted = true;
      say("HI!", 1.6);
    }

    const flashing = n < robot.flashUntil;
    let want = MODE_EYES;
    if (robot.flying) want = MODE_FLY;
    else if (asleep) want = MODE_SLEEP;
    else if (flashing) want = robot.flashMode;
    else if (robot.activity !== null) want = robot.activity;

    // --- blink / switch: eyes close, mode swaps at the midpoint, eyes open ---
    if (st.switchStart < 0) {
      if (want !== robot.mode) {
        st.switchStart = t;
        st.switchTo = want;
      } else if (t > st.nextBlink && robot.mode === MODE_EYES) {
        st.nextBlink = t + 2.2 + Math.random() * 3.5;
        if (Math.random() < 0.2) flash(MODE_WINK, 0.7);
        else {
          st.switchStart = t;
          st.switchTo = robot.mode;
        }
      }
    }
    let open = 1;
    if (st.switchStart >= 0) {
      const k = (t - st.switchStart) / SWITCH;
      if (k >= 0.5) robot.mode = st.switchTo;
      open = Math.abs(1 - 2 * Math.min(k, 1));
      if (k >= 1) st.switchStart = -1;
    }
    if (robot.mode === MODE_SLEEP) open = Math.min(open, 0.8);
    u.uOpen.value = open;
    u.uMode.value = robot.mode;

    // --- text: centre it if it fits, otherwise slide it across once ---
    if (robot.mode === MODE_TEXT) {
      if (st.drawn !== robot.message) {
        st.drawn = robot.message;
        st.textW = drawMessage(robot.message);
        st.textStart = n;
      }
      if (st.textW <= TEXT_HALF * 2) u.uTextX.value = -st.textW / 2;
      else {
        const k = (n - st.textStart) / Math.max(0.1, robot.flashUntil - st.textStart);
        u.uTextX.value = THREE.MathUtils.lerp(-TEXT_HALF, TEXT_HALF - st.textW, THREE.MathUtils.smoothstep(k, 0.12, 0.85));
      }
    } else st.drawn = "";

    // --- gaze and head tracking (pointer is -1..1 across the window) ---
    const mode = robot.mode;
    const px = THREE.MathUtils.clamp(robot.pointer.x, -1, 1);
    const py = THREE.MathUtils.clamp(robot.pointer.y, -1, 1);
    let lookX = px;
    let lookY = py;
    if (t > BOOT_END && t < SCAN_END) lookX = Math.sin(((t - BOOT_END) / (SCAN_END - BOOT_END)) * Math.PI * 2);
    if (mode === MODE_SLEEP) {
      lookX = 0;
      lookY = -0.4;
    }
    if (mode === MODE_THINK) {
      lookX = 0.5;
      lookY = 0.6; // eyes up and to the side while it works
    }
    const flyDir = robot.flying ? robot.flyDir : 0;
    if (flyDir) {
      lookX = flyDir;
      lookY = 0;
    }
    const look = u.uLook.value as THREE.Vector2;
    look.x = damp(look.x, lookX, 10, dt);
    look.y = damp(look.y, lookY, 10, dt);

    const lean = mode === MODE_SLEEP ? 0.28 : mode === MODE_ANGRY ? 0.14 : mode === MODE_SURPRISED ? -0.18 : 0;
    const tilt =
      mode === MODE_LOVE ? Math.sin(t * 2) * 0.12 : mode === MODE_WINK ? 0.14 : mode === MODE_HAPPY ? -0.08 : mode === MODE_THINK ? 0.1 : 0;
    const nope = mode === MODE_NOPE;
    head.current.rotation.y = damp(head.current.rotation.y, (flyDir ? flyDir * 0.7 : px * 0.5) + (nope ? Math.sin(t * 16) * 0.3 : 0), nope ? 14 : 3.5, dt);
    head.current.rotation.x = damp(head.current.rotation.x, -py * 0.28 + lean, 4, dt);
    head.current.rotation.z = damp(head.current.rotation.z, -px * 0.06 + tilt + Math.sin(t * 0.7) * 0.02, 4, dt);

    // --- float, a hop when poked, a jet flame while dragged ---
    const hop = n - robot.pokedAt < 0.5 ? Math.sin(((n - robot.pokedAt) / 0.5) * Math.PI) * 0.18 : 0;
    const shake = mode === MODE_ANGRY ? Math.sin(t * 45) * 0.025 : 0;
    st.fly = damp(st.fly, robot.flying ? 1 : 0, 8, dt);
    root.current.position.set(shake, (Math.sin(t * (mode === MODE_SLEEP ? 0.8 : 1.4)) * 0.07 + hop) * scale + 0.12 * scale, 0);
    root.current.scale.setScalar(scale);
    root.current.rotation.z = -robot.flyDir * st.fly * 0.25;
    const fl = flameRef.current;
    fl.visible = st.fly > 0.02;
    fl.scale.set(0.6 + 0.4 * st.fly, st.fly * (0.85 + 0.15 * Math.sin(t * 50)), 0.6 + 0.4 * st.fly);

    // --- hands: a pose per expression, plus drift ---
    let lx = -1.38, rx = 1.38, hy = -0.55, hz = 0.35, lr = 0.25, rr = -0.25;
    if (mode === MODE_HAPPY) { hy += 0.5; lr += 0.4; rr -= 0.4; }
    else if (mode === MODE_SURPRISED) { hy += 0.75; lx -= 0.15; rx += 0.15; lr = 0.7; rr = -0.7; }
    else if (mode === MODE_ANGRY || mode === MODE_NOPE) { hy -= 0.1; lx += 0.1; rx -= 0.1; lr = -0.3; rr = 0.3; }
    else if (mode === MODE_LOVE) { lx = -0.42; rx = 0.42; hy = -0.98; hz = 0.75; lr = -0.55; rr = 0.55; }
    else if (mode === MODE_TEXT) { rr += Math.sin(t * 12) * 0.45; hy += 0.15; }
    else if (mode === MODE_SLEEP) { hy -= 0.25; }
    else if (mode === MODE_THINK) { rx = 0.75; rr = 0.9; hy += 0.25; } // right hand up to the "chin"
    else if (mode === MODE_TALK) { lr += Math.sin(t * 6) * 0.25; rr -= Math.sin(t * 6 + 1) * 0.25; }
    else if (mode === MODE_FLY) { lx -= flyDir * 0.35; rx -= flyDir * 0.35; hy += 0.3; lr = flyDir * 0.8; rr = -flyDir * 0.8; }
    const drift = -px * 0.08;
    const bobL = Math.sin(t * 1.4 + 1.2) * 0.09;
    const bobR = Math.sin(t * 1.4 + 2.4) * 0.09;
    const L = handL.current, R = handR.current;
    L.position.set(damp(L.position.x, lx + drift + shake * 1.5, 6, dt), damp(L.position.y, hy + bobL, 6, dt), damp(L.position.z, hz, 6, dt));
    R.position.set(damp(R.position.x, rx + drift - shake * 1.5, 6, dt), damp(R.position.y, hy + bobR, 6, dt), damp(R.position.z, hz, 6, dt));
    L.rotation.z = damp(L.rotation.z, lr, 7, dt);
    R.rotation.z = damp(R.rotation.z, rr, 9, dt);

    // --- lights that breathe with the robot; the antenna pulses fast while it works ---
    const pulse = 0.5 + 0.5 * Math.sin(t * (mode === MODE_LOVE ? 6.8 : mode === MODE_THINK ? 9 : 2.2));
    antenna.current.emissiveIntensity = power * (mode === MODE_SLEEP ? 0.6 : 2.4 + pulse * 2.2);
    ring.current.emissiveIntensity = power * (1.2 + pulse * 0.5 + st.fly * 5);
  });

  const body = <meshPhysicalMaterial color="#e8e4dc" roughness={0.38} clearcoat={0.7} clearcoatRoughness={0.25} />;
  const dark = <meshStandardMaterial color="#17191c" roughness={0.45} metalness={0.3} />;

  return (
    <group ref={root}>
      <group ref={head}>
        {/* monitor head */}
        <RoundedBox args={[1.9, 1.45, 1.3]} radius={0.3} smoothness={6}>
          {body}
        </RoundedBox>
        {/* CRT back, tapered */}
        <RoundedBox args={[1.4, 1.06, 0.7]} radius={0.26} smoothness={5} position={[0, 0.02, -0.75]}>
          {body}
        </RoundedBox>
        <RoundedBox args={[0.9, 0.7, 0.5]} radius={0.2} smoothness={4} position={[0, 0.04, -1.08]}>
          {body}
        </RoundedBox>
        {/* bezel + screen */}
        <RoundedBox args={[1.64, 1.18, 0.08]} radius={0.04} smoothness={3} position={[0, 0, 0.63]}>
          {dark}
        </RoundedBox>
        <mesh position={[0, 0, 0.672]} material={eyes}>
          <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        </mesh>
        {/* ear dials */}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.97, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
            <mesh>
              <cylinderGeometry args={[0.2, 0.2, 0.08, 40]} />
              {dark}
            </mesh>
            <mesh position={[0, side * 0.05, 0]}>
              <cylinderGeometry args={[0.07, 0.07, 0.04, 24]} />
              <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={1.4} toneMapped={false} />
            </mesh>
          </group>
        ))}
        {/* antenna */}
        <mesh position={[0.45, 0.88, -0.1]}>
          <cylinderGeometry args={[0.025, 0.025, 0.36, 12]} />
          {dark}
        </mesh>
        <mesh position={[0.45, 1.1, -0.1]}>
          <sphereGeometry args={[0.075, 24, 24]} />
          <meshStandardMaterial ref={antenna} color={ACCENT} emissive={ACCENT} toneMapped={false} />
        </mesh>
        {/* vent lines on top */}
        {[-0.3, -0.15, 0, 0.15].map((x) => (
          <RoundedBox key={x} args={[0.07, 0.02, 0.6]} radius={0.01} position={[x - 0.2, 0.726, -0.1]}>
            {dark}
          </RoundedBox>
        ))}
      </group>

      {/* floating hands */}
      <group ref={handL} position={[-1.38, -0.55, 0.35]}>
        <Hand body={body} />
      </group>
      <group ref={handR} position={[1.38, -0.55, 0.35]} scale={[-1, 1, 1]}>
        <Hand body={body} />
      </group>

      {/* hover ring */}
      <group position={[0, -1.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <torusGeometry args={[0.62, 0.022, 16, 96]} />
          <meshStandardMaterial ref={ring} color={ACCENT} emissive={ACCENT} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -0.01]}>
          <circleGeometry args={[0.6, 64]} />
          <meshBasicMaterial color={ACCENT} transparent opacity={0.06} />
        </mesh>
      </group>
      <pointLight position={[0, -1.2, 0.9]} color={ACCENT} intensity={0.3} distance={1.6} />

      {/* jet flame: cones pointing down from under the head */}
      <group ref={flameRef} position={[0, -0.72, 0]} visible={false}>
        <mesh position={[0, -0.45, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.2, 0.9, 24, 1, true]} />
          <meshBasicMaterial color={FLAME_OUTER} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.28, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.09, 0.56, 16, 1, true]} />
          <meshBasicMaterial color={FLAME_CORE} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Hand({ body }: { body: React.ReactNode }) {
  return (
    <group>
      <RoundedBox args={[0.34, 0.4, 0.2]} radius={0.09} smoothness={4}>
        {body}
      </RoundedBox>
      {/* thumb */}
      <RoundedBox args={[0.12, 0.22, 0.14]} radius={0.055} smoothness={3} position={[0.21, 0.0, 0.02]} rotation={[0, 0, -0.5]}>
        {body}
      </RoundedBox>
      {/* knuckle line */}
      <mesh position={[0, 0.11, 0.101]}>
        <boxGeometry args={[0.22, 0.012, 0.005]} />
        <meshStandardMaterial color="#b9b4aa" />
      </mesh>
    </group>
  );
}
