"use client";

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Billboard,
  ContactShadows,
  Html,
  useAnimations,
  useFBX,
  useGLTF,
  useTexture,
} from "@react-three/drei";
import * as THREE from "three";
import { NEARBY_RADIUS_M } from "@/lib/types";

// A simulated ground-plane AR scene: a transparent r3f canvas layered over the
// live camera feed. Wild Anymon render as their real GLB (sprite-plane while
// still incubating); nearby trainers render as the shared Player.fbx avatar.
// The whole scene group is rotated by the device compass heading so blips sit
// in the correct real-world direction as you turn.

export interface ArWild {
  id: string;
  name: string;
  object: string;
  spriteDataUri: string;
  glbUrl: string | null;
  ready: boolean;
  distM: number;
  bearing: number; // degrees from north (0 = N, clockwise)
}

export interface ArTrainer {
  userId: string;
  username: string;
  distM: number;
  bearing: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const degToRad = (d: number) => (d * Math.PI) / 180;

// Lateral sign: device compasses + camera handedness can mirror left/right.
// Flip this if blips land on the wrong side on a real phone.
const LATERAL_SIGN = 1;

/** Bearing+distance -> world (x,z) on the floor. North = -z, East = +x. */
function placeXZ(bearingDeg: number, distM: number): [number, number] {
  const r = 2.6 + (clamp(distM, 0, NEARBY_RADIUS_M) / NEARBY_RADIUS_M) * 6.4;
  const th = degToRad(bearingDeg);
  return [LATERAL_SIGN * Math.sin(th) * r, -Math.cos(th) * r];
}

/** When there's no compass, spread entities across a frontal arc instead. */
function frontalBearings(count: number): number[] {
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, i) => -40 + (i / (count - 1)) * 80);
}

// ---- error boundary so a bad GLB falls back to a sprite ----
class ModelErrorBoundary extends Component<
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

function useAutoFit(object3d: THREE.Object3D, targetHeight: number) {
  return useMemo(() => {
    const box = new THREE.Box3().setFromObject(object3d);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = targetHeight / (size.y || 1);
    return { scale, center };
  }, [object3d, targetHeight]);
}

// ---- a roaming wild Anymon rendered from its GLB ----
function WildModel({ glbUrl }: { glbUrl: string }) {
  const { scene } = useGLTF(glbUrl);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const { scale, center } = useAutoFit(cloned, 1.3);
  return (
    <group
      scale={scale}
      position={[-center.x * scale, -center.y * scale + 0.65, -center.z * scale]}
    >
      <primitive object={cloned} />
    </group>
  );
}

function WildSprite({ sprite }: { sprite: string }) {
  const tex = useTexture(sprite);
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
  }, [tex]);
  return (
    <Billboard position={[0, 0.85, 0]}>
      <mesh>
        <planeGeometry args={[1.4, 1.4]} />
        <meshBasicMaterial map={tex} transparent alphaTest={0.5} />
      </mesh>
    </Billboard>
  );
}

// Scripted wandering: lerp toward random nearby targets, face travel direction.
function useWander(ref: React.RefObject<THREE.Group>, seed: number) {
  const state = useRef({
    cur: new THREE.Vector2(0, 0),
    target: new THREE.Vector2(0, 0),
    phase: seed % 6.28,
  });
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const s = state.current;
    const d = s.cur.distanceTo(s.target);
    if (d < 0.08) {
      const a = Math.random() * Math.PI * 2;
      const rad = 0.4 + Math.random() * 1.1;
      s.target.set(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    s.cur.lerp(s.target, clamp(delta * 0.6, 0, 0.1));
    g.position.x = s.cur.x;
    g.position.z = s.cur.y;
    s.phase += delta * 1.7;
    g.position.y = Math.sin(s.phase) * 0.07;
    // Face travel direction.
    const dx = s.target.x - s.cur.x;
    const dz = s.target.y - s.cur.y;
    if (dx * dx + dz * dz > 0.001) {
      const yaw = Math.atan2(dx, dz);
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, yaw, clamp(delta * 2, 0, 1));
    }
  });
}

function WildEntity({
  wild,
  bearing,
  busy,
  onEngage,
}: {
  wild: ArWild;
  bearing: number;
  busy: boolean;
  onEngage: (id: string) => void;
}) {
  const [x, z] = placeXZ(bearing, wild.distM);
  const wanderRef = useRef<THREE.Group>(null);
  useWander(wanderRef, x + z);

  const sprite = <WildSprite sprite={wild.spriteDataUri} />;

  return (
    <group position={[x, 0, z]}>
      <group ref={wanderRef}>
        <Suspense fallback={sprite}>
          {wild.ready && wild.glbUrl ? (
            <ModelErrorBoundary fallback={sprite}>
              <WildModel glbUrl={wild.glbUrl} />
            </ModelErrorBoundary>
          ) : (
            sprite
          )}
        </Suspense>
        <Html position={[0, 1.9, 0]} center distanceFactor={9} occlude={false}>
          <div className="pointer-events-auto flex select-none flex-col items-center gap-1">
            <button
              onClick={() => onEngage(wild.id)}
              disabled={busy}
              className="rounded-md border-2 border-anymon-ink bg-anymon-lime px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-anymon-ink shadow-retro disabled:opacity-60"
            >
              {busy ? "…" : "capture"}
            </button>
            <div className="whitespace-nowrap rounded bg-anymon-ink/80 px-1.5 py-0.5 text-[10px] font-bold text-anymon-white">
              {wild.name} · {wild.distM}m
            </div>
          </div>
        </Html>
      </group>
    </group>
  );
}

// ---- a nearby trainer rendered as the shared Player.fbx ----
function TrainerModel() {
  const fbx = useFBX("/models/Player.fbx");
  const cloned = useMemo(() => fbx.clone(true), [fbx]);
  const ref = useRef<THREE.Group>(null);
  const { actions, names } = useAnimations(cloned.animations ?? [], ref);
  const { scale, center } = useAutoFit(cloned, 1.8);

  useEffect(() => {
    const first = names[0];
    if (first && actions[first]) actions[first]?.reset().fadeIn(0.3).play();
    return () => {
      if (first && actions[first]) actions[first]?.fadeOut(0.2);
    };
  }, [actions, names]);

  return (
    <group ref={ref}>
      <group
        scale={scale}
        position={[-center.x * scale, -center.y * scale + 0.9, -center.z * scale]}
      >
        <primitive object={cloned} />
      </group>
    </group>
  );
}

function TrainerFallback() {
  return (
    <mesh position={[0, 0.9, 0]}>
      <capsuleGeometry args={[0.35, 1.0, 4, 8]} />
      <meshStandardMaterial color="#3FB0D6" />
    </mesh>
  );
}

function TrainerEntity({
  trainer,
  bearing,
  busy,
  onChallenge,
}: {
  trainer: ArTrainer;
  bearing: number;
  busy: boolean;
  onChallenge: (userId: string) => void;
}) {
  const [x, z] = placeXZ(bearing, trainer.distM);
  return (
    <group position={[x, 0, z]}>
      <Suspense fallback={<TrainerFallback />}>
        <ModelErrorBoundary fallback={<TrainerFallback />}>
          <TrainerModel />
        </ModelErrorBoundary>
      </Suspense>
      <Html position={[0, 2.2, 0]} center distanceFactor={9} occlude={false}>
        <div className="pointer-events-auto flex select-none flex-col items-center gap-1">
          <button
            onClick={() => onChallenge(trainer.userId)}
            disabled={busy}
            className="rounded-md border-2 border-anymon-ink bg-anymon-berry px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-anymon-white shadow-retro disabled:opacity-60"
          >
            {busy ? "…" : "challenge"}
          </button>
          <div className="whitespace-nowrap rounded bg-anymon-ink/80 px-1.5 py-0.5 text-[10px] font-bold text-anymon-white">
            Trainer {trainer.username} · {trainer.distM}m
          </div>
        </div>
      </Html>
    </group>
  );
}

// Rotates the world group toward the live compass heading (smoothed).
function HeadingGroup({
  heading,
  children,
}: {
  heading: number | null;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const target = heading == null ? 0 : degToRad(heading);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    // Shortest-path lerp around the circle.
    let diff = target - g.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    g.rotation.y += diff * clamp(delta * 3, 0, 1);
  });
  return <group ref={ref}>{children}</group>;
}

function CameraTilt() {
  const { camera } = useThree();
  useEffect(() => {
    camera.rotation.x = -0.16; // look slightly down at the floor
  }, [camera]);
  return null;
}

export default function ArScene({
  wild,
  trainers,
  heading,
  busyWildId,
  busyTrainerId,
  onEngageWild,
  onChallengeTrainer,
  className = "",
}: {
  wild: ArWild[];
  trainers: ArTrainer[];
  heading: number | null;
  busyWildId: string | null;
  busyTrainerId: string | null;
  onEngageWild: (id: string) => void;
  onChallengeTrainer: (userId: string) => void;
  className?: string;
}) {
  // With no compass, spread everything across a frontal arc so it's all visible.
  const noCompass = heading == null;
  const wildBearings = noCompass ? frontalBearings(wild.length) : null;
  const trainerBearings = noCompass ? frontalBearings(trainers.length) : null;

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`}>
      <Canvas
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 1.5, 0], fov: 65, near: 0.1, far: 120 }}
        dpr={[1, 2]}
        style={{ pointerEvents: "none" }}
      >
        <CameraTilt />
        <ambientLight intensity={0.85} />
        <hemisphereLight intensity={0.5} groundColor="#bfe9ff" />
        <directionalLight position={[4, 8, 5]} intensity={1.3} castShadow />
        <directionalLight position={[-4, 3, -3]} intensity={0.4} color="#8BE01E" />

        <HeadingGroup heading={heading}>
          <ContactShadows
            position={[0, 0.01, 0]}
            scale={40}
            blur={2.4}
            far={8}
            opacity={0.45}
            color="#0a1418"
          />
          {wild.map((w, i) => (
            <WildEntity
              key={w.id}
              wild={w}
              bearing={wildBearings ? wildBearings[i] : w.bearing}
              busy={busyWildId === w.id}
              onEngage={onEngageWild}
            />
          ))}
          {trainers.map((t, i) => (
            <TrainerEntity
              key={t.userId}
              trainer={t}
              bearing={trainerBearings ? trainerBearings[i] : t.bearing}
              busy={busyTrainerId === t.userId}
              onChallenge={onChallengeTrainer}
            />
          ))}
        </HeadingGroup>
      </Canvas>
    </div>
  );
}

useFBX.preload?.("/models/Player.fbx");
