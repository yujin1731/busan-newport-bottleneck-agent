// 진단 화면의 자연어 설명(설명서 책).
//
// 구조: 화면은 서버·LLM이 만든 쪽 목록(ManualPage[])만 그린다.
// - VITE_EXPLAIN_URL 이 있으면 숫자만 담은 facts(JSON)를 그 주소로 보내고, LLM이 쓴 쪽을 받는다.
//   (API 키는 서버에 둔다. 브라우저 코드에는 키를 넣지 않는다.)
// - 주소가 없거나 실패하면 같은 facts로 만든 기본 문장(localPages)을 쓴다. 시연 데이터 기준이다.
//
// 글의 순서(줄글): ① 평상시와 다르게 어느 구역에서 무엇이 어떻게 되어 병목으로 판단했는지(왜 포함)
//                 ② 그렇게 판단한 이유(다른 가능성이 아닌 이유)  ③ CCTV로 본 모습
//                 ④ 이 상황이 지속된다면 어떻게 되는지
// 숫자는 **굵게** 표시한다(화면이 굵은 글씨로 그린다). '원인'·'근거' 같은 이름표는 붙이지 않고 문장 속 인과(~해서 ~돼서)로 쓴다.
import type { Bundle } from './types';
import { camViews } from '../ui/CctvPeek';

export interface ManualPage {
  title: string;
  lead?: string; // 쪽의 굵은 한 줄 제목(예: 해결 방안의 이름)
  rows?: { k: string; v: string; d?: string; tone?: 'good' | 'bad' }[]; // 이름·숫자 목록(수치로 보는 쪽)
  extra?: React.ReactNode; // 화면 안에서만 쓰는 추가 요소(서버가 보내는 값이 아니다)
  fig?: { v: string; u?: string; k: string; tone?: 'red' | 'orange' | 'ink' };
  chain?: { labels: string[]; states: string[] };
  body: string[]; // 문단. **굵게** 표시 가능
}

export interface Facts {
  terminal: string;
  asOf: string;
  blocks: { label: string; occ: number; usual: [number, number]; note: string };
  gate: { queue: number; usualQueue: number; tat: number; usualTat: [number, number]; spillKm: number; thr: number; usualThr: [number, number]; laneNote: string };
  path: { labels: string[]; states: string[] };
  cctv: { label: string; ratio: number }[];
  ifNoAction: { queueEnd: number };
}

// 받침 유무에 따라 조사를 고른다(이/가, 은/는)
const batchim = (w: string) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0; };
const iga = (w: string) => w + (batchim(w) ? '이' : '가');
const eunneun = (w: string) => w + (batchim(w) ? '은' : '는');

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function buildFacts(b: Bundle): Facts {
  const d = b.diagnosis;
  const st = b.states[0];
  const term = d.cause.blocks[0].split('-')[0];
  const node = d.congestion.node;
  const ev = (id: string) => d.evidence.find((e) => e.id === id)!;
  const past = b.hours.filter((h) => h < 0).map((h) => b.states[h]?.gates[node]?.queue ?? 0);
  const last = b.simBefore[b.simBefore.length - 1]?.queue[node] ?? st.gates[node].queue;
  return {
    terminal: term,
    asOf: st.asOf,
    blocks: { label: d.cause.label, occ: ev('occ').value, usual: ev('occ').usual, note: d.cause.detail },
    gate: {
      queue: st.gates[node].queue, usualQueue: Math.round(mean(past)), tat: ev('tat').value, usualTat: ev('tat').usual, spillKm: st.kpi.spill.km ?? 0,
      thr: ev('thr').value, usualThr: ev('thr').usual, laneNote: d.alt[0]?.note ?? '',
    },
    path: { labels: d.pathLabels, states: d.pathState },
    cctv: camViews(b, term, st.gates[node].queue).map((v) => ({ label: v.label, ratio: v.idx })),
    ifNoAction: { queueEnd: last },
  };
}

export function localPages(f: Facts): ManualPage[] {
  const top = [...f.cctv].sort((a, z) => z.ratio - a.ratio);
  const calm = f.cctv.filter((c) => c.ratio < 1.5).map((c) => c.label);
  const hot = top.filter((c) => c.ratio >= 1.5).slice(0, 2);
  const grows = f.ifNoAction.queueEnd > f.gate.queue * 1.1;
  const spill = f.gate.spillKm ? `줄이 배후도로 **${f.gate.spillKm} km**까지 이어졌습니다.` : '줄이 게이트 앞에 길게 모였습니다.';
  const lane = f.gate.laneNote ? `${f.gate.laneNote}${batchim(f.gate.laneNote) ? '이어서' : '여서'} ` : '';
  const area = f.blocks.label.replace(`${f.terminal} `, '');
  return [
    {
      title: '현재 상황',
      body: [
        `평상시와 다르게 **${f.terminal} ${area}**에서 장치율이 **${f.blocks.occ}%**까지 올랐습니다. 평소에는 ${f.blocks.usual[0]}~${f.blocks.usual[1]}% 수준입니다.`,
        `블록이 거의 차서 반입 하차가 늦어지고 있고, 그 때문에 반입 TAT가 **${f.gate.tat}분**(평소 ${f.gate.usualTat[0]}~${f.gate.usualTat[1]}분)으로 길어져 병목으로 판단했습니다.`,
      ],
    },
    {
      title: '판단 이유',
      body: [
        `게이트 처리량은 **${f.gate.thr}대/시**로 평소 범위(${f.gate.usualThr[0]}~${f.gate.usualThr[1]}대/시)이고, ${lane}게이트 자체가 느려진 것은 아닙니다.`,
        `야드에서 하차가 막히니 차량이 게이트 앞에 쌓여 대기가 **${f.gate.queue}대**(평소 ${f.gate.usualQueue}대)가 됐고, ${spill}`,
      ],
    },
    {
      title: '병목 범위',
      body: [
        hot.length ? `CCTV에서도 ${hot.map((c) => `${iga(c.label)} 평소의 **${c.ratio.toFixed(1)}배**`).join(', ')}로 붐비고 있습니다.` : 'CCTV에서는 아직 평소보다 크게 붐비는 구간이 없습니다.',
        calm.length ? `${eunneun(calm.join(', '))} 평소 수준이라, 막힘이 아직 그곳까지는 닿지 않았습니다.` : '모든 구간이 평소보다 붐빕니다.',
        hot.length > 1 ? `막힘은 ${hot.map((c) => c.label).join('에서 ')}으로 이어지는 구간에 몰려 있습니다.` : '막힘이 한 구간에 몰려 있습니다.',
      ],
    },
    {
      title: '지속 시 영향',
      body: [
        grows
          ? `이 상황이 지속된다면 게이트 대기가 **${f.ifNoAction.queueEnd}대**까지 늘어나 배후도로 정체가 더 길어집니다.`
          : `이 상황이 지속된다면 게이트 대기 **${f.ifNoAction.queueEnd}대**가 줄지 않고 배후도로 정체가 계속됩니다.`,
        `평소(${f.gate.usualQueue}대)와 비교하면 약 **${(f.ifNoAction.queueEnd / Math.max(1, f.gate.usualQueue)).toFixed(1)}배** 수준입니다.`,
      ],
    },
  ];
}

const isPage = (p: unknown): p is ManualPage => !!p && typeof (p as ManualPage).title === 'string' && Array.isArray((p as ManualPage).body);

/** LLM 서버가 있으면 거기서, 없으면 기본 문장으로 쪽 목록을 만든다 */
export async function loadPages(b: Bundle, signal?: AbortSignal): Promise<ManualPage[]> {
  const facts = buildFacts(b);
  const url = (import.meta.env as Record<string, string | undefined>).VITE_EXPLAIN_URL;
  if (!url) return localPages(facts);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts }), signal });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { pages?: unknown[] };
    const pages = (j.pages ?? []).filter(isPage);
    if (pages.length < 2) throw new Error('쪽 수 부족');
    return pages.length % 2 ? [...pages, { title: '', body: [] }] : pages;
  } catch {
    return localPages(facts);
  }
}
