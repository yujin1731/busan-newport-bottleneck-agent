import type { Layout } from '../data/types';
import { nodeMap, route, type V2 } from './geo';

// 모든 터미널에 같은 틀을 적용한다.
// 순서: 도로 접속부 → 게이트 진입로 → 대기 차로 → 게이트 → 야드 앞 도로
export const MAIN_HALF = 3.5; // 본선 도로 반폭
export const PAD_TOP = 0.6; // 터미널 바닥 높이(Ground.PAD_H와 같다)

export interface OBox { cx: number; cz: number; len: number; wid: number; ang: number }
export interface Plan {
  id: string;
  n: V2; g: V2; u: V2; p: V2; L: number;
  d0: number; flare: number; dQ0: number;
  at: (d: number, off?: number) => V2; // 진입로 위 거리 d, 옆으로 off
  yardC: V2; // 게이트 선 위의 야드 앞 도로 중심점
  yardA: V2; yardB: V2; // 야드 앞 도로 양 끝
  zones: OBox[]; // 0 접속부, 1 진입로, 2 대기 차로, 3 야드 앞 도로
  start: V2; // 트럭이 본선에서 들어오는 시작점
}

const cache = new WeakMap<Layout, Record<string, Plan>>();

export function plans(l: Layout): Record<string, Plan> {
  const hit = cache.get(l);
  if (hit) return hit;
  const N = nodeMap(l);
  const C = l.container;
  const out: Record<string, Plan> = {};
  for (const t of l.terminals) {
    const gn = N[`g_${t.id}`], nn = N[`n_${t.id}`];
    const n: V2 = [nn.x, nn.z], g: V2 = [gn.x, gn.z];
    const L = Math.hypot(g[0] - n[0], g[1] - n[1]);
    const u: V2 = [(g[0] - n[0]) / L, (g[1] - n[1]) / L];
    const p: V2 = [-u[1], u[0]];
    const at = (d: number, off = 0): V2 => [n[0] + u[0] * d + p[0] * off, n[1] + u[1] * d + p[1] * off];
    const d0 = MAIN_HALF;
    const flare = Math.min(9, 0.35 * (L - d0));
    const Lq = Math.max(9, Math.min(30, 0.45 * L));
    const dQ0 = Math.max(d0 + flare + 3, L - Lq);

    // 야드 앞 도로: 게이트 쪽에서 가장 가까운 블록 앞, 구역 폭 전체
    let near = Infinity, pMin = Infinity, pMax = -Infinity;
    for (const b of t.blocks) {
      const bl = b.bays * (C.L + C.gapL), bw = b.rows * (C.W + C.gapW);
      const hu = Math.abs(u[0]) > Math.abs(u[1]) ? bl / 2 : bw / 2;
      const hp = Math.abs(u[0]) > Math.abs(u[1]) ? bw / 2 : bl / 2;
      const du = (b.cx - g[0]) * u[0] + (b.cz - g[1]) * u[1];
      const dp = (b.cx - g[0]) * p[0] + (b.cz - g[1]) * p[1];
      near = Math.min(near, du - hu);
      pMin = Math.min(pMin, dp - hp);
      pMax = Math.max(pMax, dp + hp);
    }
    const dy = Math.max(2.2, Math.min(near, 12) / 2);
    const gp = (du: number, dpp: number): V2 => [g[0] + u[0] * du + p[0] * dpp, g[1] + u[1] * du + p[1] * dpp];
    const yardC = gp(dy, 0);
    const yardA = gp(dy, pMin - 1.5), yardB = gp(dy, pMax + 1.5);

    const ang = Math.atan2(u[1], u[0]);
    const box = (d0_: number, d1_: number, wid: number): OBox => {
      const c = at((d0_ + d1_) / 2);
      return { cx: c[0], cz: c[1], len: d1_ - d0_, wid, ang };
    };
    const yc: V2 = [(yardA[0] + yardB[0]) / 2, (yardA[1] + yardB[1]) / 2];
    const yardBox: OBox = { cx: yc[0], cz: yc[1], len: Math.hypot(yardB[0] - yardA[0], yardB[1] - yardA[1]), wid: 4.6, ang: Math.atan2(yardB[1] - yardA[1], yardB[0] - yardA[0]) };
    const zones = [box(-8, d0 + flare, 18), box(d0 + flare * 0.5, dQ0, 8), box(dQ0, L + 1, 11), yardBox];

    // 본선에서 들어오는 방향(ext_e에서 오는 경로의 직전 노드)
    const r = route(l, 'ext_e', `n_${t.id}`);
    const prev = N[r[r.length - 2] ?? nn.id];
    const mv: V2 = [prev.x - n[0], prev.z - n[1]];
    const ml = Math.hypot(mv[0], mv[1]) || 1;
    const start: V2 = [n[0] + (mv[0] / ml) * 16, n[1] + (mv[1] / ml) * 16];
    out[t.id] = { id: t.id, n, g, u, p, L, d0, flare, dQ0, at, yardC, yardA, yardB, zones, start };
  }
  cache.set(l, out);
  return out;
}

/** 구역 상자를 감싸는 화면 범위(주변이 보이게 여유를 둔다) */
export function zoneBounds(b: OBox, pad = 16) {
  const c = Math.cos(b.ang), s = Math.sin(b.ang);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [a, w] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const lx = (a * b.len) / 2, lz = (w * b.wid) / 2;
    const x = b.cx + lx * c - lz * s, z = b.cz + lx * s + lz * c;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  return { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad };
}
