import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COL } from './palette';
import { plans, PAD_TOP, type OBox, type Plan } from './zones';
import type { V2 } from './geo';
import { Segment } from './Roads';
import { useUI } from '../store';
import { useView } from '../view';
import { camViews } from '../ui/CctvPeek';

const ROAD_Y = 0.34;
const YARD_Y = PAD_TOP + 0.04;
const LANE = 1.35;

// 바닥 다각형(월드 x,z 점들)
function Poly({ pts, y, color, opacity = 1 }: { pts: V2[]; y: number; color: string; opacity?: number }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    return new THREE.ShapeGeometry(s);
  }, [pts]);
  return (
    <mesh geometry={geo} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      {opacity < 1 ? <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} /> : <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} />}
    </mesh>
  );
}

const WHITE = '#ffffff';

// 터미널 공통 틀: 접속부(나팔형 분기) · 대기 차로(넓은 차로) · 구내 도로(게이트 → 야드 앞)
function Access({ p }: { p: Plan }) {
  const ez = p.d0 + p.flare;
  const flare: V2[] = [p.at(p.d0 - 1.6, 7.6), p.at(ez, 2.9), p.at(ez, -2.9), p.at(p.d0 - 1.6, -7.6)];
  const q0 = p.dQ0, q1 = p.L - 1.4;
  const wait: V2[] = [p.at(q0 - 4, 2.7), p.at(q0, 4.8), p.at(q1, 4.8), p.at(q1, -4.8), p.at(q0, -4.8), p.at(q0 - 4, -2.7)];
  const yy = (a: V2, b: V2, w: number, y: number, color: string) => <Segment a={a} b={b} w={w} color={color} y={y} extend={0} />;
  return (
    <group>
      {/* 1 도로 접속부: 본선에서 갈라지는 나팔형 분기 */}
      <Poly pts={flare} y={ROAD_Y + 0.025} color={COL.road} />
      <Line points={[[p.at(p.d0 - 1.6, 7.6)[0], ROAD_Y + 0.07, p.at(p.d0 - 1.6, 7.6)[1]], [p.at(ez, 2.9)[0], ROAD_Y + 0.07, p.at(ez, 2.9)[1]]]} color={WHITE} lineWidth={1.4} />
      <Line points={[[p.at(p.d0 - 1.6, -7.6)[0], ROAD_Y + 0.07, p.at(p.d0 - 1.6, -7.6)[1]], [p.at(ez, -2.9)[0], ROAD_Y + 0.07, p.at(ez, -2.9)[1]]]} color={WHITE} lineWidth={1.4} />
      {/* 3 대기 차로: 게이트 직전에 넓어지는 차로 */}
      <Poly pts={wait} y={ROAD_Y + 0.03} color={COL.road} />
      {[4.8, -4.8].map((o) => (
        <Line key={o} points={[[p.at(q0, o)[0], ROAD_Y + 0.07, p.at(q0, o)[1]], [p.at(q1, o)[0], ROAD_Y + 0.07, p.at(q1, o)[1]]]} color={WHITE} lineWidth={1.4} />
      ))}
      {[0.0].map((o) => (
        <Line key={o} points={[[p.at(q0, o)[0], ROAD_Y + 0.07, p.at(q0, o)[1]], [p.at(q1, o)[0], ROAD_Y + 0.07, p.at(q1, o)[1]]]} color={WHITE} lineWidth={1} dashed dashSize={1.5} gapSize={1.3} />
      ))}
      {/* 4 구내 도로: 게이트 → 야드 앞 도로 */}
      {yy(p.g, p.yardC, 4.2, YARD_Y, COL.road)}
      {yy(p.yardA, p.yardB, 3.8, YARD_Y, COL.road)}
      <Line points={[[p.yardA[0], YARD_Y + 0.04, p.yardA[1]], [p.yardB[0], YARD_Y + 0.04, p.yardB[1]]]} color={WHITE} lineWidth={1} dashed dashSize={1.6} gapSize={1.4} />
    </group>
  );
}

export function TerminalRoads() {
  const { data } = useView();
  const P = plans(data.layout);
  return <group>{data.layout.terminals.map((t) => <Access key={t.id} p={P[t.id]} />)}</group>;
}

// ---- 트럭 흐름: 접속부 → 진입로 → 대기 차로 → 게이트 → 야드 앞 도로 ----
function useTruckGeometry() {
  return useMemo(() => {
    const cab = new THREE.BoxGeometry(0.75, 0.9, 0.95); cab.translate(1.05, 0.45, 0);
    const box = new THREE.BoxGeometry(1.75, 0.95, 0.95); box.translate(-0.35, 0.5, 0);
    return mergeGeometries([cab, box]);
  }, []);
}

interface Seg { a: V2; b: V2; off0: number; off1: number; y: number; time: number }
// 한 터미널의 구간 목록(구간마다 걸리는 시간이 달라 대기 차로에서 천천히 기어간다)
function segsFor(p: Plan, side: 1 | -1, q: number): Seg[] {
  const crawl = 4 + 16 * Math.min(1, q / 50);
  const yEnd = side === 1 ? p.yardB : p.yardA;
  return [
    { a: p.start, b: p.at(p.d0), off0: LANE, off1: LANE, y: ROAD_Y, time: 2.2 }, // 도로 접속부
    { a: p.at(p.d0), b: p.at(p.dQ0), off0: LANE, off1: LANE, y: ROAD_Y, time: 2.4 }, // 게이트 진입로
    { a: p.at(p.dQ0), b: p.at(p.L - 1.5), off0: LANE, off1: 3.3, y: ROAD_Y, time: crawl }, // 대기 차로
    { a: p.at(p.L - 1.5), b: p.g, off0: 3.3, off1: 0, y: ROAD_Y, time: 1.6 }, // 게이트
    { a: p.g, b: p.yardC, off0: 0, off1: 0, y: YARD_Y, time: 1.4 },
    { a: p.yardC, b: yEnd, off0: 0, off1: 0, y: YARD_Y, time: 4.5 }, // 야드 앞 도로
  ];
}

const PER = 7; // 터미널당 트럭 수

export function TerminalFlow() {
  const { data, queues } = useView();
  const P = plans(data.layout);
  const ref = useRef<THREE.InstancedMesh>(null!);
  const geo = useTruckGeometry();
  const total = data.layout.terminals.length * PER;
  const items = useMemo(() => {
    return data.layout.terminals.flatMap((t, ti) => {
      const q = queues[`g_${t.id}`] ?? 0;
      return Array.from({ length: PER }, (_, k) => ({ t: t.id, segs: segsFor(P[t.id], k % 2 ? 1 : -1, q), phase: (k / PER) * 1 + ti * 0.13 }));
    });
  }, [data.layout, P, queues]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const qt = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);

  useLayoutEffect(() => { ref.current.count = items.length; }, [items]);
  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    items.forEach((it, i) => {
      const T = it.segs.reduce((a, s) => a + s.time, 0);
      let tt = (time + it.phase * T) % T;
      let s = it.segs[0];
      for (const sg of it.segs) { if (tt <= sg.time) { s = sg; break; } tt -= sg.time; s = sg; }
      const f = Math.min(1, Math.max(0, tt / s.time));
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], len = Math.hypot(dx, dz) || 1;
      const ux = dx / len, uz = dz / len;
      const off = s.off0 + (s.off1 - s.off0) * f;
      qt.setFromAxisAngle(up, -Math.atan2(uz, ux));
      m.compose(pos.set(s.a[0] + dx * f - uz * off, s.y, s.a[1] + dz * f + ux * off), qt, one);
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geo, undefined, total]} frustumCulled={false} castShadow>
      <meshStandardMaterial color={COL.truckCab} roughness={0.5} />
    </instancedMesh>
  );
}

// ---- 히트맵 카드로 고른 구역 바닥을 혼잡 색으로 칠한다 ----
export function ZoneTint() {
  const sel = useUI((s) => s.zoneSel);
  const { data, st } = useView();
  if (!sel) return null;
  const P = plans(data.layout)[sel.tid];
  const v = camViews(data, sel.tid, st.gates[`g_${sel.tid}`]?.queue ?? 0)[sel.i];
  if (!P || !v) return null;
  const b: OBox = P.zones[sel.i];
  const color = v.idx >= 2 ? '#d83a34' : v.idx >= 1.5 ? '#f0a020' : '#2fa36b';
  const y = (sel.i === 3 ? YARD_Y : ROAD_Y) + 0.1;
  return (
    <group>
      <mesh position={[b.cx, y, b.cz]} rotation={[-Math.PI / 2, 0, -b.ang]}>
        <planeGeometry args={[b.len, b.wid]} />
        <meshBasicMaterial color={color} transparent opacity={v.idx >= 1.5 ? 0.55 : 0.4} depthWrite={false} />
      </mesh>
    </group>
  );
}
