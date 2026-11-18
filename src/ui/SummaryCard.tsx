import { useMemo } from 'react';
import { useUI } from '../store';
import { useView } from '../view';
import { buildFacts } from '../data/explain';
import { bnPct } from './CctvPeek';
import { DiagTabs, UnderTab } from './IndexTabs';

// 진단 화면에 들어오면 가장 먼저 보이는 요약(표). '설명서' 탭을 누르면 책으로 넘어간다.
type Tone = 'bad' | 'ok' | 'warn';
const chip = (tone: Tone, text: string) => <span className={`sum-chip is-${tone}`}>{text}</span>;

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="sum-sec" open>
      <summary>{title}{action}</summary>
      {children}
    </details>
  );
}

// 히트맵 나열과 같은 모양의 표: 칸 사이에 →, 위는 이름, 아래는 값. hot 칸은 붉게 강조한다.
function FlowTable({ heads, lines, hot }: { heads: string[]; lines: React.ReactNode[][]; hot: boolean[] }) {
  const cols = (cells: React.ReactNode[], th = false, arrows = true) => cells.flatMap((cell, i) => {
    const main = th ? <th key={`c${i}`} className={hot[i] ? 'is-hot' : ''}>{cell}</th> : <td key={`c${i}`} className={hot[i] ? 'is-hot' : ''}>{cell}</td>;
    return i < cells.length - 1 ? [main, th ? <th key={`a${i}`} className="arr">{arrows ? '→' : ''}</th> : <td key={`a${i}`} className="arr" />] : [main];
  });
  return (
    <table className="sum-flow">
      <thead><tr>{cols(heads, true)}</tr></thead>
      <tbody>{lines.map((l, i) => <tr key={i}>{cols(l)}</tr>)}</tbody>
    </table>
  );
}

export function SummaryCard() {
  const { data } = useView();
  const set = useUI((s) => s.set);
  const heatTab = useUI((s) => s.heatTab);
  const f = useMemo(() => buildFacts(data), [data]);
  const thr = data.cctv.threshold;
  const rel = (v: number, [lo, hi]: [number, number]): { tone: Tone; text: string } => (v > hi ? { tone: 'bad', text: '평소보다 높음' } : v < lo ? { tone: 'ok', text: '평소보다 낮음' } : { tone: 'ok', text: '평소 범위' });
  const occ = f.blocks.occ >= 85 ? { tone: 'bad' as Tone, text: '포화' } : rel(f.blocks.occ, f.blocks.usual);
  const tat = rel(f.gate.tat, f.gate.usualTat);
  const thrS = rel(f.gate.thr, f.gate.usualThr);
  const qRatio = f.gate.queue / Math.max(1, f.gate.usualQueue);
  const rows: { k: string; now: string; usual: string; st: { tone: Tone; text: string } }[] = [
    { k: '수출 블록 장치율', now: `${f.blocks.occ}%`, usual: `${f.blocks.usual[0]}~${f.blocks.usual[1]}%`, st: occ },
    { k: '게이트 대기 차량', now: `${f.gate.queue}대`, usual: `${f.gate.usualQueue}대`, st: qRatio >= 1.5 ? { tone: 'bad', text: '평소보다 많음' } : { tone: 'ok', text: '평소 범위' } },
    { k: '반입 TAT', now: `${f.gate.tat}분`, usual: `${f.gate.usualTat[0]}~${f.gate.usualTat[1]}분`, st: tat },
    { k: '게이트 처리량', now: `${f.gate.thr}대/시`, usual: `${f.gate.usualThr[0]}~${f.gate.usualThr[1]}대/시`, st: thrS },
    { k: '공공도로 넘침', now: f.gate.spillKm ? `${f.gate.spillKm} km` : '없음', usual: '없음', st: f.gate.spillKm ? { tone: 'bad', text: '넘침' } : { tone: 'ok', text: '정상' } },
  ];
  const worst = [...f.cctv].sort((a, z) => z.ratio - a.ratio)[0];
  const isBn = worst.ratio >= thr;

  return (
    <div className="card pn book-card theme-cool summary-card">
      <DiagTabs />
      <div className="sum-paper">
        <header className="sum-head">
          <h2>{f.terminal} 병목 요약</h2>
          <small>{f.asOf.slice(5).replace('-', '.')} 기준</small>
        </header>
        <p className={`sum-verdict ${isBn ? 'is-bn' : ''}`}>
          <i aria-hidden="true">!</i>
          {isBn ? <><b>병목으로 판단</b><span>{f.blocks.label.replace(`${f.terminal} `, '')} 장치율 포화 · {worst.label}에서 줄이 길어짐</span></> : <b>병목 없음</b>}
        </p>

        <Section title="상황 요약">
          <table className="sum-table">
            <thead><tr><th>항목</th><th>현재</th><th>평소</th><th>상태</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.k}><th scope="row">{r.k}</th><td className="num">{r.now}</td><td className="num muted">{r.usual}</td><td>{chip(r.st.tone, r.st.text)}</td></tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section
          title="구역별 혼잡도"
          action={(
            <button
              type="button"
              className="sum-act"
              aria-pressed={heatTab !== null}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); set({ heatTab: heatTab === null ? 0 : null }); }}
            >{heatTab === null ? 'CCTV 현황 보기' : 'CCTV 현황 닫기'}</button>
          )}
        >
          <FlowTable
            heads={f.cctv.map((z) => z.label)}
            hot={f.cctv.map((z) => bnPct(z.ratio, thr) >= 50)}
            lines={[
              f.cctv.map((z) => <span className="num">{bnPct(z.ratio, thr)}<small>%</small></span>),
              f.cctv.map((z) => (bnPct(z.ratio, thr) >= 50 ? chip('bad', '병목') : chip('ok', '원활'))),
            ]}
          />
        </Section>

        <Section title="지속 시 파급 경로">
          <FlowTable
            heads={f.path.labels}
            hot={f.path.states.map((s) => s !== 'ok')}
            lines={[f.path.states.map((s) => (s === 'ok' ? chip('ok', '정상') : chip('bad', '막힘')))]}
          />
        </Section>
      </div>
      <UnderTab />
    </div>
  );
}
