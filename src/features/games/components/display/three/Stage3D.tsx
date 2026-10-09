"use client";
import { Canvas } from "@react-three/fiber";

export const CAMERA_FOV = 30;
/** At this distance a 1080-unit-tall plane at z = 0 fills the view: 1 unit = 1 LED pixel (D293). */
export const CAMERA_Z = 540 / Math.tan((CAMERA_FOV / 2) * (Math.PI / 180));

/**
 * The LED's one WebGL canvas (D293–D295), behind the HTML screens on the 1920×1080 canvas. It
 * measures its unscaled size (offsetSize), so it always draws 1920×1080 at pixel ratio 1, and it
 * redraws only when something asks (frameloop "demand", see useAnimating). A lost context calls
 * `onLost`, which reloads the page; the stage redraws from the server (D262, D295).
 */
export default function Stage3D({ children, onLost }: { children: React.ReactNode; onLost: () => void }) {
  return (
    <Canvas
      style={{ position: "absolute", inset: 0 }}
      frameloop="demand"
      dpr={1}
      resize={{ offsetSize: true }}
      camera={{ fov: CAMERA_FOV, position: [0, 0, CAMERA_Z], near: 10, far: CAMERA_Z * 4 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        // Lets a mesh's own material.clippingPlanes cut it (SlotReels clips each reel to its
        // window); off by default because it costs a little on every draw call.
        gl.localClippingEnabled = true;
        gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); onLost(); });
      }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[400, 600, 1600]} intensity={1.6} />
      {children}
    </Canvas>
  );
}
