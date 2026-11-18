import { useView } from '../view';
import { ResponseTabs, UnderTab } from './IndexTabs';
import { SimControls } from './Chrome';
import { vehicleHours, type PolicyResult } from '../data/policy';

// 대응 화면: 글 없이 표 두 개. 위는 해결 방안(무엇을 하는지), 아래는 효과(조치 안 함과 조치 후를 나란히).
type Tone = 'good' | 'bad' | 'flat';
const chip = (tone: Tone, text: string) => <span className={`sum-chip is-${tone === 'good' ? 'ok' : tone === 'bad' ? 'bad' : 'warn'}`}>{text}</span>;
const n = (v: number) => v.toLocaleString();

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="sum-sec" open>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

export function ResponseCard({ res, candId, policyLabel }: { res: PolicyResult | null; candId: string; policyLabel: string }) {
  const { data } = useView();
  const cand = res?.candidates.find((c) => c.id === candId);
  const base = res?.candidates.find((c) => c.id === 'BASE');
  const sim = data.cands.candidates.find((c) => c.id === candId);
  const baseSim = data.cands.candidates.find((c) => c.id === 'BASE');
  if (!res || !cand || !base) {
    return <div className="card pn book-card theme-warm summary-card"><ResponseTabs /><div className="sum-paper"><header className="sum-head"><h2>대응안</h2></header><p className="sum-verdict">계산 중입니다.</p></div></div>;
  }
  const hours = Math.max(1, res.horizon.minutes / 60);
  const avg = (v: number | null) => (v === null ? null : Math.round(v / hours));
  const isBase = cand.id === 'BASE';
  const [from, to] = cand.label.split(' → ');
  const detail = /\((.+?)\)/.exec(cand.label)?.[1] ?? '';

  // 해결 방안: 한눈에 보이는 표
  const plan: [string, string][] = isBase
    ? [['방안', '별도 조치 없이 지켜봅니다']]
    : [
        ['방안', sim?.kind === 'transfer' && to ? `${from}물을 ${to}로 이동` : sim?.kind === 'reschedule' ? `DGT 반입 예약을 ${detail || '나중으로'} 미룸` : sim?.kind === 'rehandle' ? 'DGT 야드 안에서 재정리' : cand.label],
        ...(sim?.volume ? ([['물량', `${n(sim.volume)} TEU`]] as [string, string][]) : []),
        ['방식', sim?.type ?? ''],
      ];

  // 효과: 조치 안 함 / 조치 후 / 변화
  const wBase = avg(base.metrics.wait.value), wNow = avg(cand.metrics.wait.value);
  const effect: { k: string; a: string; b: string; tone: Tone; text: string }[] = [];
  if (wBase !== null && wNow !== null) {
    const d = wNow - wBase;
    effect.push({ k: '게이트 앞 대기 차량(평균)', a: `${wBase}대`, b: `${wNow}대`, tone: d < 0 ? 'good' : d > 0 ? 'bad' : 'flat', text: d === 0 ? '같음' : `${Math.abs(d)}대 ${d < 0 ? '감소' : '증가'}` });
  }
  if (!isBase) {
    for (const i of cand.impacts) {
      const node = `g_${i.where.split(' ')[0]}`;
      const a = sim && baseSim ? Math.round(vehicleHours(baseSim.steps, node) / hours) : 0;
      const b = sim ? Math.round(vehicleHours(sim.steps, node) / hours) : 0;
      if (b - a > 0) effect.push({ k: `${i.where} 대기 차량(평균)`, a: `${a}대`, b: `${b}대`, tone: 'bad', text: `${b - a}대 증가` });
    }
  }
  const cb = base.metrics.cost.value, cn = cand.metrics.cost.value;
  if (cb !== null && cn !== null) effect.push({ k: '총 추가비용', a: `${n(cb)}만 원`, b: `${n(cn)}만 원`, tone: cn < cb ? 'good' : cn > cb ? 'bad' : 'flat', text: cn === cb ? '같음' : `${n(Math.abs(cn - cb))}만 원 ${cn < cb ? '감소' : '증가'}` });
  const mb = base.metrics.cutoffMiss.value, mn = cand.metrics.cutoffMiss.value;
  if (mb !== null && mn !== null) effect.push({ k: '마감을 놓치는 물량', a: `${n(mb)} TEU`, b: `${n(mn)} TEU`, tone: mn < mb ? 'good' : mn > mb ? 'bad' : 'flat', text: mn === mb ? '같음' : `${n(Math.abs(mn - mb))} TEU ${mn < mb ? '감소' : '증가'}` });

  return (
    <div className="card pn book-card theme-warm summary-card">
      <ResponseTabs />
      <div className="sum-paper">
        <header className="sum-head">
          <h2>대응안</h2>
          <small>{policyLabel} 기준</small>
        </header>
        {from && to && !isBase ? (
          <p className="resp-flow"><span>{from}</span><i aria-hidden="true">→</i><span>{to}</span></p>
        ) : (
          <p className="resp-flow"><span>{cand.label}</span></p>
        )}

        <Section title="해결 방안">
          <table className="sum-table">
            <tbody>
              {plan.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td className="left">{v}</td></tr>)}
            </tbody>
          </table>
        </Section>

        <Section title="효과">
          <table className="sum-table">
            <thead><tr><th>항목</th><th>조치 안 함</th><th>조치 후</th><th>변화</th></tr></thead>
            <tbody>
              {effect.map((r) => (
                <tr key={r.k}><th scope="row">{r.k}</th><td className="num muted">{r.a}</td><td className="num">{r.b}</td><td>{chip(r.tone, r.text)}</td></tr>
              ))}
            </tbody>
          </table>
        </Section>

        <div className="sum-sim"><SimControls /></div>
      </div>
      <UnderTab label="승인" to={4} />
    </div>
  );
}
