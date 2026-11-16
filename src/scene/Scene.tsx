import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import * as THREE from 'three';
import { COL } from './palette';
import { Ground } from './Ground';
import { Containers, OccupancyPads, TempFill } from './Yard';
import { Equipment, Ships } from './Equipment';
import { Roads, Vehicles, QueueTint } from './Roads';
import { CauseMarker, Propagation, ActionRoute, Labels, BlockLabels } from './Markers';
import { useUI } from '../store';

// 화면 단계별 보는 범위 (장면 좌표, 북쪽이 위)
const VIEWS: Record<string, { x0: number; x1: number; z0: number; z1: number }> = {
  port: { x0: -335, x1: 302, z0: -150, z1: 175 }, // 배후단지·시가지·남컨 배후까지 지도처럼 함께 보이게
  DGT: { x0: -325, x1: -215, z0: -108, z1: 34 },
  'DGT+HJNC': { x0: -325, x1: -28, z0: -108, z1: 34 },
};
// 시점 두 가지: 항만 전체는 정면(남쪽에서, 북쪽이 위), 확대·시뮬레이션은 남동쪽 사선(아이소메트릭)
type Basis = { dir: THREE.Vector3; offset: THREE.Vector3; right: THREE.Vector3; sup: THREE.Vector3 };
function basis(d: THREE.Vector3): Basis {
  const dir = d.clone().normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
  return { dir, offset: dir.clone().multiplyScalar(900), right, sup: dir.clone().cross(right).normalize() };
}
const FRONT = basis(new THREE.Vector3(0, 1, 0.78));
const DIAG = basis(new THREE.Vector3(0.55, 1, 0.8));
const OFFSET = FRONT.offset;

// 범위 상자(높이 12 포함)의 화면 투영 크기와 중심
function project(b: { x0: number; x1: number; z0: number; z1: number }, B: Basis) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) for (const y of [0, 12]) {
    const p = new THREE.Vector3(x, y, z);
    const u = p.dot(B.right), v = p.dot(B.sup);
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  return { du: u1 - u0, dv: v1 - v0, um: (u0 + u1) / 2, vm: (v0 + v1) / 2 };
}

// 화면 좌표(u, v) 이동량을 지면(x, z) 이동량으로 바꾼다
function groundFor(du: number, dv: number, B: Basis) {
  const a = B.right.x, b = B.right.z, c = B.sup.x, d = B.sup.z;
  const det = a * d - b * c;
  return { x: (du * d - b * dv) / det, z: (a * dv - c * du) / det };
}

// 화면 위 카드가 가리는 여백(px)
export function insets(step: number, width: number, panel = true, ov = true) {
  const right = step === 1 ? (width < 1500 ? 320 : 360) : (width < 1500 ? 384 : 424); // S1 오른쪽 열은 더 좁다
  const left = 40; // 항만 현황·경보 목록은 오른쪽. 왼쪽은 DGT 카드 여백만
  return { top: 70, bottom: 0, left, right: panel || (step === 1 && ov) ? right + 90 : 24 };
}

function boundsFor(focus: string) {
  if (VIEWS[focus]) return VIEWS[focus];
  const t = useUI.getState().data!.layout.terminals.find((x) => x.id === focus);
  if (!t) return VIEWS.port;
  const r = t.rect;
  // 터미널 안쪽(블록·컨테이너)을 실무 화면처럼 바짝 확대
  return { x0: r.x0 - 4, x1: r.x1 + 4, z0: r.z0 - 4, z1: r.z1 + 4 };
}

function CameraRig() {
  const focus = useUI((s) => s.focus);
  const step = useUI((s) => s.step);
  const alertsOpen = useUI((s) => s.alertsOpen);
  const ovOpen = useUI((s) => s.ovOpen);
  const { camera, size, controls } = useThree();
  const anim = useRef<null | { t: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromZ: number; toZ: number; fromO: THREE.Vector3; toO: THREE.Vector3 }>(null);
  const synced = useRef(false);

  useEffect(() => {
    const b = boundsFor(focus);
    const ins = insets(step, size.width, step !== 1 || alertsOpen, ovOpen);
    const aw = size.width - ins.left - ins.right, ah = size.height - ins.top - ins.bottom;
    const diag = focus !== 'port';
    const B = diag ? DIAG : FRONT;
    const pr = project(b, B);
    // 전체: 가로는 잘리지 않게, 세로만 확대 여유. 확대(진단·대응): 주변이 보이게 한 단계 덜 확대
    const zoom = diag ? Math.min(aw / pr.du, ah / pr.dv) * (focus === 'DGT' ? 0.92 : focus === 'DGT+HJNC' ? 0.92 : 0.78) : Math.min(aw / pr.du, (ah / pr.dv) * 1.16);
    // 상자 중심이 카드 사이 빈 영역의 가운데에 오도록 목표점을 옮긴다
    const dx = (ins.left - ins.right) / 2, dy = (ins.top - ins.bottom) / 2;
    const wantU = pr.um - dx / zoom, wantV = pr.vm + dy / zoom;
    const g = groundFor(wantU, wantV, B);
    const target = new THREE.Vector3(g.x, 0, g.z);
    const ctl = controls as unknown as { target: THREE.Vector3; update: () => void; minZoom: number } | null;
    // 축소 한계: 항만 전체 화면보다 더 멀어지지 않게 (지도 가장자리가 보이지 않도록)
    const pf = project(VIEWS.port, FRONT);
    if (ctl) ctl.minZoom = Math.min(aw / pf.du, (ah / pf.dv) * 1.16) * 0.97;
    if (!ctl || !synced.current) {
      camera.position.copy(target).add(B.offset);
      (camera as THREE.OrthographicCamera).zoom = zoom;
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      if (ctl) { ctl.target.copy(target); ctl.update(); synced.current = true; }
      anim.current = null;
      return;
    }
    anim.current = { t: 0, fromT: ctl.target.clone(), toT: target, fromZ: (camera as THREE.OrthographicCamera).zoom, toZ: zoom, fromO: camera.position.clone().sub(ctl.target), toO: B.offset.clone() };
  }, [focus, step, alertsOpen, ovOpen, size.width, size.height, controls]);

  useFrame((_, dt) => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__twin = { camera, controls, size };
    const a = anim.current;
    const ctl = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    // 이동 한계: 항만 범위 밖으로 끌고 나가지 않게 목표점을 묶는다
    if (ctl && !a) {
      const B = VIEWS.port, t = ctl.target;
      const cx = THREE.MathUtils.clamp(t.x, B.x0, B.x1), cz = THREE.MathUtils.clamp(t.z, B.z0, B.z1);
      if (cx !== t.x || cz !== t.z) { camera.position.x += cx - t.x; camera.position.z += cz - t.z; t.set(cx, t.y, cz); ctl.update(); }
    }
    if (!a || !ctl) return;
    a.t = Math.min(1, a.t + dt / 0.8);
    const e = 1 - Math.pow(1 - a.t, 3);
    ctl.target.lerpVectors(a.fromT, a.toT, e);
    // 시점 방향도 같이 돌린다 (정면 ↔ 사선)
    const o = a.fromO.clone().lerp(a.toO, e).setLength(900);
    camera.position.copy(ctl.target).add(o);
    camera.lookAt(ctl.target);
    (camera as THREE.OrthographicCamera).zoom = a.fromZ + (a.toZ - a.fromZ) * e;
    camera.updateProjectionMatrix();
    ctl.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

function SimClock() {
  useFrame((_, dt) => {
    const s = useUI.getState();
    if (!s.playing || s.step < 3) return;
    const t = Math.min(36, s.simT + dt * s.speed); // 1x: 초당 10분
    s.set({ simT: t, playing: t < 36 });
  });
  return null;
}

function Sun() {
  const ref = useRef<THREE.DirectionalLight>(null!);
  useEffect(() => {
    const cam = ref.current.shadow.camera as THREE.OrthographicCamera;
    Object.assign(cam, { left: -420, right: 420, top: 260, bottom: -260, near: 1, far: 1600 });
    cam.updateProjectionMatrix();
    ref.current.target.position.set(10, 0, 30);
    ref.current.target.updateMatrixWorld();
  }, []);
  return (
    <directionalLight
      ref={ref}
      position={[-260, 520, -160]}
      intensity={1.35}
      castShadow
      shadow-mapSize={[4096, 4096]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.4}
    />
  );
}

export function Scene() {
  const step = useUI((s) => s.step);
  const data = useUI((s) => s.data);
  if (!data) return null;
  return (
    <Canvas
      orthographic
      shadows
      dpr={[1, 2]}
      camera={{ position: [OFFSET.x, OFFSET.y, OFFSET.z], zoom: 1.2, near: -2000, far: 5000 }}
      gl={{ antialias: true }}
      onPointerMissed={() => useUI.getState().set({ hover: null })}
    >
      <color attach="background" args={[COL.bg]} />
      <hemisphereLight args={['#ffffff', '#9fb2c8', 0.85]} />
      <Sun />
      <MapControls makeDefault enableRotate={false} enableDamping dampingFactor={0.12} minZoom={0.6} maxZoom={40} zoomSpeed={1.1} />
      <CameraRig />
      <SimClock />
      <fog attach="fog" args={[COL.bg, 1050, 2100]} />
      <Ground />
      <Roads />
      <QueueTint />
      <Containers />
      <OccupancyPads />
      <TempFill />
      <Equipment />
      <Ships />
      <Vehicles />
      {step <= 3 && <CauseMarker />}
      {step <= 2 && <Propagation />}
      <ActionRoute />
      <Labels />
      <BlockLabels />
    </Canvas>
  );
}
