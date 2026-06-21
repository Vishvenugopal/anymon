"use client";

import { Suspense, useMemo, useRef, Component, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const ref = useRef<THREE.Group>(null);

  const cloned = useMemo(() => scene.clone(true), [scene]);
  const { scale, offset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    return { scale: 2.2 / maxDim, offset: center };
  }, [cloned]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.y = t * 0.5;
    ref.current.position.y = Math.sin(t * 1.6) * 0.12;
  });

  return (
    <group ref={ref}>
      <group
        scale={scale}
        position={[-offset.x * scale, -offset.y * scale, -offset.z * scale]}
      >
        <primitive object={cloned} />
      </group>
    </group>
  );
}

class GlbErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export default function AnymonCanvas({
  glbUrl,
  spriteFallback,
  thumbUrl,
  className = "",
  active = true,
  fit = "contain",
}: {
  glbUrl: string | null;
  spriteFallback?: string;
  // A rendered still of the 3D model (Meshy thumbnail). Preferred over the 2D
  // sprite as the resting/fallback image so an idle card still shows the actual
  // 3D model — not the stylized sprite.
  thumbUrl?: string | null;
  className?: string;
  // How the still/fallback image fits its box: "cover" fills the frame (cropping
  // overflow) while keeping aspect ratio; "contain" letterboxes it.
  fit?: "contain" | "cover";
  // When false, show the still image instead of a live WebGL canvas. Each
  // <Canvas> is its own WebGL context, and mobile browsers (esp. iOS Safari) cap
  // simultaneous contexts at ~8 — exceeding it silently drops contexts so models
  // render WHITE. Callers that show many models at once (the deck grid) keep
  // most cards idle (showing the 3D thumbnail) and only go live on focus.
  active?: boolean;
}) {
  const stillSrc = thumbUrl || spriteFallback;
  const fallback = stillSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={stillSrc}
      alt="anymon"
      className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center text-5xl">
      ✨
    </div>
  );

  if (!glbUrl || !active) return <div className={className}>{fallback}</div>;

  return (
    <div className={className}>
      <GlbErrorBoundary fallback={fallback}>
        <Canvas camera={{ position: [0, 0, 5], fov: 40 }} dpr={[1, 2]}>
          <ambientLight intensity={0.9} />
          <hemisphereLight intensity={0.6} groundColor="#bfe9ff" />
          <directionalLight position={[3, 5, 4]} intensity={1.4} />
          <directionalLight position={[-4, 2, -3]} intensity={0.5} color="#32cd32" />
          <Suspense fallback={null}>
            <Model url={glbUrl} />
          </Suspense>
        </Canvas>
      </GlbErrorBoundary>
    </div>
  );
}
