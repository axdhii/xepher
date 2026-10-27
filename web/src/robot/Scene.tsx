import { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Robot } from "./Robot";
import { robot } from "./state";

// The bubble is on screen all day: draw at full rate only while something is
// happening, otherwise at a lazy 20 fps to spare the battery.
function Ticker() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let id = 0;
    let last = 0;
    const tick = (ms: number) => {
      const busy = robot.activity !== null || robot.flying || performance.now() / 1000 < robot.flashUntil;
      if (busy || ms - last > 50) {
        last = ms;
        invalidate();
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [invalidate]);
  return null;
}

export default function Scene() {
  return (
    <Canvas
      frameloop="demand"
      camera={{ position: [0, 0, 7.5], fov: 32 }}
      dpr={[1, 1.5]}
      gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <Ticker />
      {/* Studio lighting built from local light panels: no HDR download. */}
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={2.2} position={[0, 4, 3]} scale={[8, 3, 1]} form="rect" />
        <Lightformer intensity={1.2} position={[-6, 1, 2]} rotation-y={Math.PI / 2} scale={[4, 6, 1]} />
        <Lightformer intensity={0.9} color="#ffd3a1" position={[6, 0, -2]} rotation-y={-Math.PI / 2} scale={[3, 6, 1]} />
        <Lightformer intensity={0.4} color="#9fb6ff" position={[0, -4, -4]} scale={[10, 2, 1]} />
      </Environment>
      <directionalLight position={[3, 5, 4]} intensity={1.1} />
      <ambientLight intensity={0.15} />
      <Robot />
      <EffectComposer multisampling={2}>
        <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.85} radius={0.7} />
      </EffectComposer>
    </Canvas>
  );
}
