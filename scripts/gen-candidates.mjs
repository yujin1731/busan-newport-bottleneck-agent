// 대응 후보 시연 시뮬레이션(public/mock/candidates.json)
// 실제 시뮬레이터가 아니다. 기존 sim_before/sim_after와 같은 방식(10분 간격 6시간 대기열 곡선)으로
// 후보별 시연 시나리오를 만든다. 모든 수치는 '시연용 가정'이며 출처를 assumptions에 남긴다.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'mock');
const rd = (n) => JSON.parse(readFileSync(join(OUT, n), 'utf8'));
const before = rd('sim_before.json').steps, after = rd('sim_after.json').steps;
const STEPS = 36;
const curve = (fn) => Array.from({ length: STEPS + 1 }, (_, i) => fn(i / STEPS, i));

const candidates = [
  {
    id: 'BASE', label: '조치 안 함', kind: 'none', type: '조치 없음', volume: 0, parties: [], constraints: [], approvals: [], blocked: false, route: false,
    steps: before,
    cutoff: { needTEU: 520, atLoadingByCutoffTEU: 520, note: '화물이 DGT에 그대로 있음' },
    qty: { transportTEU: 0, returnTEU: 0, rehandleMoves: 0, storageTEUday: 0 },
  },
  {
    id: 'ACT-01', label: 'DGT 수출 반입 → HJNC 임시 장치 (B01)', kind: 'transfer', type: '목적 터미널 변경', volume: 520, parties: rd('action.json').parties, constraints: rd('action.json').constraints, approvals: ['운영사 동의(DGT·HJNC)'], blocked: false, route: true,
    steps: after,
    // HJNC에 둔 520 TEU는 마감 전 DGT로 되돌려야 선적 가능. 복귀 ITT 처리능력 30 TEU/시(가정) × 남은 13시간 = 390 TEU
    cutoff: { needTEU: 520, atLoadingByCutoffTEU: 390, note: 'HJNC 보관분 복귀 ITT 30 TEU/시(가정) × 13시간' },
    qty: { transportTEU: 520, returnTEU: 520, rehandleMoves: 1040, storageTEUday: 520 },
  },
  {
    id: 'ACT-02', label: 'DGT 반입 예약 분산 (2시간 뒤로)', kind: 'reschedule', type: '반입 시간 조정', volume: 520, parties: ['DGT 운영사', 'BPA 신항 관제', '운송사'], constraints: [{ label: '반입 마감', detail: '2시간 지연 후에도 마감 전 도착(가정)', ok: true }, { label: '운영사 동의', detail: 'DGT 예약 슬롯 변경 협의 필요', ok: null }, { label: '운송사 통보', detail: '반입 예약 변경 안내 필요', ok: null }], approvals: ['운영사 동의(DGT)', '운송사 통보'], blocked: false, route: false,
    steps: curve((f, i) => ({ step: i, minute: i * 10, queue: { g_DGT: Math.round(64 - 22 * Math.min(1, f * 1.4)), g_HJNC: 9 }, moved: 0 })),
    cutoff: { needTEU: 520, atLoadingByCutoffTEU: 520, note: '반입을 2시간 늦춰도 마감(+19시간) 전 도착(가정)' },
    qty: { transportTEU: 0, returnTEU: 0, rehandleMoves: 0, storageTEUday: 0 },
  },
  {
    id: 'ACT-03', label: 'DGT 야드 재정리 (재취급 투입)', kind: 'rehandle', type: '야드 재정리', volume: 300, parties: ['DGT 운영사', 'BPA 신항 관제'], constraints: [{ label: '장비 여유', detail: 'DGT 야드 장비 추가 투입 가능 여부 미확인', ok: null }, { label: '반입 마감', detail: '화물이 DGT 안에 머묾', ok: true }, { label: '운영사 동의', detail: 'DGT 재취급 작업 협의 필요', ok: null }], approvals: ['운영사 동의(DGT)'], blocked: false, route: false,
    steps: curve((f, i) => ({ step: i, minute: i * 10, queue: { g_DGT: Math.round(64 - 34 * Math.min(1, Math.max(0, f - 0.15) * 1.5)), g_HJNC: 9 }, moved: 0 })),
    cutoff: { needTEU: 520, atLoadingByCutoffTEU: 520, note: '화물이 DGT 안에서만 움직임' },
    qty: { transportTEU: 0, returnTEU: 0, rehandleMoves: 300, storageTEUday: 0 },
  },
];

writeFileSync(join(OUT, 'candidates.json'), JSON.stringify({
  demo: true,
  assumptions: {
    // 단가(원). 운송만 공개 자료(미확인) 근거, 나머지는 시연용 가정
    transportPerTEU: { value: 30700, src: '화물차 안전운송운임 신항 13km 20피트(블로그 정리, 고시 원문 미확인)' },
    rehandlePerMove: { value: 25000, src: '시연용 가정(터미널 요율 미확인)' },
    storagePerTEUday: { value: 10000, src: '시연용 가정(터미널 보관료 미확인)' },
    waitPerVehHour: { value: 30000, src: '시연용 가정(차량 대기 비용 근거 없음)' },
    cutoffHours: { value: 19, src: '시연 데이터 action.json 반입 마감 문구' },
  },
  candidates,
}));
console.log('candidates.json written:', candidates.map((c) => c.id).join(', '));
