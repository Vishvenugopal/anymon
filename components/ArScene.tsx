"use client";

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
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

// Map a roamer's real distance (m, within NEARBY_RADIUS_M) to readable depth
// cues: near = big + fully opaque + grounded, far = small + faded + lifted.
function depthCues(distM: number) {
  const t = clamp(distM, 0, NEARBY_RADIUS_M) / NEARBY_RADIUS_M; // 0 near .. 1 far
  return {
    height: THREE.MathUtils.lerp(1.8, 0.55, t), // noticeable scale range
    opacity: 1, // models/sprites stay fully opaque (distance read via size+lift)
    lift: THREE.MathUtils.lerp(0.55, 1.15, t), // far ones sit higher (horizon)
  };
}

// ---- a roaming wild Anymon rendered from its GLB ----
function WildModel({
  glbUrl,
  height,
  opacity,
  lift,
}: {
  glbUrl: string;
  height: number;
  opacity: number;
  lift: number;
}) {
  const { scene } = useGLTF(glbUrl);
  // Clone materials too so per-roamer opacity doesn't bleed across instances.
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((m) => m.clone())
          : mesh.material.clone();
      }
    });
    return c;
  }, [scene]);
  const { scale, center } = useAutoFit(cloned, height);

  useEffect(() => {
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      const apply = (m: THREE.Material) => {
        m.transparent = opacity < 1;
        m.opacity = opacity;
        m.depthWrite = opacity >= 1;
      };
      Array.isArray(mat) ? mat.forEach(apply) : apply(mat);
    });
  }, [cloned, opacity]);

  return (
    <group
      scale={scale}
      position={[-center.x * scale, -center.y * scale + lift, -center.z * scale]}
    >
      <primitive object={cloned} />
    </group>
  );
}

function WildSprite({
  sprite,
  height = 1.4,
  opacity = 1,
  lift = 0.85,
}: {
  sprite: string;
  height?: number;
  opacity?: number;
  lift?: number;
}) {
  const tex = useTexture(sprite);
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
  }, [tex]);
  // Cylindrical billboard: lock pitch/roll so the sprite stays UPRIGHT and
  // world-anchored, only yawing to face the viewer horizontally. A full
  // billboard would also rotate to face the camera as you tilt up/down, so it
  // looked identical at every pitch; locking X/Z makes it foreshorten and slide
  // up/down with the ground as the phone pitches (see CameraRig).
  return (
    <Billboard position={[0, lift, 0]} lockX lockZ>
      <mesh>
        <planeGeometry args={[height, height]} />
        <meshBasicMaterial map={tex} transparent alphaTest={0.4} opacity={opacity} />
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
  showOverlays,
  onEngage,
}: {
  wild: ArWild;
  bearing: number;
  busy: boolean;
  showOverlays: boolean;
  onEngage: (id: string) => void;
}) {
  const [x, z] = placeXZ(bearing, wild.distM);
  const wanderRef = useRef<THREE.Group>(null);
  useWander(wanderRef, x + z);

  const { height, opacity, lift } = depthCues(wild.distM);
  const sprite = (
    <WildSprite
      sprite={wild.spriteDataUri}
      height={height}
      opacity={opacity}
      lift={lift}
    />
  );

  return (
    <group position={[x, 0, z]}>
      <group ref={wanderRef}>
        <Suspense fallback={sprite}>
          {wild.ready && wild.glbUrl ? (
            <ModelErrorBoundary fallback={sprite}>
              <WildModel
                glbUrl={wild.glbUrl}
                height={height}
                opacity={opacity}
                lift={lift}
              />
            </ModelErrorBoundary>
          ) : (
            sprite
          )}
        </Suspense>
        {showOverlays && (
          <Html
            position={[0, lift + height + 0.4, 0]}
            center
            distanceFactor={9}
            occlude={false}
            // Positive z-index floor keeps nameplates above the 3D canvas, but
            // low enough that full-screen modals (raised z-index) still win.
            zIndexRange={[40, 20]}
          >
            <div className="pointer-events-auto flex select-none flex-col items-center gap-1">
              <button
                onClick={() => onEngage(wild.id)}
                disabled={busy}
                className="rounded-gummy border-2 border-anymon-edgelime bg-anymon-lime px-2 py-0.5 text-[11px] uppercase tracking-wide text-anymon-ink shadow-retro disabled:opacity-60"
              >
                {busy ? "…" : "capture"}
              </button>
              <div className="whitespace-nowrap rounded-gummy bg-anymon-ink/80 px-1.5 py-0.5 text-[10px] text-anymon-white">
                {wild.name} · {wild.distM}m
              </div>
            </div>
          </Html>
        )}
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
  showOverlays,
  onChallenge,
}: {
  trainer: ArTrainer;
  bearing: number;
  busy: boolean;
  showOverlays: boolean;
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
      {showOverlays && (
        <Html
          position={[0, 2.2, 0]}
          center
          distanceFactor={9}
          occlude={false}
          zIndexRange={[40, 20]}
        >
          <div className="pointer-events-auto flex select-none flex-col items-center gap-1">
            <button
              onClick={() => onChallenge(trainer.userId)}
              disabled={busy}
              className="rounded-gummy border-2 border-anymon-edgeberry bg-anymon-berry px-2 py-0.5 text-[11px] uppercase tracking-wide text-anymon-white shadow-retro-berry disabled:opacity-60"
            >
              {busy ? "…" : "challenge"}
            </button>
            <div className="whitespace-nowrap rounded-gummy bg-anymon-ink/80 px-1.5 py-0.5 text-[10px] text-anymon-white">
              Trainer {trainer.username} · {trainer.distM}m
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// Live device orientation, self-contained inside the AR scene so objects feel
// anchored to the real world as the phone pans. Exposes refs (read each frame
// to avoid re-rendering on every sensor tick):
//   headingRef  -> compass heading in degrees (0=N, clockwise) or null
//   pitchRef    -> phone tilt offset in radians (0 when held upright)
// On iOS, DeviceOrientationEvent.requestPermission() must be triggered by a
// user gesture, so we request it once on the first tap/touch anywhere.
function useDeviceOrientation() {
  const headingRef = useRef<number | null>(null);
  const pitchRef = useRef(0);
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);

  useEffect(() => {
    const onOrient = (
      e: DeviceOrientationEvent & { webkitCompassHeading?: number },
    ) => {
      // --- heading (yaw) ---
      let h: number | null = null;
      if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;
      else if (typeof e.alpha === "number") h = 360 - e.alpha;
      if (h != null && !Number.isNaN(h)) {
        headingRef.current = ((h % 360) + 360) % 360;
      }
      // --- pitch (look up/down) --- beta≈90 means phone held vertical/upright,
      // which we treat as the neutral (0) tilt. Clamp so you can't flip over.
      if (typeof e.beta === "number" && !Number.isNaN(e.beta)) {
        pitchRef.current = degToRad(clamp(e.beta - 90, -55, 55));
      }
      if (!activeRef.current) {
        activeRef.current = true;
        setActive(true);
      }
    };

    window.addEventListener("deviceorientation", onOrient, true);
    // Absolute variant (when available) gives a true compass-referenced yaw.
    // Not in the standard WindowEventMap, so cast the listener.
    window.addEventListener(
      "deviceorientationabsolute",
      onOrient as EventListener,
      true,
    );

    // One-time iOS permission request on the first user gesture. Falls back
    // silently (existing behavior) if denied or unsupported.
    let detachGesture = () => {};
    const D = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const requestPermission = D?.requestPermission;
    if (typeof requestPermission === "function") {
      const requestOnce = () => {
        requestPermission.call(D).catch(() => {});
        detachGesture();
      };
      window.addEventListener("pointerdown", requestOnce, { once: true });
      window.addEventListener("touchend", requestOnce, { once: true });
      detachGesture = () => {
        window.removeEventListener("pointerdown", requestOnce);
        window.removeEventListener("touchend", requestOnce);
      };
    }

    return () => {
      window.removeEventListener("deviceorientation", onOrient, true);
      window.removeEventListener(
        "deviceorientationabsolute",
        onOrient as EventListener,
        true,
      );
      detachGesture();
    };
  }, []);

  return { headingRef, pitchRef, active };
}

// Rotates the world group toward the live compass heading (smoothed). Prefers
// the scene's own orientation sensor; falls back to the heading prop.
function HeadingGroup({
  headingRef,
  fallbackHeading,
  children,
}: {
  headingRef: React.RefObject<number | null>;
  fallbackHeading: number | null;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const h = headingRef.current ?? fallbackHeading;
    const target = h == null ? 0 : degToRad(h);
    // Shortest-path lerp around the circle.
    let diff = target - g.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    g.rotation.y += diff * clamp(delta * 3, 0, 1);
  });
  return <group ref={ref}>{children}</group>;
}

// Tilts the camera to look slightly down at the floor, plus the live device
// pitch so panning the phone up/down moves the world (smoothed to kill jitter).
function CameraRig({ pitchRef }: { pitchRef: React.RefObject<number> }) {
  const { camera } = useThree();
  useFrame((_, delta) => {
    const target = -0.16 + (pitchRef.current ?? 0);
    camera.rotation.x = THREE.MathUtils.lerp(
      camera.rotation.x,
      target,
      clamp(delta * 4, 0, 1),
    );
  });
  return null;
}

export default function ArScene({
  wild,
  trainers,
  heading,
  busyWildId,
  busyTrainerId,
  showOverlays = true,
  onEngageWild,
  onChallengeTrainer,
  className = "",
}: {
  wild: ArWild[];
  trainers: ArTrainer[];
  heading: number | null;
  busyWildId: string | null;
  busyTrainerId: string | null;
  // Hide the drei <Html> nameplates/buttons while a full-screen modal (capture/
  // incubating, wild battle, or PvP) is open so they don't bleed over it.
  showOverlays?: boolean;
  onEngageWild: (id: string) => void;
  onChallengeTrainer: (userId: string) => void;
  className?: string;
}) {
  // The scene tracks the device's own orientation so Anymon stay world-anchored
  // as the phone pans (yaw) and tilts (pitch). Falls back to the heading prop.
  const { headingRef, pitchRef, active: orientationActive } =
    useDeviceOrientation();

  // With no compass at all, spread everything across a frontal arc so it's all
  // visible; once any orientation source is live we use real bearings instead.
  const noCompass = heading == null && !orientationActive;
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
        <CameraRig pitchRef={pitchRef} />
        <ambientLight intensity={0.85} />
        <hemisphereLight intensity={0.5} groundColor="#bfe9ff" />
        <directionalLight position={[4, 8, 5]} intensity={1.3} castShadow />
        <directionalLight position={[-4, 3, -3]} intensity={0.4} color="#8BE01E" />

        <HeadingGroup headingRef={headingRef} fallbackHeading={heading}>
          <ContactShadows
            position={[0, 0.01, 0]}
            scale={40}
            blur={2.4}
            far={8}
            opacity={0.45}
            color="#04222a"
          />
          {wild.map((w, i) => (
            <WildEntity
              key={w.id}
              wild={w}
              bearing={wildBearings ? wildBearings[i] : w.bearing}
              busy={busyWildId === w.id}
              showOverlays={showOverlays}
              onEngage={onEngageWild}
            />
          ))}
          {trainers.map((t, i) => (
            <TrainerEntity
              key={t.userId}
              trainer={t}
              bearing={trainerBearings ? trainerBearings[i] : t.bearing}
              busy={busyTrainerId === t.userId}
              showOverlays={showOverlays}
              onChallenge={onChallengeTrainer}
            />
          ))}
        </HeadingGroup>
      </Canvas>
    </div>
  );
}

useFBX.preload?.("/models/Player.fbx");
