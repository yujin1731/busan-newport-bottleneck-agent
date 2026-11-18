import { useMemo } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { COL } from './palette';
import { hash } from './geo';
import { Boxes, type Bx } from './Equipment';
import { MapLand, MapExtras } from './MapLand';
import { useUI, peekHold } from '../store';
import type { Terminal, Layout } from '../data/types';

export const PAD_H = 0.6;

// 바다 물결 무늬 (캔버스로 만든 반복 텍스처)
function useWaterTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = COL.sea;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 140; i++) {
      const x = hash('wx' + i) * 256, y = hash('wy' + i) * 256, w = 12 + hash('ww' + i) * 34;
      g.strokeStyle = i % 3 ? 'rgba(255,255,255,0.22)' : 'rgba(80,130,180,0.12)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + w / 2, y - 2.5, x + w, y);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(42, 36);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

// 배후 부지의 흰 창고·건물 (시연용 배경)
function hinterland(l: Layout): Bx[] {
  const out: Bx[] = [];
  for (const d of l.land) {
    const r = d.rect;
    const step = 24;
    for (let x = r.x0 + 10; x < r.x1 - 10; x += step) for (let z = r.z0 + 10; z < r.z1 - 10; z += step) {
      const k = hash(`${d.id}${Math.round(x)}${Math.round(z)}`);
      if (k < 0.3) continue;
      // 도로와 터미널 근처는 비운다
      const nearRoad = l.nodes.some((n) => Math.abs(n.z - z) < 9 && n.kind !== 'gate') || l.nodes.some((n) => Math.abs(n.x - x) < 9 && n.kind === 'junction');
      const inTerm = l.terminals.some((t) => x > t.rect.x0 - 8 && x < t.rect.x1 + 8 && z > t.rect.z0 - 8 && z < t.rect.z1 + 8);
      if (nearRoad || inTerm) continue;
      const kind = hash('k' + x + z);
      if (kind < 0.55) {
        // 물류 창고: 흰 벽 + 파란 지붕 줄무늬
        const w = 14 + k * 6, dd = 9 + hash('d' + x + z) * 4, h = 2.6 + hash('h' + x + z) * 1.6;
        out.push({ p: [x, 0.3 + h / 2, z], s: [w, h, dd], c: COL.building });
        for (let i = 0; i < 4; i++) {
          const zz = z - dd / 2 + (i + 0.5) * (dd / 4);
          out.push({ p: [x, 0.3 + h + 0.15, zz], s: [w - 0.4, 0.3, dd / 4 - 0.5], c: i % 2 ? COL.roofBlue : COL.roofBlueDark });
        }
        // 하역 도크 문
        for (let i = 0; i < 4; i++) out.push({ p: [x - w / 2 + 2 + i * 3, 0.3 + 0.8, z + dd / 2 + 0.05], s: [1.6, 1.4, 0.1], c: COL.roofBlueDark });
      } else if (kind < 0.8) {
        // 사무동
        const w = 6 + k * 3, dd = 5 + k * 2, h = 4 + hash('h' + x + z) * 5;
        out.push({ p: [x, 0.3 + h / 2, z], s: [w, h, dd], c: COL.building });
        out.push({ p: [x, 0.3 + h + 0.1, z], s: [w - 0.8, 0.2, dd - 0.8], c: COL.buildingRoof });
      } else {
        // 낮은 창고 2동
        for (const o of [-4, 4]) {
          out.push({ p: [x + o, 1.4, z], s: [6.5, 2.2, 9], c: COL.building });
          out.push({ p: [x + o, 2.6, z], s: [6.3, 0.25, 8.8], c: COL.roofBlue });
        }
      }
    }
  }
  return out;
}

export function Ground() {
  const data = useUI((s) => s.data)!;
  const l = data.layout;
  const water = useWaterTexture();
  const buildings = useMemo(() => hinterland(l), [l]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[30, -0.05, 20]} receiveShadow>
        <planeGeometry args={[2600, 2200]} />
        <meshStandardMaterial map={water} roughness={0.55} metalness={0.05} />
      </mesh>
      {/* 육지는 지도형 다각형으로(실제 신항 배치) */}
      <MapLand />
      <MapExtras />
      <Boxes items={buildings} shadows />
      {l.terminals.map((t) => <Pad key={t.id} t={t} />)}
    </group>
  );
}

function laneLines(t: Terminal, l: Layout): Bx[] {
  // 블록 사이 흰 차선
  const C = l.container;
  const out: Bx[] = [];
  for (const b of t.blocks) {
    const bl = b.bays * (C.L + C.gapL), bw = b.rows * (C.W + C.gapW);
    out.push({ p: [b.cx, PAD_H + 0.02, b.cz - bw / 2 - 0.9], s: [bl + 1.6, 0.04, 0.18], c: COL.lane });
    out.push({ p: [b.cx, PAD_H + 0.02, b.cz + bw / 2 + 0.9], s: [bl + 1.6, 0.04, 0.18], c: COL.lane });
  }
  return out;
}

function Pad({ t }: { t: Terminal }) {
  const r = t.rect;
  const set = useUI((s) => s.set);
  const data = useUI((s) => s.data)!;
  const { camera, controls } = useThree();
  // 확대한 화면(카드로 구역을 골랐거나 휠로 확대)에서는 터미널을 눌러야 CCTV 히트맵이 뜬다
  const isZoomed = () => {
    const minZ = (controls as unknown as { minZoom?: number } | null)?.minZoom;
    return useUI.getState().focus !== 'port' || (minZ !== undefined && (camera as THREE.OrthographicCamera).zoom > minZ * 1.35);
  };
  const lanes = useMemo(() => laneLines(t, data.layout), [t, data]);
  const apron = useMemo(() => {
    const a = 10;
    if (t.quay === 'E') return { x: r.x1 - a / 2, z: (r.z0 + r.z1) / 2, w: a, d: r.z1 - r.z0 };
    if (t.quay === 'S') return { x: (r.x0 + r.x1) / 2, z: r.z1 - a / 2, w: r.x1 - r.x0, d: a };
    return { x: (r.x0 + r.x1) / 2, z: r.z0 + a / 2, w: r.x1 - r.x0, d: a };
  }, [t]);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const s = useUI.getState();
    // 눌러서 확인하는 기능은 관제 화면(S1)의 확대 상태에서만 안내한다(확대 전에는 마우스를 올리면 바로 뜬다)
    if (s.step !== 1 || !isZoomed()) { if (s.hover) s.set({ hover: null }); return; }
    s.set({ hover: { id: t.id, title: '눌러서 확인', lines: [], x: e.nativeEvent.clientX, y: e.nativeEvent.clientY } });
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (useUI.getState().step !== 1) return;
    peekHold();
    set({ hover: null, peek: { tid: t.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, seaY: 0 } });
  };

  return (
    <group>
      <mesh position={[(r.x0 + r.x1) / 2, PAD_H / 2, (r.z0 + r.z1) / 2]} onPointerMove={onMove} onPointerOut={() => set({ hover: null })} onClick={onClick} receiveShadow>
        <boxGeometry args={[r.x1 - r.x0, PAD_H, r.z1 - r.z0]} />
        <meshStandardMaterial color={COL.pad} roughness={0.95} />
      </mesh>
      <mesh position={[apron.x, PAD_H + 0.01, apron.z]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[apron.w, apron.d]} />
        <meshStandardMaterial color={COL.apron} roughness={1} />
      </mesh>
      <Boxes items={lanes} />
    </group>
  );
}
