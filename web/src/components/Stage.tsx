"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, Line, Trail } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { STATIONS, type StepStatus } from "@/lib/types";

const LIME = new THREE.Color("#c8f135");
const LIME_DIM = new THREE.Color("#7f9c22");
const IDLE = new THREE.Color("#4a5e54");
const ERROR = new THREE.Color("#ff5d5d");

const SPAWN = new THREE.Vector3(-6.4, 0.45, 0);
const STATION_POS = [
  new THREE.Vector3(-4.4, 0, 0.55),
  new THREE.Vector3(-2.2, 0, -0.55),
  new THREE.Vector3(0, 0, 0.55),
  new THREE.Vector3(2.2, 0, -0.55),
  new THREE.Vector3(4.4, 0, 0.55),
];
const TOKEN_Y = 0.45;
const SCENE_WIDTH = 15.5;

const curve = new THREE.CatmullRomCurve3(
  [SPAWN, ...STATION_POS.map((p) => new THREE.Vector3(p.x, TOKEN_Y, p.z))],
  false,
  "centripetal",
);
/** CatmullRom getPoint(t) is index-parametrized: point k sits at k / (n - 1). */
const stationT = (i: number) => (i + 1) / STATION_POS.length;

/** World anchors for the DOM labels: inbox first, then each station. */
const LABEL_ANCHORS = [
  new THREE.Vector3(SPAWN.x, -0.05, SPAWN.z + 0.85),
  ...STATION_POS.map((p) => new THREE.Vector3(p.x, -0.1, p.z + 1.05)),
];

const tmp = new THREE.Vector3();

const chipStyle: Record<StepStatus, string> = {
  pending: "border-edge text-fog/80",
  running: "border-lime/70 text-lime shadow-[0_0_16px_rgba(200,241,53,0.35)]",
  done: "border-lime/30 text-cream",
  error: "border-red-400/60 text-red-300",
};

type StageProps = {
  statuses: StepStatus[];
  active: number;
};

export default function Stage({ statuses, active }: StageProps) {
  const labels = useRef<(HTMLDivElement | null)[]>([]);

  return (
    <div className="relative size-full">
      <Canvas dpr={[1, 1.75]} camera={{ fov: 38, near: 0.1, far: 120 }} gl={{ antialias: true }}>
        <color attach="background" args={["#0b0f0e"]} />
        <hemisphereLight args={["#dfe9e2", "#0b0f0e", 0.7]} />
        <directionalLight position={[4, 8, 6]} intensity={1.6} />
        <directionalLight position={[-6, 3, -4]} intensity={0.5} color="#9aab9f" />
        <CameraRig />
        <LabelProjector labels={labels} />

        <Grid
          position={[0, -0.01, 0]}
          args={[40, 40]}
          cellSize={0.6}
          cellThickness={0.6}
          cellColor="#1a2420"
          sectionSize={3}
          sectionThickness={1}
          sectionColor="#2c3a26"
          fadeDistance={30}
          fadeStrength={1.5}
          infiniteGrid
        />

        <Track statuses={statuses} />
        <Inbox />
        {STATIONS.map((s, i) => (
          <Station key={s.id} index={i} status={statuses[i]} />
        ))}
        <Token active={active} />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden>
        <div
          ref={(el) => {
            labels.current[0] = el;
          }}
          className="absolute top-0 left-0 font-mono text-[10px] tracking-[0.2em] text-fog/70 uppercase will-change-transform"
        >
          inbox
        </div>
        {STATIONS.map((s, i) => (
          <div
            key={s.id}
            ref={(el) => {
              labels.current[i + 1] = el;
            }}
            className={`absolute top-0 left-0 rounded-full border bg-ink/80 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.14em] whitespace-nowrap uppercase backdrop-blur transition-[color,border-color,box-shadow] duration-300 will-change-transform ${chipStyle[statuses[i]]}`}
          >
            {i + 1} · {s.name}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Keeps the whole track in frame for any canvas aspect (desktop → phone). */
function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const { width, height } = useThree((s) => s.size);
  const fog = useRef<THREE.Fog>(null);

  useLayoutEffect(() => {
    const aspect = width / Math.max(height, 1);
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const dist = Math.max(10, SCENE_WIDTH / 2 / (Math.tan(halfFov) * aspect));
    camera.position.copy(new THREE.Vector3(0, 0.62, 1).normalize().multiplyScalar(dist));
    camera.lookAt(0, 0.2, 0);
    camera.updateProjectionMatrix();
    if (fog.current) {
      fog.current.near = dist + 2;
      fog.current.far = dist + 16;
    }
  }, [camera, width, height]);

  return <fog ref={fog} attach="fog" args={["#0b0f0e", 14, 30]} />;
}

/** Positions plain DOM labels over 3D anchors without extra React roots. */
function LabelProjector({ labels }: { labels: RefObject<(HTMLDivElement | null)[]> }) {
  useFrame(({ camera, size }) => {
    LABEL_ANCHORS.forEach((anchor, i) => {
      const el = labels.current[i];
      if (!el) return;
      tmp.copy(anchor).project(camera);
      const x = (tmp.x * 0.5 + 0.5) * size.width;
      const y = (-tmp.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    });
  });
  return null;
}

function Track({ statuses }: { statuses: StepStatus[] }) {
  const segments = useMemo(
    () =>
      STATION_POS.map((_, i) => {
        const from = i === 0 ? 0 : stationT(i - 1);
        const to = stationT(i);
        return Array.from({ length: 24 }, (_, k) => {
          const p = curve.getPoint(from + ((to - from) * k) / 23);
          return [p.x, 0.02, p.z] as [number, number, number];
        });
      }),
    [],
  );

  return (
    <group>
      {segments.map((pts, i) => {
        const lit = statuses[i] !== "pending";
        return (
          <Line
            key={i}
            points={pts}
            color={statuses[i] === "error" ? ERROR : lit ? LIME : IDLE}
            lineWidth={lit ? 2.2 : 1.2}
            transparent
            opacity={lit ? 0.85 : 0.7}
            dashed={!lit}
            dashSize={0.18}
            gapSize={0.12}
          />
        );
      })}
    </group>
  );
}

function Inbox() {
  return (
    <mesh position={[SPAWN.x, 0.04, SPAWN.z]}>
      <cylinderGeometry args={[0.45, 0.5, 0.08, 6]} />
      <meshStandardMaterial color="#1c2521" roughness={0.6} metalness={0.3} />
    </mesh>
  );
}

function StationCore({ index }: { index: number }) {
  switch (index) {
    case 0:
      return <torusGeometry args={[0.36, 0.08, 16, 48]} />;
    case 1:
      return <octahedronGeometry args={[0.42]} />;
    case 2:
      return <icosahedronGeometry args={[0.42, 0]} />;
    case 3:
      return <boxGeometry args={[0.5, 0.5, 0.5]} />;
    default:
      return <dodecahedronGeometry args={[0.4]} />;
  }
}

function Station({ index, status }: { index: number; status: StepStatus }) {
  const core = useRef<THREE.Mesh>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const running = status === "running";
    const pulse = running ? 0.5 + 0.5 * Math.sin(t * 7) : 0;
    const ease = 1 - Math.exp(-delta * 6);

    if (core.current) {
      core.current.rotation.y += delta * (running ? 2.4 : 0.35);
      core.current.rotation.x = index === 0 ? Math.PI / 2 : Math.sin(t * 0.6 + index) * 0.25;
      core.current.position.y = 1 + Math.sin(t * 1.4 + index) * 0.05;
      core.current.scale.setScalar(1 + pulse * 0.14);
    }

    const target = status === "error" ? ERROR : status === "pending" ? IDLE : LIME;
    if (coreMat.current) {
      coreMat.current.emissive.lerp(status === "done" ? LIME_DIM : target, ease);
      coreMat.current.emissiveIntensity = status === "pending" ? 0.35 : 0.7 + pulse * 1.4;
    }
    if (ringMat.current) {
      ringMat.current.color.lerp(target, ease);
      ringMat.current.opacity = status === "pending" ? 0.5 : 0.8 + pulse * 0.2;
    }
    if (halo.current && haloMat.current) {
      const phase = (t * 1.6) % 1;
      halo.current.scale.setScalar(running ? 1.1 + phase * 0.9 : 1);
      haloMat.current.opacity = running ? 0.4 * (1 - phase) : 0;
    }
  });

  return (
    <group position={STATION_POS[index]}>
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.72, 0.78, 0.08, 48]} />
        <meshStandardMaterial color="#1c2521" roughness={0.55} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.6, 0.66, 64]} />
        <meshBasicMaterial ref={ringMat} color={IDLE} transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <mesh ref={halo} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.66, 0.74, 64]} />
        <meshBasicMaterial
          ref={haloMat}
          color={LIME}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={core} position={[0, 1, 0]}>
        <StationCore index={index} />
        <meshStandardMaterial
          ref={coreMat}
          color="#2a3631"
          emissive={IDLE}
          emissiveIntensity={0.35}
          roughness={0.4}
          metalness={0.45}
          flatShading
          wireframe={index === 2}
        />
      </mesh>
    </group>
  );
}

function Token({ active }: { active: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const progress = useRef(0);

  useFrame(({ clock }, delta) => {
    const target = active < 0 ? 0 : active >= STATION_POS.length ? 1 : stationT(active);
    // Snap back to the inbox when a new run starts.
    if (target < progress.current - 0.05 && active <= 0) progress.current = 0;
    progress.current = THREE.MathUtils.damp(progress.current, target, 3.2, delta);

    curve.getPoint(Math.min(progress.current, 1), tmp);
    tmp.y += Math.sin(clock.elapsedTime * 3) * 0.05;
    ref.current?.position.copy(tmp);
    if (light.current) {
      light.current.position.copy(tmp).setY(tmp.y + 0.4);
      light.current.intensity = active < 0 ? 1.5 : 4;
    }
  });

  return (
    <>
      <Trail width={1.4} length={5} color={LIME} attenuation={(w) => w * w} decay={1.2}>
        <mesh ref={ref} position={[SPAWN.x, TOKEN_Y, SPAWN.z]}>
          <sphereGeometry args={[0.15, 24, 24]} />
          <meshBasicMaterial color={LIME} toneMapped={false} />
        </mesh>
      </Trail>
      <pointLight ref={light} color={LIME} distance={3.5} decay={1.6} intensity={1.5} />
    </>
  );
}
