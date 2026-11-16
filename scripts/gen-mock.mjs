// 시연용 mock JSON 생성기. 실행: node scripts/gen-mock.mjs
// 모든 수치는 가상 시나리오(시연값)다. 터미널 좌표는 경도·위도 상자이며 BCT·BNCT·HPNT는 추정 위치다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'mock');
mkdirSync(OUT, { recursive: true });
const save = (name, obj) => writeFileSync(join(OUT, name), JSON.stringify(obj));

// 고정 시드 난수
let seed = 20261111;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

// 투영: 1 장면 단위 = 10 m
const ORIGIN = { lon: 128.8, lat: 35.075 };
const M_PER_DEG = { lon: 91290, lat: 110950 };
const P = (lon, lat) => [
  +(((lon - ORIGIN.lon) * M_PER_DEG.lon) / 10).toFixed(2),
  +((-(lat - ORIGIN.lat) * M_PER_DEG.lat) / 10).toFixed(2),
];

// 터미널: box = [서경, 남위, 동경, 북위], quay = 안벽 방향
const TERMS = [
  { id: 'DGT', name: 'DGT', box: [128.77, 35.0722, 128.7745, 35.0798], quay: 'E', approx: false, auto: true },
  { id: 'HJNC', name: 'HJNC', box: [128.7856, 35.0778, 128.7968, 35.0822], quay: 'S', approx: false },
  { id: 'PNC', name: 'PNC', box: [128.8, 35.0778, 128.816, 35.0822], quay: 'S', approx: false },
  { id: 'PNIT', name: 'PNIT', box: [128.8225, 35.0778, 128.833, 35.0822], quay: 'S', approx: false },
  { id: 'BCT', name: 'BCT', box: [128.795, 35.0612, 128.806, 35.0642], quay: 'N', approx: true },
  { id: 'BNCT', name: 'BNCT', box: [128.807, 35.0641, 128.8185, 35.0671], quay: 'N', approx: true },
  { id: 'HPNT', name: 'HPNT', box: [128.8215, 35.0668, 128.833, 35.0698], quay: 'N', approx: true },
];

const C = { L: 1.9, W: 0.8, H: 0.8, gapL: 0.08, gapW: 0.1 };

function buildTerminal(t) {
  const [w, s, e, n] = t.box;
  const [x0, z1] = P(w, s); // 남서 (z는 남쪽이 +)
  const [x1, z0] = P(e, n); // 북동
  const rect = { x0, x1, z0, z1 };
  const blocks = [];
  const apron = 10, gateStrip = 6, gap = 2.6;
  let gate;
  if (t.quay === 'E') {
    // 자동화 터미널: 블록 장축이 안벽에 수직(동서)
    const yx0 = x0 + gateStrip, yx1 = x1 - apron;
    const len = yx1 - yx0;
    const bays = Math.floor(len / (C.L + C.gapL));
    const rows = 6;
    const bw = rows * (C.W + C.gapW);
    const count = Math.floor((z1 - z0 - 2) / (bw + gap));
    for (let i = 0; i < count; i++) {
      const cz = z0 + 1 + i * (bw + gap) + bw / 2;
      blocks.push({ id: `${t.id}-B${String(i + 1).padStart(2, '0')}`, cx: +((yx0 + yx1) / 2).toFixed(2), cz: +cz.toFixed(2), axis: 'x', bays, rows });
    }
    gate = { x: x0 - 0.5, z: z0 + 10 };
  } else {
    const north = t.quay === 'S';
    const yz0 = north ? z0 + gateStrip : z0 + apron;
    const yz1 = north ? z1 - apron : z1 - gateStrip;
    const bays = 8, rows = 5;
    const bl = bays * (C.L + C.gapL), bw = rows * (C.W + C.gapW);
    const nx = Math.floor((x1 - x0 - 2) / (bl + gap));
    const nz = Math.floor((yz1 - yz0) / (bw + gap));
    const offX = (x1 - x0 - nx * (bl + gap) + gap) / 2;
    let k = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      k++;
      blocks.push({
        id: `${t.id}-B${String(k).padStart(2, '0')}`,
        cx: +(x0 + offX + i * (bl + gap) + bl / 2).toFixed(2),
        cz: +(yz0 + j * (bw + gap) + bw / 2).toFixed(2),
        axis: 'x', bays, rows,
      });
    }
    gate = { x: +((x0 + x1) / 2).toFixed(2), z: north ? z0 - 0.5 : z1 + 0.5 };
  }
  return { ...t, rect, blocks, gate };
}

const terminals = TERMS.map(buildTerminal);
const T = Object.fromEntries(terminals.map((t) => [t.id, t]));

// HJNC 임시 장치 블록(대응 도착지): 첫 줄 서쪽 블록을 지정
const hjTemp = T.HJNC.blocks[0];
hjTemp.temp = true;

// 도로 그래프(장면 좌표). 도로 위치는 시연용 단순화.
const RN = P(0, 35.0842)[1]; // 북측 배후도로 z
const RS = P(0, 35.0594)[1]; // 남측 배후도로 z
const XE = P(128.8385, 0)[0];
const XW = P(128.7655, 0)[0];
const nodes = [
  { id: 'ext_e', name: '신항대로(부산 방면)', x: XE + 60, z: RN, kind: 'ext' },
  { id: 'ext_w', name: '진해 방면', x: XW - 30, z: RN - 40, kind: 'ext' },
  { id: 'ung', name: '웅동 대기 공간', x: XW - 22, z: RN - 14, kind: 'wait' },
  { id: 'j_ne', name: '북동 교차로', x: XE, z: RN, kind: 'junction' },
  { id: 'j_se', name: '남동 교차로', x: XE, z: RS, kind: 'junction' },
  { id: 'j_nw', name: '북서 교차로', x: XW, z: RN, kind: 'junction' },
];
for (const t of terminals) {
  const north = t.quay === 'S';
  if (t.id === 'DGT') {
    nodes.push({ id: 'n_DGT', name: 'DGT 진입로', x: XW, z: t.gate.z, kind: 'junction' });
  } else {
    nodes.push({ id: `n_${t.id}`, name: `${t.id} 진입`, x: t.gate.x, z: north ? RN : RS, kind: 'junction' });
  }
  nodes.push({ id: `g_${t.id}`, name: `${t.id} 게이트`, x: t.gate.x, z: t.gate.z, kind: 'gate', terminal: t.id });
}
const N = Object.fromEntries(nodes.map((n) => [n.id, n]));

const links = [];
const link = (id, a, b, name, pub = true) => links.push({ id, from: a, to: b, name, public: pub });
// 북측 배후도로: 동 → 서 순서로 진입점 정렬
const northStops = ['j_ne', 'n_PNIT', 'n_PNC', 'n_HJNC', 'j_nw'];
for (let i = 0; i < northStops.length - 1; i++) link(`rn_${i}`, northStops[i], northStops[i + 1], '북측 배후도로');
link('rw_0', 'j_nw', 'n_DGT', 'DGT 진입로');
const southStops = ['j_se', 'n_HPNT', 'n_BNCT', 'n_BCT'];
for (let i = 0; i < southStops.length - 1; i++) link(`rs_${i}`, southStops[i], southStops[i + 1], '남측 배후도로');
link('re_0', 'j_ne', 'j_se', '동측 연결도로');
link('rx_e', 'ext_e', 'j_ne', '신항대로');
link('rx_w', 'ext_w', 'j_nw', '진해 방면 도로');
link('ru_0', 'ung', 'j_nw', '웅동 대기 공간 연결로');
for (const t of terminals) link(`sp_${t.id}`, `n_${t.id}`, `g_${t.id}`, `${t.id} 게이트 진입로`, false);

const layout = {
  meta: { title: '부산신항 병목 관제 (시연용)', unit: '1 = 10 m', origin: ORIGIN, mPerDeg: M_PER_DEG, note: 'BCT·BNCT·HPNT 위치는 추정. 도로는 단순화.' },
  container: C,
  terminals: terminals.map(({ id, name, box, quay, approx, auto, rect, blocks, gate }) => ({ id, name, box, quay, approx: !!approx, automated: !!auto, rect, gate, blocks })),
  nodes,
  links,
  land: [
    { id: 'north', rect: { x0: XW - 60, x1: XE + 80, z0: RN - 70, z1: P(0, 35.0822)[1] } },
    { id: 'west', rect: { x0: XW - 60, x1: T.DGT.rect.x0, z0: RN - 70, z1: T.DGT.rect.z1 + 30 } },
    { id: 'south', rect: { x0: T.BCT.rect.x0 - 30, x1: XE + 80, z0: P(0, 35.0612)[1], z1: RS + 60 } },
    { id: 'east', rect: { x0: XE - 6, x1: XE + 80, z0: RN - 70, z1: RS + 60 } },
    { id: 'bnct_back', rect: { x0: T.BNCT.rect.x0, x1: T.BNCT.rect.x1, z0: T.BNCT.rect.z1, z1: P(0, 35.0612)[1] } },
    { id: 'hpnt_back', rect: { x0: T.HPNT.rect.x0, x1: XE, z0: T.HPNT.rect.z1, z1: P(0, 35.0612)[1] } },
  ],
  cctv: [
    { id: 'CCTV-DGT-G1', x: N.g_DGT.x - 6, z: N.g_DGT.z - 4, node: 'g_DGT' },
    { id: 'CCTV-RN-W', x: N.j_nw.x + 8, z: N.j_nw.z - 4, node: 'j_nw' },
    { id: 'CCTV-HJNC-G1', x: N.g_HJNC.x + 6, z: N.g_HJNC.z - 4, node: 'g_HJNC' },
    { id: 'CCTV-BNCT-G1', x: N.g_BNCT.x + 6, z: N.g_BNCT.z + 4, node: 'g_BNCT' },
  ],
};
save('layout.json', layout);

// ---------- 상태: 지난 24시간, 1시간 간격 (h = -24 .. 0) ----------
const baseOcc = {};
for (const t of terminals) for (const b of t.blocks) {
  let o = 0.55 + rnd() * 0.25;
  if (t.id === 'HJNC') o = 0.5 + rnd() * 0.22;
  if (b.temp) o = 0.08;
  baseOcc[b.id] = +o.toFixed(3);
}
const dgtExport = T.DGT.blocks.slice(5, 10).map((b) => b.id); // 수출 장치 블록 B06~B10
const causeBlocks = T.DGT.blocks.slice(6, 9).map((b) => b.id); // 원인: B07~B09
const ramp = (h, start, full) => Math.max(0, Math.min(1, (h - start) / (full - start)));

const states = [];
for (let h = -24; h <= 0; h++) {
  const k = ramp(h, -8, -1); // DGT 혼잡 진행도
  const kb = ramp(h, -2, 0) * 0.6; // BNCT 주의
  const occ = {};
  for (const id in baseOcc) {
    let o = baseOcc[id] + (rnd() - 0.5) * 0.02;
    if (id.startsWith('DGT-')) o = 0.7 + (baseOcc[id] - 0.55) * 0.3;
    if (dgtExport.includes(id)) o = 0.78 + 0.14 * k + (rnd() - 0.5) * 0.02;
    if (causeBlocks.includes(id)) o = 0.8 + 0.17 * k;
    occ[id] = +Math.min(0.99, Math.max(0.05, o)).toFixed(3);
  }
  const gates = {};
  for (const t of terminals) {
    let q = 6 + Math.round(rnd() * 6), tat = 36 + Math.round(rnd() * 8), thr = 70 + Math.round(rnd() * 20);
    let st = 'ok';
    if (t.id === 'DGT') { q = Math.round(10 + 54 * k); tat = Math.round(44 + 38 * k); thr = 86 + Math.round(rnd() * 4); st = k > 0.6 ? 'jam' : k > 0.25 ? 'warn' : 'ok'; }
    if (t.id === 'BNCT') { q = Math.round(q + 18 * kb); tat = Math.round(tat + 14 * kb); st = kb > 0.3 ? 'warn' : 'ok'; if (kb > 0.3) thr = 62; }
    gates[`g_${t.id}`] = { queue: q, tat, thr, state: st };
  }
  const linksSt = {};
  for (const l of links) {
    let speed = 38 + Math.round(rnd() * 10), st = 'ok';
    if (l.id === 'rw_0' || l.id === 'sp_DGT') { speed = Math.round(40 - 31 * k); st = k > 0.6 ? 'jam' : k > 0.25 ? 'warn' : 'ok'; }
    if (l.id === 'rn_3') { speed = Math.round(42 - 22 * k); st = k > 0.7 ? 'warn' : 'ok'; }
    if (l.id === 'sp_BNCT' && kb > 0.3) { speed = 24; st = 'warn'; }
    linksSt[l.id] = { speed, state: st };
  }
  const tats = Object.values(gates).map((g) => g.tat);
  const queueSum = Object.values(gates).reduce((a, g) => a + g.queue, 0);
  const spill = k > 0.6 ? 1 : 0;
  const hh = String(14 + h < 0 ? 14 + h + 24 : 14 + h).padStart(2, '0');
  states.push({
    h,
    asOf: `${h < -14 ? '2026-11-10' : '2026-11-11'} ${hh}:30`,
    kpi: {
      tat: { value: Math.round(tats.reduce((a, b) => a + b, 0) / tats.length), usual: 41, unit: '분', src: '실측' },
      queue: { value: queueSum, usual: 54, unit: '대', src: '추정' },
      spill: { value: spill, km: spill ? +(0.6 + 0.8 * k).toFixed(1) : 0, usual: 0, unit: '구간', src: '추정' },
      alerts: { value: (k > 0.6 ? 1 : 0) + (kb > 0.3 ? 1 : 0), unit: '건' },
    },
    occ, gates, links: linksSt,
    ships: Object.fromEntries(terminals.map((t) => [t.id, t.id === 'DGT' ? 2 : 1 + Math.floor(rnd() * 3)])),
  });
}
states.forEach((s) => save(`state_${s.h}.json`, s));
save('state_index.json', { hours: states.map((s) => s.h) });

save('alerts.json', [
  { id: 'A1', severity: '심각', node: 'g_DGT', terminal: 'DGT', title: 'DGT 게이트 대기열 · 공공도로 넘침', since: '11:50', duration: '2시간 40분', diagnosis: true },
  { id: 'A2', severity: '주의', node: 'g_BNCT', terminal: 'BNCT', title: 'BNCT 게이트 대기 증가', since: '13:50', duration: '40분', diagnosis: false,
    brief: { cause: '게이트 처리 저하', usualThr: [72, 90], verdict: '관찰 · 30분 후 재평가' } },
]);

const spark = (from, to, n = 12, noise = 0.03) => Array.from({ length: n }, (_, i) => +(from + (to - from) * Math.max(0, (i - 4) / (n - 5)) + (rnd() - 0.5) * noise * Math.abs(to || 1)).toFixed(2));
save('diagnosis.json', {
  alert: 'A1',
  congestion: { node: 'g_DGT', label: 'DGT 게이트 + 진입로', detail: '대기 64대, 배후도로 1.4 km 넘침' },
  cause: { blocks: causeBlocks, label: 'DGT 수출 블록 B07~B09', detail: '장치율 97%, 반입 하차 지연' },
  confidence: '중간',
  path: ['rw_0', 'g_DGT', 'yard', 'berth'],
  pathLabels: ['배후도로', 'DGT 게이트', '수출 블록', '선석'],
  pathState: ['jam', 'jam', 'cause', 'ok'],
  evidence: [
    { id: 'occ', label: '수출 블록 장치율', value: 97, unit: '%', usual: [70, 82], series: spark(0.8, 0.97).map((v) => Math.round(v * 100)), src: '추정', verdict: '원인' },
    { id: 'thr', label: '게이트 처리량', value: 88, unit: '대/시', usual: [82, 96], series: spark(88, 88, 12, 0.04).map(Math.round), src: '실측', verdict: '평소 범위' },
    { id: 'tat', label: '반입 TAT', value: 82, unit: '분', usual: [38, 52], series: spark(44, 82).map(Math.round), src: '실측', verdict: '악화' },
  ],
  summary: '수출 블록이 거의 찼다. 이대로면 하차가 더 늦어지고 게이트 대기열이 배후도로로 계속 밀린다.',
  video: { camera: 'CCTV-DGT-G1', at: '14:28', score: 0.81, label: '이상 후보', similar: [{ at: '2026-07-08 15:00', sim: 0.88 }, { at: '2025-10-21 09:00', sim: 0.74 }] },
  alt: [{ label: 'DGT 게이트 레인 고장', confidence: '낮음', note: '레인 6개 모두 처리 중' }],
});

const STEPS = 36; // 10분 × 36 = 6시간
const before = [], after = [];
for (let i = 0; i <= STEPS; i++) {
  const f = i / STEPS;
  const dB = Math.round(64 + 26 * Math.min(1, f * 1.6));
  const dA = Math.round(64 - 46 * Math.min(1, f * 1.7));
  const hA = Math.round(9 + 9 * Math.min(1, f * 2));
  before.push({ step: i, minute: i * 10, queue: { g_DGT: dB, g_HJNC: 9 }, moved: 0 });
  after.push({ step: i, minute: i * 10, queue: { g_DGT: dA, g_HJNC: hA }, moved: Math.round(520 * Math.min(1, f * 1.05)) });
}
save('sim_before.json', { steps: before });
save('sim_after.json', { steps: after });

save('action.json', {
  id: 'ACT-01',
  type: '목적 터미널 변경',
  title: `DGT 수출 반입 → HJNC 임시 장치 (${hjTemp.id.split('-')[1]})`,
  volume: { value: 520, unit: 'TEU' },
  window: '6시간 (14:30~20:30)',
  from: { node: 'g_DGT', label: 'DGT 수출 반입' },
  to: { node: 'g_HJNC', block: hjTemp.id, label: `HJNC 임시 블록 ${hjTemp.id.split('-')[1]}` },
  // DGT 진입로 대기열에서 빠져나와 북측 배후도로를 따라 HJNC로 간다
  route: ['n_DGT', 'j_nw', 'n_HJNC', 'g_HJNC'],
  constraints: [
    { label: '대상 야드 여유', detail: 'HJNC 장치율 64% → 71% (상한 85%)', ok: true },
    { label: '반입 마감', detail: '대상 선박 마감까지 19시간, 전배 6시간', ok: true },
    { label: '운영사 동의', detail: 'DGT·HJNC 협의 필요', ok: null },
    { label: '도로 통행', detail: '북측 배후도로 화물차 통행 허용', ok: true },
  ],
  explain: [
    'DGT 수출 블록이 차서 하차가 늦고, 대기열이 배후도로로 넘쳤다.',
    '6시간 동안 520 TEU를 HJNC 임시 블록에 받으면 DGT 대기열이 풀린다.',
    'HJNC 게이트 대기가 7분 늘고, 선적 전 ITT 재운송 비용이 든다.',
  ],
  parties: ['DGT 운영사', 'HJNC 운영사', 'BPA 신항 관제', 'ITT 운송사'],
});

save('result.json', {
  basis: '조치 안 함 대비, 6시간 합계',
  items: [
    { id: 'wait', label: '항만 전체 트럭 대기', value: -41, unit: '%', range: [-49, -30], src: '시뮬', good: true },
    { id: 'cost', label: '추가 비용', value: 1950, unit: '만 원', range: [1600, 2400], src: '시뮬', good: false, note: 'ITT 재운송 + 임시 장치료' },
    { id: 'ship', label: '선박 지연 위험', value: 11, from: 34, unit: '%', range: [8, 17], src: '시뮬', good: true },
    { id: 'shift', label: '혼잡 전가', value: 7, unit: '분', range: [3, 12], src: '시뮬', good: false, where: 'HJNC 게이트 대기' },
  ],
});

console.log('mock written to', OUT, '| blocks:', terminals.reduce((a, t) => a + t.blocks.length, 0));
