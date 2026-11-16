import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COL, BOX } from './palette';
import { PAD_H } from './Ground';
import { hash } from './geo';
import { useUI } from '../store';
import { useView } from '../view';
import type { Layout, Terminal } from '../data/types';

// e: 회전(라디안, x·y·z). 경사진 붐 지지선·리치스태커 붐처럼 기울어진 부재에 쓴다
export interface Bx { p: [number, number, number]; s: [number, number, number]; c: string; r?: number; e?: [number, number, number] }

// 단위 상자 하나를 늘려 여러 물체를 한 번에 그린다
export function Boxes({ items, shadows = false }: { items: Bx[]; shadows?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const cap = Math.max(1, items.length);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), eu = new THREE.Euler();
    items.forEach((b, i) => {
      if (b.e) q.setFromEuler(eu.set(b.e[0], b.e[1], b.e[2])); else q.setFromAxisAngle(up, b.r ?? 0);
      m.compose(new THREE.Vector3(...b.p), q, new THREE.Vector3(...b.s));
      ref.current.setMatrixAt(i, m);
      ref.current.setColorAt(i, col.set(b.c));
    });
    ref.current.count = items.length;
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh key={cap} ref={ref} args={[undefined, undefined, cap]} frustumCulled={false} castShadow={shadows} receiveShadow={shadows}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.7} metalness={0.05} />
    </instancedMesh>
  );
}

// 장비 색 (참고: 신항 안벽 크레인 파랑, 야드 갠트리 노랑)
const STS = '#2f6fb5', STS_DK = '#1f4f86', WHITE = '#f4f6f9', DARK = '#3c4656', YEL = '#f2b134', YEL_DK = '#c98a12', HAZ = '#1d2430';

// 안벽 크레인(STS): 포털 다리·하부 보·A프레임·붐·지지선·기계실·트롤리·스프레더
function quayCranes(t: Terminal): Bx[] {
  const r = t.rect, out: Bx[] = [];
  const H = 10, y = PAD_H;
  // along: 레일 방향. g: 붐(게이지) 방향 좌표, +가 바다 쪽
  const crane = (x: number, z: number, along: 'x' | 'z', sea: number, k: number) => {
    const W = (a: number, g: number): [number, number] => (along === 'x' ? [x + a, z + g * sea] : [x + g * sea, z + a]);
    const S = (sa: number, sg: number): [number, number] => (along === 'x' ? [sa, sg] : [sg, sa]);
    const box = (a: number, yy: number, g: number, sa: number, sy: number, sg: number, c: string, e?: [number, number, number]) => {
      const [px, pz] = W(a, g), [sx, sz] = S(sa, sg);
      out.push({ p: [px, yy, pz], s: [sx, sy, sz], c, e });
    };
    // 다리 4개 + 하부 대차
    for (const a of [-2.2, 2.2]) for (const g of [-3.8, 3.8]) {
      box(a, y + H / 2, g, 0.55, H, 0.55, STS);
      box(a, y + 0.3, g, 1.6, 0.6, 0.8, DARK);
    }
    // 하부 보(레일 방향), 중간 가로보, 상부 포털 보
    for (const g of [-3.8, 3.8]) box(0, y + 1.6, g, 4.9, 0.4, 0.4, STS);
    for (const a of [-2.2, 2.2]) { box(a, y + H * 0.55, 0, 0.35, 0.35, 7.6, STS); box(a, y + H, 0, 0.6, 0.6, 7.6, STS); }
    for (const g of [-3.8, 3.8]) box(0, y + H, g, 4.9, 0.6, 0.6, STS);
    // 붐(바다 쪽 22, 육지 쪽 11)
    const bc = 5.5, bl = 33;
    for (const a of [-0.8, 0.8]) box(a, y + H + 1.1, bc, 0.4, 0.9, bl, STS);
    box(0, y + H + 0.7, bc, 1.9, 0.18, bl, STS_DK);
    box(0, y + H + 1.2, bc + bl / 2 - 0.6, 2, 0.9, 1.2, YEL); // 붐 끝 경고색
    box(0, y + H + 1.2, bc + bl / 2 - 1.8, 2, 0.9, 1.2, HAZ);
    // A프레임(육지 쪽 꼭짓점)
    const apexG = -1.6, apexY = y + H + 7;
    for (const a of [-1.1, 1.1]) box(a, (y + H + apexY) / 2, apexG, 0.45, apexY - y - H, 0.45, STS);
    box(0, apexY, apexG, 2.6, 0.5, 0.6, STS);
    // 지지선: 꼭짓점 → 붐 끝, 꼭짓점 → 붐 뒤끝
    const stay = (g1: number, y1: number, g2: number, y2: number) => {
      const len = Math.hypot(g2 - g1, y2 - y1);
      const tilt = Math.atan2(y2 - y1, g2 - g1); // 게이지(+바다) 방향 기준 기울기
      // 월드 기준: along x면 게이지가 z(±sea), along z면 게이지가 x(±sea)
      const e: [number, number, number] = along === 'x' ? [-tilt * sea, 0, 0] : [0, 0, tilt * sea];
      for (const a of [-0.9, 0.9]) box(a, (y1 + y2) / 2, (g1 + g2) / 2, 0.22, 0.22, len, STS, e);
    };
    stay(apexG, apexY, bc + bl / 2 - 2, y + H + 1.6);
    stay(apexG, apexY, bc - bl / 2 + 1, y + H + 1.6);
    // 기계실(흰 상자, 육지 쪽 붐 위)
    box(0, y + H + 2.4, -6.5, 2.6, 1.7, 4.2, WHITE);
    // 트롤리 + 운전실 + 와이어 + 스프레더(크레인마다 위치를 다르게)
    const tg = -2 + hash(t.id + k) * 18, sy = y + 2.2 + hash('s' + t.id + k) * 6;
    box(0, y + H + 0.3, tg, 2.2, 0.8, 2, WHITE);
    box(0, y + H - 0.6, tg - 1.2, 1.2, 1, 1.2, DARK);
    for (const a of [-0.7, 0.7]) box(a, (sy + y + H) / 2, tg, 0.06, y + H - sy, 0.06, DARK);
    box(0, sy, tg, 2.3, 0.25, 1.1, YEL);
    if (hash('c' + t.id + k) > 0.45) box(0, sy - 0.55, tg, 1.9, 0.8, 0.8, BOX[Math.floor(hash('cc' + t.id + k) * BOX.length)]);
  };
  if (t.quay === 'E') {
    const n = Math.floor((r.z1 - r.z0) / 15);
    for (let i = 0; i < n; i++) crane(r.x1 - 5, r.z0 + 7.5 + i * 15, 'z', 1, i);
    return out;
  }
  const sea = t.quay === 'S' ? 1 : -1;
  const zq = t.quay === 'S' ? r.z1 - 5 : r.z0 + 5;
  const n = Math.floor((r.x1 - r.x0) / 15);
  for (let i = 0; i < n; i++) crane(r.x0 + 7.5 + i * 15, zq, 'x', sea, i);
  return out;
}

// 야드 갠트리(RTG/ARMG): 다리·대차·상부 거더·트롤리·스프레더, 일부는 컨테이너를 들고 있다
function yardCranes(t: Terminal, l: Layout): Bx[] {
  const C = l.container, out: Bx[] = [];
  t.blocks.forEach((b) => {
    if (b.temp) return;
    const bl = b.bays * (C.L + C.gapL), bw = b.rows * (C.W + C.gapW);
    const alongX = b.axis !== 'z';
    // 블록 좌표(u: 베이 방향, v: 열 방향) → 월드
    const P = (u: number, yy: number, v: number): [number, number, number] => (alongX ? [b.cx + u, yy, b.cz + v] : [b.cx + v, yy, b.cz + u]);
    const Sz = (su: number, sy: number, sv: number): [number, number, number] => (alongX ? [su, sy, sv] : [sv, sy, su]);
    const u = -bl / 2 + bl * (0.2 + hash(b.id) * 0.6), h = 5.6, half = bw / 2 + 0.9;
    for (const dv of [-half, half]) {
      for (const du of [-1.3, 1.3]) out.push({ p: P(u + du, PAD_H + h / 2, dv), s: Sz(0.4, h, 0.4), c: YEL });
      out.push({ p: P(u, PAD_H + 0.35, dv), s: Sz(3.6, 0.5, 0.7), c: DARK }); // 대차
      out.push({ p: P(u, PAD_H + h, dv), s: Sz(3, 0.5, 0.5), c: YEL });
    }
    for (const du of [-1.3, 1.3]) out.push({ p: P(u + du, PAD_H + h + 0.1, 0), s: Sz(0.55, 0.7, half * 2 + 0.6), c: YEL });
    out.push({ p: P(u + 1.7, PAD_H + h - 1, half), s: Sz(1, 1.6, 1.2), c: YEL_DK }); // 전기실
    const v = -bw / 2 + bw * hash(b.id + 'v'), sy = PAD_H + 2.6 + hash(b.id + 'y') * 1.6;
    out.push({ p: P(u, PAD_H + h + 0.7, v), s: Sz(2.4, 0.7, 1.5), c: WHITE }); // 트롤리
    out.push({ p: P(u, PAD_H + h - 0.3, v + 0.9), s: Sz(0.9, 0.8, 0.8), c: DARK }); // 운전실
    for (const du of [-0.6, 0.6]) out.push({ p: P(u + du, (sy + PAD_H + h) / 2, v), s: Sz(0.05, PAD_H + h - sy, 0.05), c: DARK });
    out.push({ p: P(u, sy, v), s: Sz(2.2, 0.22, 0.95), c: YEL_DK });
    if (hash(b.id + 'k') > 0.4) out.push({ p: P(u, sy - 0.5, v), s: Sz(1.9, 0.8, 0.8), c: BOX[Math.floor(hash(b.id + 'kc') * BOX.length)] });
  });
  return out;
}

// 리치스태커: 차체·평형추·운전실·바퀴·들린 붐·스프레더(+들고 있는 컨테이너)
function reachStackers(t: Terminal): Bx[] {
  const r = t.rect, out: Bx[] = [];
  const land = t.quay === 'S' ? r.z0 + 4 : t.quay === 'N' ? r.z1 - 4 : (r.z0 + r.z1) / 2;
  const spots: [number, number, number][] = t.quay === 'E'
    ? [[r.x0 + 4, r.z0 + 10, 0], [r.x0 + 4, r.z1 - 12, Math.PI]]
    : [[r.x0 + 8, land, Math.PI / 2], [r.x1 - 10, land, -Math.PI / 2]];
  spots.forEach(([x, z, ry], i) => {
    // 로컬(lx: 옆, lz: 앞) → 월드
    const R = (lx: number, lz: number): [number, number] => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];
    const put = (lx: number, yy: number, lz: number, s: [number, number, number], c: string, pitch = 0) => {
      const [px, pz] = R(lx, lz);
      out.push({ p: [px, yy, pz], s, c, e: [pitch, ry, 0] });
    };
    put(0, PAD_H + 0.75, 0, [1.4, 0.9, 3], '#d9482b'); // 차체
    put(0, PAD_H + 1.0, -1.6, [1.5, 1.2, 0.7], DARK); // 평형추
    put(0.3, PAD_H + 1.75, -0.3, [0.8, 1, 0.9], WHITE); // 운전실
    for (const lz of [-1, 1]) for (const lx of [-0.75, 0.75]) put(lx, PAD_H + 0.35, lz, [0.35, 0.7, 0.7], HAZ);
    put(-0.2, PAD_H + 2.2, 1.2, [0.45, 0.45, 4.2], '#d9482b', -0.55); // 붐
    put(-0.2, PAD_H + 3.2, 3.2, [2.3, 0.25, 0.9], YEL_DK);
    if (i % 2 === 0) put(-0.2, PAD_H + 2.7, 3.2, [1.9, 0.8, 0.8], BOX[Math.floor(hash(t.id + 'rs') * BOX.length)]);
  });
  return out;
}

export function Equipment() {
  const data = useUI((s) => s.data)!;
  const l = data.layout;
  const items = useMemo(() => l.terminals.flatMap((t) => [...quayCranes(t), ...yardCranes(t, l), ...reachStackers(t)]), [l]);
  return (
    <>
      <Boxes items={items} shadows />
      <YardTractors />
    </>
  );
}

// 야드 트랙터(YT): 안벽(크레인 아래)과 블록 옆 차로를 오가며 움직인다
type YT = { a: [number, number]; b: [number, number]; sp: number; ph: number; box: string | null };
function tractorPaths(l: Layout): YT[] {
  const C = l.container, out: YT[] = [];
  for (const t of l.terminals) {
    const r = t.rect;
    for (const [k, off] of [[0, 5], [1, 9]] as const) {
      for (let i = 0; i < 3; i++) {
        const key = t.id + k + i;
        const box = hash(key + 'b') > 0.4 ? BOX[Math.floor(hash(key + 'c') * BOX.length)] : null;
        const sp = 0.035 + hash(key) * 0.03, ph = hash(key + 'p');
        if (t.quay === 'E') out.push({ a: [r.x1 - off, r.z0 + 4], b: [r.x1 - off, r.z1 - 4], sp, ph, box });
        else { const z = t.quay === 'S' ? r.z1 - off : r.z0 + off; out.push({ a: [r.x0 + 4, z], b: [r.x1 - 4, z], sp, ph, box }); }
      }
    }
    t.blocks.forEach((bk, i) => {
      if (i % 2) return;
      const bl = bk.bays * (C.L + C.gapL), bw = bk.rows * (C.W + C.gapW), key = bk.id;
      const box = hash(key + 'b') > 0.5 ? BOX[Math.floor(hash(key + 'c') * BOX.length)] : null;
      const sp = 0.05 + hash(key) * 0.04, ph = hash(key + 'p');
      if (bk.axis === 'z') out.push({ a: [bk.cx + bw / 2 + 0.9, bk.cz - bl / 2], b: [bk.cx + bw / 2 + 0.9, bk.cz + bl / 2], sp, ph, box });
      else out.push({ a: [bk.cx - bl / 2, bk.cz - bw / 2 - 0.9], b: [bk.cx + bl / 2, bk.cz - bw / 2 - 0.9], sp, ph, box });
    });
  }
  return out;
}

function YardTractors() {
  const l = useUI((s) => s.data)!.layout;
  const paths = useMemo(() => tractorPaths(l), [l]);
  const ref = useRef<THREE.InstancedMesh>(null!);
  const cap = Math.max(1, paths.length * 4);
  useLayoutEffect(() => {
    const col = new THREE.Color();
    paths.forEach((p, i) => {
      ref.current.setColorAt(i * 4, col.set(STS)); // 운전석
      ref.current.setColorAt(i * 4 + 1, col.set(DARK)); // 섀시
      ref.current.setColorAt(i * 4 + 2, col.set(p.box ?? DARK));
      ref.current.setColorAt(i * 4 + 3, col.set(WHITE)); // 운전석 지붕
    });
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [paths]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0), v: new THREE.Vector3(), s: new THREE.Vector3() }), []);
  useFrame(({ clock }) => {
    const T = clock.elapsedTime, { m, q, up, v, s } = tmp;
    paths.forEach((p, i) => {
      const u = (T * p.sp + p.ph) % 2, f = u < 1 ? u : 2 - u, dir = u < 1 ? 1 : -1;
      const x = p.a[0] + (p.b[0] - p.a[0]) * f, z = p.a[1] + (p.b[1] - p.a[1]) * f;
      const hx = (p.b[0] - p.a[0]) * dir, hz = (p.b[1] - p.a[1]) * dir, L = Math.hypot(hx, hz) || 1;
      q.setFromAxisAngle(up, Math.atan2(hx, hz) - Math.PI / 2); // 상자 길이(x)를 진행 방향으로
      const fx = hx / L, fz = hz / L;
      const part = (k: number, off: number, yy: number, sx: number, sy: number, sz: number) => {
        m.compose(v.set(x + fx * off, PAD_H + yy, z + fz * off), q, s.set(sx, sy, sz));
        ref.current.setMatrixAt(i * 4 + k, m);
      };
      part(0, 1.1, 0.65, 0.7, 0.8, 0.85);
      part(1, -0.3, 0.3, 2.9, 0.3, 0.8);
      if (p.box) part(2, -0.5, 0.85, 1.9, 0.8, 0.8); else part(2, -0.5, 0.42, 0.01, 0.01, 0.01);
      part(3, 1.1, 1.08, 0.72, 0.08, 0.87);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cap]} frustumCulled={false} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.6} metalness={0.05} />
    </instancedMesh>
  );
}


/* ---------- 선박 ---------- */
const SHIP_L = 40, SHIP_W = 6.4;

// 뱃머리가 뾰족한 선체 단면
function useHullGeometry() {
  return useMemo(() => {
    const s = new THREE.Shape();
    const L = SHIP_L / 2, W = SHIP_W / 2;
    s.moveTo(-L, -W);
    s.lineTo(L - 6, -W);
    s.quadraticCurveTo(L, -W * 0.6, L + 0.8, 0);
    s.quadraticCurveTo(L, W * 0.6, L - 6, W);
    s.lineTo(-L, W);
    s.lineTo(-L, -W);
    const g = new THREE.ExtrudeGeometry(s, { depth: 2.4, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
}

interface ShipPos { x: number; z: number; rot: number; key: string }

function shipSpots(t: Terminal, count: number): ShipPos[] {
  const r = t.rect, out: ShipPos[] = [];
  if (t.quay === 'E') {
    for (let i = 0; i < count; i++) out.push({ x: r.x1 + SHIP_W / 2 + 1, z: r.z0 + SHIP_L / 2 + 2 + i * (SHIP_L + 4), rot: -Math.PI / 2, key: t.id + i });
    return out;
  }
  const z = t.quay === 'S' ? r.z1 + SHIP_W / 2 + 1 : r.z0 - SHIP_W / 2 - 1;
  for (let i = 0; i < count; i++) {
    const x = r.x0 + SHIP_L / 2 + 4 + i * (SHIP_L + 6);
    if (x + SHIP_L / 2 > r.x1) break;
    out.push({ x, z, rot: i % 2 ? Math.PI : 0, key: t.id + i });
  }
  return out;
}

// 갑판 위 컨테이너 + 선교(흰 상부 구조)
function deckItems(s: ShipPos): Bx[] {
  const out: Bx[] = [];
  const cos = Math.cos(s.rot), sin = Math.sin(s.rot);
  const at = (u: number, v: number): [number, number] => [s.x + u * cos + v * sin, s.z - u * sin + v * cos];
  const bays = 11;
  for (let b = 0; b < bays; b++) {
    const u = -SHIP_L / 2 + 6 + b * 2.6;
    if (b === 2) continue; // 선교 자리
    const tiers = 2 + Math.floor(hash(s.key + 'b' + b) * 4);
    for (let row = -2; row <= 2; row++) for (let k = 0; k < tiers; k++) {
      if (hash(s.key + b + row + k) < 0.1) continue;
      const [x, z] = at(u, row * 1.05);
      out.push({ p: [x, 2.6 + k * 0.85 + 0.42, z], s: [2.4, 0.8, 1.0], c: BOX[Math.floor(hash(s.key + 'c' + b + row + k) * BOX.length)], r: s.rot });
    }
  }
  const [bx, bz] = at(-SHIP_L / 2 + 6 + 2 * 2.6, 0);
  out.push({ p: [bx, 2.4 + 3, bz], s: [2.6, 6, SHIP_W - 0.8], c: COL.bridge, r: s.rot });
  out.push({ p: [bx, 2.4 + 6.3, bz], s: [3, 0.5, SHIP_W + 0.6], c: COL.bridge, r: s.rot });
  return out;
}

export function Ships() {
  const { data, st } = useView();
  const geo = useHullGeometry();
  const spots = useMemo(() => data.layout.terminals.flatMap((t) => shipSpots(t, Math.max(1, st.ships[t.id] ?? 1))), [data, st]);
  const deck = useMemo(() => spots.flatMap(deckItems), [spots]);
  return (
    <group>
      {spots.map((s) => (
        <group key={s.key} position={[s.x, 0, s.z]} rotation-y={s.rot}>
          <mesh geometry={geo} position={[0, -0.2, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={COL.hull} roughness={0.6} />
          </mesh>
          <mesh position={[0, 2.25, 0]} receiveShadow>
            <boxGeometry args={[SHIP_L - 6.5, 0.2, SHIP_W - 0.6]} />
            <meshStandardMaterial color={COL.deck} />
          </mesh>
        </group>
      ))}
      <Boxes items={deck} shadows />
    </group>
  );
}
