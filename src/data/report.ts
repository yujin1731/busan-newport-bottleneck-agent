// 병목 상황 기록 보고서: 사후 판단에 쓰도록 '언제·어디서·왜·무슨 영향·어떤 대응'을 한 장으로 남기는 기록.
// 화면(보고서 미리보기), PDF(인쇄), Word, JSON이 모두 이 한 가지 기록(ReportRecord)에서 나온다.
import type { Bundle, PortState } from './types';
import { buildFacts } from './explain';
import { bnPct } from '../ui/CctvPeek';
import { vehicleHours, type PolicyResult } from './policy';

export interface ReportRecord {
  docNo: string;
  writtenAt: string; // 작성(기준) 일시
  occurredAt: string; // 발생(경보) 일시
  duration: string; // 지속시간(작성 시점까지)
  terminal: string;
  place: string; // 장소(구역)
  title: string;
  overview: string; // 한 문단 요약(언제·어디서·무엇이)
  zones: { label: string; pct: number; state: '병목' | '원활' }[]; // 구역별 혼잡도
  path: { label: string; state: '막힘' | '정상' }[]; // 막힘이 이어진 순서
  reasons: string[]; // 발생 이유
  excluded: string[]; // 따져 보고 제외한 다른 가능성
  impacts: { k: string; now: string; usual: string }[];
  impactNote: string; // 지속 시 전망 한 줄
  response: { policy: string; plan: string; type: string; volume: string; parties: string[]; constraints: string[]; decision: string };
  effects: { k: string; a: string; b: string; c: string }[]; // 조치 안 함 / 조치 후 / 변화
  history: { at: string; text: string }[];
}

type Action = { title: string; type: string; volume: { value: number; unit: string }; parties: string[]; constraints: { label: string; detail: string; ok: boolean | null }[] };

const n = (v: number) => v.toLocaleString();

export function buildReport(
  b: Bundle,
  st: PortState,
  o: { policyLabel: string; res: PolicyResult | null; candId: string; action: Action; decision: 'approved' | null | string; history: { at: string; text: string }[] },
): ReportRecord {
  const f = buildFacts(b);
  const d = b.diagnosis;
  const alert = b.alerts.find((a) => a.id === d.alert) ?? b.alerts[0];
  const [date, time] = st.asOf.split(' ');
  const area = f.blocks.label.replace(`${f.terminal} `, '');
  const thr = b.cctv.threshold;
  const worst = [...f.cctv].sort((a, z) => z.ratio - a.ratio)[0];
  const cutDate = date.replace(/-/g, '');

  const cand = o.res?.candidates.find((c) => c.id === o.candId);
  const base = o.res?.candidates.find((c) => c.id === 'BASE');
  const sim = b.cands.candidates.find((c) => c.id === o.candId);
  const baseSim = b.cands.candidates.find((c) => c.id === 'BASE');
  const hours = Math.max(1, (o.res?.horizon.minutes ?? 360) / 60);
  const avg = (v: number | null) => (v === null ? null : Math.round(v / hours));

  const effects: ReportRecord['effects'] = [];
  if (cand && base) {
    const wb = avg(base.metrics.wait.value), wn = avg(cand.metrics.wait.value);
    if (wb !== null && wn !== null) effects.push({ k: '게이트 앞 대기 차량(평균)', a: `${wb}대`, b: `${wn}대`, c: wn === wb ? '같음' : `${Math.abs(wn - wb)}대 ${wn < wb ? '감소' : '증가'}` });
    if (cand.id !== 'BASE' && sim && baseSim) {
      for (const i of cand.impacts) {
        const node = `g_${i.where.split(' ')[0]}`;
        const a = Math.round(vehicleHours(baseSim.steps, node) / hours);
        const bb = Math.round(vehicleHours(sim.steps, node) / hours);
        if (bb - a > 0) effects.push({ k: `${i.where} 대기 차량(평균)`, a: `${a}대`, b: `${bb}대`, c: `${bb - a}대 증가` });
      }
    }
    const cb = base.metrics.cost.value, cn = cand.metrics.cost.value;
    if (cb !== null && cn !== null) effects.push({ k: '총 추가비용', a: `${n(cb)}만 원`, b: `${n(cn)}만 원`, c: cn === cb ? '같음' : `${n(Math.abs(cn - cb))}만 원 ${cn < cb ? '감소' : '증가'}` });
    const mb = base.metrics.cutoffMiss.value, mn = cand.metrics.cutoffMiss.value;
    if (mb !== null && mn !== null) effects.push({ k: '마감을 놓치는 물량', a: `${n(mb)} TEU`, b: `${n(mn)} TEU`, c: mn === mb ? '같음' : `${n(Math.abs(mn - mb))} TEU ${mn < mb ? '감소' : '증가'}` });
  }

  const reasons = [
    `${f.terminal} ${area}의 장치율이 ${f.blocks.occ}%로 평소(${f.blocks.usual[0]}~${f.blocks.usual[1]}%)를 넘어 반입 하차가 늦어졌다.`,
    `이 때문에 반입 TAT가 ${f.gate.tat}분(평소 ${f.gate.usualTat[0]}~${f.gate.usualTat[1]}분)으로 길어졌다.`,
    `게이트 처리량은 ${f.gate.thr}대/시로 평소 범위(${f.gate.usualThr[0]}~${f.gate.usualThr[1]}대/시)여서 게이트 자체의 처리 저하는 아니다.`,
  ];

  const decision = o.decision === 'approved' ? '승인(협의 요청 진행)' : '승인 전(검토 중)';
  return {
    docNo: `PJ-${cutDate}-${f.terminal}-01`,
    writtenAt: st.asOf,
    occurredAt: `${date} ${alert?.since ?? time}`,
    duration: alert?.duration ?? '-',
    terminal: f.terminal,
    place: `${f.terminal} ${area} · ${worst.label}`,
    title: `${f.terminal} ${area} 포화에 따른 게이트 대기열 병목 및 대응 기록`,
    overview: `${date} ${alert?.since ?? time}부터 ${f.terminal} ${area}에서 장치율이 평소보다 높아지고, 이어서 ${worst.label}에서 줄이 길어져 병목이 발생했다. 작성 시각(${time}) 기준 ${alert?.duration ?? ''}째 이어지고 있다.`,
    zones: f.cctv.map((z) => ({ label: z.label, pct: bnPct(z.ratio, thr), state: bnPct(z.ratio, thr) >= 50 ? '병목' : '원활' })),
    path: f.path.labels.map((label, i) => ({ label, state: f.path.states[i] === 'ok' ? '정상' : '막힘' })),
    reasons,
    excluded: d.alt.map((a) => `${a.label}: ${a.note}`),
    impacts: [
      { k: '게이트 대기 차량', now: `${f.gate.queue}대`, usual: `${f.gate.usualQueue}대` },
      { k: '반입 TAT', now: `${f.gate.tat}분`, usual: `${f.gate.usualTat[0]}~${f.gate.usualTat[1]}분` },
      { k: '게이트 처리량', now: `${f.gate.thr}대/시`, usual: `${f.gate.usualThr[0]}~${f.gate.usualThr[1]}대/시` },
      { k: '공공도로 넘침', now: f.gate.spillKm ? `${f.gate.spillKm} km` : '없음', usual: '없음' },
    ],
    impactNote: `조치하지 않으면 게이트 대기 차량은 ${f.ifNoAction.queueEnd}대까지 늘어날 것으로 본다.`,
    response: {
      policy: o.policyLabel,
      plan: o.action.title,
      type: o.action.type,
      volume: `${n(o.action.volume.value)} ${o.action.volume.unit}`,
      parties: o.action.parties,
      constraints: o.action.constraints.map((c) => `${c.label}: ${c.detail}${c.ok === null ? ' (확인 필요)' : c.ok ? ' (확인됨)' : ' (불가)'}`),
      decision,
    },
    effects,
    history: o.history,
  };
}
