"use client";

import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, useTexture } from "@react-three/drei";
import { Component, type ReactNode, Suspense, useLayoutEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { ProcessedSet } from "@/lib/types";

type Urls = ProcessedSet["urls"];

// Environment fetches an HDRI from a CDN; if that fails, don't crash the canvas.
class SafeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function PbrMesh({ urls, repeat, shape }: { urls: Urls; repeat: number; shape: "sphere" | "plane" }) {
  const sources = urls.opacity
    ? [urls.baseColor, urls.normal, urls.orm, urls.height, urls.opacity]
    : [urls.baseColor, urls.normal, urls.orm, urls.height];
  const textures = useTexture(sources) as THREE.Texture[];
  const [map, normalMap, orm, height, alpha] = textures;

  useLayoutEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    for (const t of [normalMap, orm, height, alpha]) if (t) t.colorSpace = THREE.NoColorSpace;
    for (const t of textures) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 8;
      t.needsUpdate = true;
    }
  }, [textures, map, normalMap, orm, height, repeat]);

  const geometry = useMemo(() => {
    const g =
      shape === "sphere"
        ? new THREE.SphereGeometry(1.15, 180, 180)
        : new THREE.PlaneGeometry(2.4, 2.4, 220, 220);
    // aoMap reads the 2nd UV set on older three; mirror uv -> uv2.
    const uv = g.attributes.uv as THREE.BufferAttribute;
    g.setAttribute("uv2", new THREE.BufferAttribute(uv.array, 2));
    return g;
  }, [shape]);

  // DirectX normals (what we export for UE) -> flip Y for three's OpenGL preview.
  const normalScale = useMemo(() => new THREE.Vector2(1, -1), []);

  return (
    <mesh geometry={geometry} rotation={shape === "plane" ? [-Math.PI / 2.4, 0, 0] : [0, 0, 0]}>
      <meshStandardMaterial
        map={map}
        normalMap={normalMap}
        normalScale={normalScale}
        aoMap={orm}
        roughnessMap={orm}
        metalnessMap={orm}
        {...(alpha ? { alphaMap: alpha, alphaTest: 0.5 } : {})}
        displacementMap={height}
        displacementScale={0.12}
        displacementBias={-0.06}
        metalness={1}
        roughness={1}
        envMapIntensity={1}
      />
    </mesh>
  );
}

export default function MaterialPreview3D({ urls }: { urls: Urls }) {
  const [repeat, setRepeat] = useState(1);
  const [shape, setShape] = useState<"sphere" | "plane">("sphere");

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-[#17161a] ring-1 ring-black/10">
      <Canvas shadows camera={{ position: [0, 0, 3.2], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={["#17161a"]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 4, 2]} intensity={2.2} />
        <directionalLight position={[-3, 1, -2]} intensity={0.6} />
        <Suspense fallback={null}>
          <PbrMesh urls={urls} repeat={repeat} shape={shape} />
          <SafeBoundary>
            <Environment preset="city" />
          </SafeBoundary>
        </Suspense>
        <OrbitControls enablePan={false} minDistance={1.7} maxDistance={6} autoRotate autoRotateSpeed={0.6} />
      </Canvas>

      {/* shape toggle */}
      <div className="absolute left-3 top-3 flex gap-1 rounded-full bg-forge-panel/85 p-1 shadow-softer ring-1 ring-black/[0.06] backdrop-blur">
        {(["sphere", "plane"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setShape(s)}
            className={`rounded-full px-3 py-1 text-xs capitalize transition-colors ${
              shape === s ? "bg-forge-text text-forge-bg" : "text-forge-muted hover:text-forge-text"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* tiling control */}
      <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-full bg-forge-panel/85 px-4 py-2 shadow-softer ring-1 ring-black/[0.06] backdrop-blur">
        <span className="text-xs text-forge-muted">Tile</span>
        <input
          type="range"
          min={1}
          max={6}
          step={1}
          value={repeat}
          onChange={(e) => setRepeat(Number(e.target.value))}
          className="flex-1"
        />
        <span className="w-9 text-right font-mono text-xs text-forge-text">{repeat}×{repeat}</span>
      </div>
    </div>
  );
}
