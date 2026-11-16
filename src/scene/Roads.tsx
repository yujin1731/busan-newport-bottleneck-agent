import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COL } from './palette';
import { nodeMap, route, polyline, polyLen, along, slice, TRUCK_GAP, type V2 } from './geo';
import { useUI } from '../store';
import { useView } from '../view';
import type { Layout } from '../data/types';

const ROAD_Y = 0.34;
const LANE = 1.35;
export const ROAD_W = { main: 7, spur: 5.2 };

// 게이트별 대기열 경로: 게이트에서 바깥쪽으로
export function useQueuePaths(l: Layout) {
  return useMemo(() => {
    const out: Record<string, { ids: string[]; pts: V2[]; len: number }> = {};
    for (const n of l.nodes) if (n.kind === 'gate') {
      const ids = route(l, 'ext_e', n.id).reverse();
      const pts = polyline(l, ids);
      out[n.id] = { ids, pts, len: polyLen(pts) };
    }
    return out;
  }, [l]);
}

export function Segment({ a, b, w, color, y, opacity = 1, extend = 0.5 }: { a: V2; b: V2; w: number; color: string; y: number; opacity?: number; extend?: number }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return (
    <mesh position={[(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2]} rotation={[-Math.PI / 2, 0, -ang]} receiveShadow>
      <planeGeometry args={[len + w * extend, w]} />
      {opacity < 1
        ? <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
        : <meshStandardMaterial color={color} roughness={0.9} />}
    </mesh>
  );
}

// 가운데 흰 점선
function centerDashes(a: V2, b: V2): { x: number; z: number; ang: number }[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const out = [];
  for (let d = 2; d < len - 2; d += 5) {
    const t = d / len;
    out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) });
  }
  return out;
}

function Dashes({ l }: { l: Layout }) {
  const N = nodeMap(l);
  const items = useMemo(() => l.links.filter((k) => k.public).flatMap((k) => centerDashes([N[k.from].x, N[k.from].z], [N[k.to].x, N[k.to].z])), [l, N]);
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    items.forEach((d, i) => {
      q.setFromAxisAngle(up, -d.ang);
      m.compose(new THREE.Vector3(d.x, ROAD_Y + 0.02, d.z), q, one);
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false}>
      <boxGeometry args={[2.4, 0.03, 0.22]} />
      <meshBasicMaterial color={COL.roadLine} />
    </instancedMesh>
  );
}

export function Roads() {
  const { data, st } = useView();
  const l = data.layout;
  const N = nodeMap(l);
  const set = useUI((s) => s.set);
  return (
    <group>
      {l.links.map((k) => {
        const a: V2 = [N[k.from].x, N[k.from].z], b: V2 = [N[k.to].x, N[k.to].z];
        const s = st.links[k.id];
        const w = k.public ? ROAD_W.main : ROAD_W.spur;
        return (
          <group
            key={k.id}
            onPointerMove={(e) => {
              e.stopPropagation();
              set({ hover: { id: k.id, title: k.name, lines: [k.public ? '공공도로' : '터미널 진입로'], x: e.nativeEvent.clientX, y: e.nativeEvent.clientY } });
            }}
            onPointerOut={() => set({ hover: null })}
          >
            <Segment a={a} b={b} w={w + 1.2} color={COL.roadEdge} y={ROAD_Y - 0.03} extend={0.9} />
            <Segment a={a} b={b} w={w} color={COL.road} y={ROAD_Y} extend={0.9} />
            {s.state === 'warn' && <Segment a={a} b={b} w={w + 3} color={COL.orange} y={ROAD_Y + 0.04} opacity={0.35} />}
          </group>
        );
      })}
      <Dashes l={l} />
      {l.nodes.filter((n) => n.kind === 'gate').map((n) => {
        const g = st.gates[n.id];
        return (
          <group
            key={n.id}
            position={[n.x, 0, n.z]}
            onPointerMove={(e) => {
              e.stopPropagation();
              set({ hover: { id: n.id, title: n.name, lines: [`대기 ${g.queue}대`, `처리 ${g.thr}대/시 · TAT ${g.tat}분`], x: e.nativeEvent.clientX, y: e.nativeEvent.clientY } });
            }}
            onPointerOut={() => set({ hover: null })}
          >
            {[-3, 3].map((d) => (
              <mesh key={d} position={[d, 1.6, 0]} castShadow>
                <boxGeometry args={[0.5, 2.6, 0.5]} />
                <meshStandardMaterial color={COL.craneDark} />
              </mesh>
            ))}
            <mesh position={[0, 3, 0]} castShadow>
              <boxGeometry args={[7.4, 0.5, 2.4]} />
              <meshStandardMaterial color={COL.white} />
            </mesh>
          </group>
        );
      })}
      {l.nodes.filter((n) => n.kind === 'wait').map((n) => (
        <mesh key={n.id} position={[n.x, ROAD_Y, n.z]} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[20, 13]} />
          <meshStandardMaterial color={COL.road} />
        </mesh>
      ))}
    </group>
  );
}

// 대기열이 덮는 바닥: 40대 이상 빨강(혼잡 위치), 15대 이상 주황(주의)
export function QueueTint() {
  const { data, queues } = useView();
  const paths = useQueuePaths(data.layout);
  return (
    <group>
      {Object.entries(paths).map(([gid, p]) => {
        const q = queues[gid] ?? 0;
        if (q < 15) return null;
        const pts = slice(p.pts, Math.min(p.len, q * TRUCK_GAP + 3));
        const color = COL.orange; // 빨강은 원인 블록에만 쓴다. 대기열은 영향이므로 주황
        const op = q >= 40 ? 0.42 : 0.35;
        return (
          <group key={gid}>
            {pts.slice(1).map((b, i) => <Segment key={i} a={pts[i]} b={b} w={10} color={color} y={ROAD_Y + 0.05} opacity={op} extend={1} />)}
          </group>
        );
      })}
    </group>
  );
}

// 트럭 모양: 운전석 + 적재함
function useTruckGeometry() {
  return useMemo(() => {
    const cab = new THREE.BoxGeometry(0.75, 0.9, 0.95);
    cab.translate(1.05, 0.45, 0);
    const box = new THREE.BoxGeometry(1.75, 0.95, 0.95);
    box.translate(-0.35, 0.5, 0);
    return mergeGeometries([cab, box]);
  }, []);
}

// 차량 입자 + 게이트 대기열 꼬리
export function Vehicles() {
  const { data, st, queues } = useView();
  const l = data.layout;
  const N = nodeMap(l);
  const paths = useQueuePaths(l);
  const ref = useRef<THREE.InstancedMesh>(null!);
  const geo = useTruckGeometry();

  const covered = useMemo(() => {
    const set = new Set<string>();
    for (const [gid, p] of Object.entries(paths)) {
      let d = (queues[gid] ?? 0) * TRUCK_GAP;
      for (let i = 1; i < p.ids.length && d > 0; i++) {
        const a = p.ids[i - 1], b = p.ids[i];
        set.add(`${b}>${a}`);
        d -= Math.hypot(N[a].x - N[b].x, N[a].z - N[b].z);
      }
    }
    return set;
  }, [paths, queues, N]);

  const lanes = useMemo(() => {
    const out: { p: V2[]; len: number; v: number; n: number; seed: number }[] = [];
    for (const k of l.links) {
      const a: V2 = [N[k.from].x, N[k.from].z], b: V2 = [N[k.to].x, N[k.to].z];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const v = st.links[k.id].speed * 0.12;
      const n = Math.max(1, Math.floor(len / (k.public ? 11 : 15)));
      if (!covered.has(`${k.from}>${k.to}`)) out.push({ p: [a, b], len, v, n, seed: (k.id.length * 7) % 5 });
      if (!covered.has(`${k.to}>${k.from}`)) out.push({ p: [b, a], len, v, n, seed: (k.id.length * 3) % 5 });
    }
    return out;
  }, [l, N, st, covered]);

  const queueTrucks = useMemo(() => {
    const out: { x: number; z: number; ang: number }[] = [];
    for (const [gid, p] of Object.entries(paths)) {
      const q = Math.min(queues[gid] ?? 0, Math.floor(p.len / TRUCK_GAP));
      for (let i = 0; i < q; i++) {
        const s = along(p.pts, 3 + i * TRUCK_GAP);
        const dx = -s.dx, dz = -s.dz;
        out.push({ x: s.x + -dz * LANE, z: s.z + dx * LANE, ang: Math.atan2(dz, dx) });
      }
    }
    return out;
  }, [paths, queues]);

  const total = 1400;
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);

  useLayoutEffect(() => {
    queueTrucks.forEach((t, i) => {
      q.setFromAxisAngle(up, -t.ang);
      m.compose(pos.set(t.x, ROAD_Y, t.z), q, one);
      ref.current.setMatrixAt(i, m);
    });
  }, [queueTrucks, m, q, up, pos, one]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    let i = queueTrucks.length;
    for (const ln of lanes) {
      const [a, b] = ln.p;
      const dx = (b[0] - a[0]) / ln.len, dz = (b[1] - a[1]) / ln.len;
      q.setFromAxisAngle(up, -Math.atan2(dz, dx));
      for (let k = 0; k < ln.n && i < total; k++) {
        const d = ((k / ln.n) * ln.len + time * ln.v + ln.seed * 3) % ln.len;
        m.compose(pos.set(a[0] + dx * d + -dz * LANE, ROAD_Y, a[1] + dz * d + dx * LANE), q, one);
        ref.current.setMatrixAt(i++, m);
      }
    }
    ref.current.count = i;
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[geo, undefined, total]} frustumCulled={false} castShadow>
      <meshStandardMaterial color={COL.truckCab} roughness={0.5} />
    </instancedMesh>
  );
}
