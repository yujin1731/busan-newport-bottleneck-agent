// 대응안 기준 선택(대기 최소 / 선적 마감 우선 / 비용 최소)
//
// 확인된 현재 구조:
// - 서버 API·최적화기는 없다. 데이터는 public/mock/*.json(시연 데이터)을 dataSource.ts가 읽는다.
// - 시뮬레이션은 미리 계산된 두 시나리오뿐이다: 조치 안 함(sim_before), ACT-01(sim_after).
// 그래서 이 모듈은 "새 최적해 계산"이 아니라, 같은 스냅샷·같은 평가 기간의 후보를
// 정책별 기준으로 다시 정렬한다. 근거 없는 가중합은 쓰지 않고, 사전식(lexicographic) 비교만 쓴다.
// 실제 터미널에 명령을 보내지 않는다. 버튼은 '기준 선택'일 뿐이다.
import type { Bundle, SimStep } from './types';

export type PolicyId = 'min_wait' | 'protect_cutoff' | 'min_cost';
export const POLICIES: { id: PolicyId; label: string }[] = [
  { id: 'min_wait', label: '대기 최소' },
  { id: 'protect_cutoff', label: '선적 마감 우선' },
  { id: 'min_cost', label: '비용 최소' },
];

/** 값이 없으면 null(= 산정 불가). 0으로 채우지 않는다. */
export type Metric = { value: number | null; unit: string; why?: string };
export interface Candidate {
  id: string; label: string;
  feasible: 'yes' | 'needs_approval' | 'no';
  approvals: string[]; // 미확인 동의(조건부)
  metrics: { wait: Metric; cutoffMiss: Metric; cost: Metric };
  impacts: { where: string; deltaVehHours: number }[]; // + = 악화
  costParts: { label: string; value: number; unit: string; basis: string }[]; // 총액이 아닌 확인된 일부 항목(가정값 포함)
}
export interface PolicyResult {
  policy: PolicyId;
  scenarioId: string;
  asOf: string; // 상태 기준시각
  horizon: { minutes: number; stepMinutes: number };
  status: 'ok' | 'withheld' | 'error';
  statusNote?: string;
  ranking: string[]; // 후보 id, 정책 기준 순서
  recommended: string | null; // 실행 가능(조건부 포함) 1위. 비교 불가면 null(추천 보류)
  candidates: Candidate[];
  sources: string[]; // 데이터 출처·가정
  demo: true; // 시연 데이터
}

const STEP_MIN = 10;
/** 연결된 모든 게이트 대기를 합산한 누적 차량·시간(왼쪽 직사각형 적분, 10분 간격) */
export function vehicleHours(steps: SimStep[], node?: string): number {
  let s = 0;
  for (let i = 0; i < steps.length - 1; i++) {
    const q = steps[i].queue;
    s += (node ? q[node] ?? 0 : Object.values(q).reduce((a, b) => a + b, 0)) * (STEP_MIN / 60);
  }
  return Math.round(s * 10) / 10;
}

/** 후보 평가: 정책과 무관하다(정책 전환만으로 지표가 바뀌지 않는다).
 *  후보 시뮬레이션(candidates.json, 시연용)과 가정 단가로 공통 지표 3개를 계산한다. */
export function evaluateCandidates(b: Bundle): Candidate[] {
  const A = b.cands.assumptions;
  const baseSteps = b.cands.candidates.find((c) => c.id === 'BASE')?.steps ?? b.simBefore;
  const nodes = Object.keys(baseSteps[0]?.queue ?? {});
  return b.cands.candidates.map((c) => {
    const vh = vehicleHours(c.steps);
    const miss = Math.max(0, c.cutoff.needTEU - c.cutoff.atLoadingByCutoffTEU);
    const parts = [
      { label: '추가 운송', value: c.qty.transportTEU * A.transportPerTEU.value, src: A.transportPerTEU.src },
      { label: '복귀 운송', value: c.qty.returnTEU * A.transportPerTEU.value, src: A.transportPerTEU.src },
      { label: '상하차·재취급', value: c.qty.rehandleMoves * A.rehandlePerMove.value, src: A.rehandlePerMove.src },
      { label: '임시 보관', value: c.qty.storageTEUday * A.storagePerTEUday.value, src: A.storagePerTEUday.src },
      { label: '차량 대기', value: Math.round(vh * A.waitPerVehHour.value), src: A.waitPerVehHour.src },
    ];
    // 항목별 수량이 서로 겹치지 않게 정의했다(운송=편도 1회, 복귀=별도 1회, 재취급=작업 횟수, 대기=차량·시간)
    const total = parts.reduce((a, p) => a + p.value, 0);
    return {
      id: c.id, label: c.label,
      feasible: c.blocked || c.constraints.some((x) => x.ok === false) ? 'no' : (c.constraints.some((x) => x.ok === null) || c.approvals.length) ? 'needs_approval' : 'yes',
      approvals: c.constraints.length ? c.constraints.filter((x) => x.ok === null).map((x) => x.label) : c.approvals,
      metrics: {
        wait: { value: vh, unit: '차량·시간' },
        cutoffMiss: { value: miss, unit: 'TEU', why: c.cutoff.note },
        cost: { value: Math.round(total / 10000), unit: '만 원', why: '가정 단가 포함(시연용)' },
      },
      impacts: c.id === 'BASE' ? [] : nodes
        .map((n) => ({ where: n.replace('g_', '') + ' 게이트', deltaVehHours: Math.round((vehicleHours(c.steps, n) - vehicleHours(baseSteps, n)) * 10) / 10 }))
        .filter((x) => x.deltaVehHours > 0),
      costParts: parts.filter((p) => p.value > 0).map((p) => ({ label: p.label, value: Math.round(p.value / 10000), unit: '만 원', basis: p.src })),
    } as Candidate;
  });
}

const ORDER: Record<PolicyId, ('wait' | 'cutoffMiss' | 'cost')[]> = {
  min_wait: ['wait', 'cutoffMiss', 'cost'],
  protect_cutoff: ['cutoffMiss', 'wait', 'cost'],
  min_cost: ['cost', 'cutoffMiss', 'wait'],
};

/** 사전식 정렬. 첫 기준이 산정 불가인 후보가 있으면 비교할 수 없으므로 추천을 보류한다. */
export function rank(policy: PolicyId, cands: Candidate[]): { ranking: string[]; recommended: string | null; note?: string } {
  const keys = ORDER[policy];
  const primary = keys[0];
  const usable = cands.filter((c) => c.feasible !== 'no');
  const missing = usable.filter((c) => c.metrics[primary].value === null);
  const cmp = (a: Candidate, z: Candidate) => {
    for (const k of keys) {
      const x = a.metrics[k].value, y = z.metrics[k].value;
      if (x === null || y === null) continue; // 비교 불가 기준은 건너뛴다(동률 처리)
      if (x !== y) return x - y;
    }
    return 0;
  };
  const sorted = [...cands].sort((a, z) => (a.feasible === 'no' ? 1 : 0) - (z.feasible === 'no' ? 1 : 0) || cmp(a, z));
  if (usable.length < 2) return { ranking: sorted.map((c) => c.id), recommended: null, note: '비교 가능한 후보 부족' };
  if (missing.length) return { ranking: sorted.map((c) => c.id), recommended: null, note: `${missing[0].metrics[primary].why ?? '기준 지표 없음'}` };
  return { ranking: sorted.map((c) => c.id), recommended: sorted.find((c) => c.feasible !== 'no')!.id };
}

// ---- 서버 계약을 흉내 낸 로컬 계산 함수 (실제 서버 없음) ----
const cache = new Map<string, PolicyResult>();
export const cacheKey = (policy: PolicyId, asOf: string, horizonMin: number) => `${policy}|${asOf}|${horizonMin}`;

export async function requestPolicy(policy: PolicyId, b: Bundle, asOf: string, opts: { delayMs?: number; fail?: boolean } = {}): Promise<PolicyResult> {
  const horizon = { minutes: (b.simBefore.length - 1) * STEP_MIN, stepMinutes: STEP_MIN };
  const key = cacheKey(policy, asOf, horizon.minutes);
  await new Promise((r) => setTimeout(r, opts.delayMs ?? 250));
  if (opts.fail) throw new Error('정책 계산 요청 실패');
  const hit = cache.get(key);
  if (hit) return hit;
  const candidates = evaluateCandidates(b);
  const r = rank(policy, candidates);
  const res: PolicyResult = {
    policy, scenarioId: `${asOf}#${b.action.id}`, asOf, horizon,
    status: r.recommended ? 'ok' : 'withheld', statusNote: r.note,
    ranking: r.ranking, recommended: r.recommended, candidates,
    sources: [
      '후보 시뮬레이션: 시연용(scripts/gen-candidates.mjs, 10분 간격 6시간 대기열 곡선). 실제 시뮬레이터 아님',
      '대기 = 연결 게이트(DGT·HJNC) 대기 차량 합 × 10분, 왼쪽 직사각형 적분',
      ...Object.entries(b.cands.assumptions).map(([k, v]) => `${k}: ${v.value.toLocaleString()} · ${v.src}`),
      '임시 보관지 도착은 선적 마감 준수로 보지 않음(복귀 운송 후 적재 터미널 기준). 운영사 동의 미확인 → 승인 필요. 이상치 제외 0건',
    ],
    demo: true,
  };
  cache.set(key, res);
  return res;
}
