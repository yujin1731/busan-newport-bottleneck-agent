import type { Layout, GNode, PortState, SimStep } from '../data/types';

export type V2 = [number, number];

export function nodeMap(l: Layout): Record<string, GNode> {
  return Object.fromEntries(l.nodes.map((n) => [n.id, n]));
}

// 무방향 그래프 최단 경로(노드 수 기준)
export function route(l: Layout, from: string, to: string): string[] {
  const adj: Record<string, string[]> = {};
  for (const k of l.links) {
    (adj[k.from] ||= []).push(k.to);
    (adj[k.to] ||= []).push(k.from);
  }
  const prev: Record<string, string | null> = { [from]: null };
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    if (c === to) break;
    for (const n of adj[c] || []) if (!(n in prev)) { prev[n] = c; q.push(n); }
  }
  const out: string[] = [];
  let c: string | null = to;
  while (c) { out.unshift(c); c = prev[c] ?? null; }
  return out[0] === from ? out : [];
}

export function polyline(l: Layout, ids: string[]): V2[] {
  const N = nodeMap(l);
  return ids.map((id) => [N[id].x, N[id].z]);
}

export function polyLen(p: V2[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return s;
}

// 경로 위 거리 d 지점과 진행 방향
export function along(p: V2[], d: number): { x: number; z: number; dx: number; dz: number } {
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], [bx, bz] = p[i];
    const seg = Math.hypot(bx - ax, bz - az);
    if (d <= seg || i === p.length - 1) {
      const t = seg ? Math.min(1, Math.max(0, d / seg)) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / (seg || 1), dz: (bz - az) / (seg || 1) };
    }
    d -= seg;
  }
  const [x, z] = p[p.length - 1];
  return { x, z, dx: 1, dz: 0 };
}

// 경로 앞부분 d 길이만 잘라낸 폴리라인
export function slice(p: V2[], d: number): V2[] {
  const out: V2[] = [p[0]];
  for (let i = 1; i < p.length; i++) {
    const seg = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (d <= seg) {
      const t = d / seg;
      out.push([p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]);
      return out;
    }
    out.push(p[i]);
    d -= seg;
  }
  return out;
}

// 결정적 난수 (블록·스택 단위 변화)
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

export const TRUCK_GAP = 2.7;

// 화면 단계별 게이트 대기열(대). S3·S4는 시뮬레이션 값을 보간한다.
export function gateQueues(st: PortState, sim: SimStep[] | null, simT: number): Record<string, number> {
  const q: Record<string, number> = {};
  for (const id in st.gates) q[id] = st.gates[id].queue;
  if (sim) {
    const i = Math.min(sim.length - 2, Math.floor(simT));
    const f = Math.min(1, simT - i);
    for (const id in sim[i].queue) q[id] = Math.round(sim[i].queue[id] * (1 - f) + sim[i + 1].queue[id] * f);
  }
  return q;
}

export function simMoved(sim: SimStep[], simT: number): number {
  const i = Math.min(sim.length - 2, Math.floor(simT));
  const f = Math.min(1, simT - i);
  return sim[i].moved * (1 - f) + sim[i + 1].moved * f;
}
