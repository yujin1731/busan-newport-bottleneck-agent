import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useView } from '../view';
import { loadPages, type ManualPage } from '../data/explain';
import { DiagTabs, CctvButton, UnderTab } from './IndexTabs';

// 펼친 책의 쪽을 넘기며 자연어로 설명한다. 진단 화면(병목 설명서)과 대응 화면(해결 방안)이 같은 책을 쓰고 색만 다르다.
const FLIP_MS = 760;

// **굵게** 표시를 굵은 글씨로 바꾼다
const rich = (t: string) => t.split('**').map((s, i) => (i % 2 ? <strong key={i}>{s}</strong> : s));

function Page({ p, n, side }: { p?: ManualPage; n: number; side: 'l' | 'r' }) {
  if (!p) return <div className={`pg pg-${side}`} />;
  return (
    <div className={`pg pg-${side}${p.lead ? " pg-center" : ""}`}>
      {p.title && <h3 className="pg-t">{p.title}</h3>}
      {p.lead && (p.lead.includes(' → ')
        ? <h4 className="pg-lead pg-lead-flow">{p.lead.split(' → ').flatMap((t, i, arr) => (i < arr.length - 1 ? [<span key={`t${i}`}>{t}</span>, <i key={`a${i}`} aria-label="에서">↓</i>] : [<span key={`t${i}`}>{t}</span>]))}</h4>
        : <h4 className="pg-lead">{p.lead}</h4>)}
      {p.fig && (
        <div className={`pg-fig tone-${p.fig.tone ?? 'ink'}`}>
          <b>{p.fig.v}{p.fig.u && <small>{p.fig.u}</small>}</b>
          <span>{p.fig.k}</span>
        </div>
      )}
      {p.chain && (
        <ol className="pg-chain">
          {p.chain.labels.map((l, i) => <li key={l} className={`st-${p.chain!.states[i]}`}>{l}</li>)}
        </ol>
      )}
      {p.rows && (
        <dl className="pg-rows">
          {p.rows.map((r) => (
            <div key={r.k} className={`pg-row ${r.tone ? `tone-${r.tone}` : ''}`}>
              <dt>{r.k}</dt>
              <dd>{r.v}{r.d && <small>{r.d}</small>}</dd>
            </div>
          ))}
        </dl>
      )}
      {p.body.map((t, i) => <p key={i} className="pg-p">{rich(t)}</p>)}
      {p.extra}
      {p.title && <span className="pg-n">{n}</span>}
    </div>
  );
}

/** 쪽 목록을 책으로 보여 준다. tabs: 책 위에 꽂는 인덱스 탭, theme: 색 테마(cool=진단, warm=대응) */
export function BookView({ pages, tabs, theme = 'cool', label, resetKey }: { pages: ManualPage[]; tabs: React.ReactNode; theme?: 'cool' | 'warm'; label: string; resetKey?: string }) {
  const [spread, setSpread] = useState(0);
  const [turning, setTurning] = useState<null | 'next' | 'prev'>(null);
  const timer = useRef<number>();
  const total = pages.length / 2;
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { setSpread(0); }, [resetKey]);

  const turn = useCallback((dir: 'next' | 'prev') => {
    if (turning) return;
    if (dir === 'next' ? spread >= total - 1 : spread <= 0) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setSpread((s) => s + (dir === 'next' ? 1 : -1)); return; }
    setTurning(dir);
    timer.current = window.setTimeout(() => { setSpread((s) => s + (dir === 'next' ? 1 : -1)); setTurning(null); }, FLIP_MS);
  }, [turning, spread, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') turn('next'); if (e.key === 'ArrowLeft') turn('prev'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn]);

  const s = Math.min(spread, total - 1);
  // 넘기는 동안 아래에 드러나는 쪽: 앞으로(next)는 다음 펼침의 오른쪽, 뒤로(prev)는 이전 펼침의 왼쪽
  const L = turning === 'prev' ? 2 * (s - 1) : 2 * s;
  const R = turning === 'next' ? 2 * (s + 1) + 1 : 2 * s + 1;
  const leaf = turning === 'next'
    ? { front: 2 * s + 1, back: 2 * (s + 1) }
    : turning === 'prev'
      ? { front: 2 * (s - 1) + 1, back: 2 * s }
      : null;

  return (
    <div className={`card pn book-card theme-${theme}`}>
      {tabs}
      <div className="book" role="group" aria-label={label}>
        <div className="book-pages">
          <div className={`pg-hit ${s > 0 ? 'can-prev' : ''}`} onClick={() => turn('prev')}><Page p={pages[L]} n={L + 1} side="l" /></div>
          <div className={`pg-hit ${s < total - 1 ? 'can-next' : ''}`} onClick={() => turn('next')}><Page p={pages[R]} n={R + 1} side="r" /></div>
          {leaf && (
            <div className={`leaf ${turning}`} aria-hidden="true">
              <div className="face front"><Page p={pages[leaf.front]} n={leaf.front + 1} side="r" /></div>
              <div className="face back"><Page p={pages[leaf.back]} n={leaf.back + 1} side="l" /></div>
            </div>
          )}
        </div>
        <span className="book-clasp" aria-hidden="true" />
      </div>
      {/* 화면 낭독·키보드용(눈에는 보이지 않는다). 눈에 보이는 안내는 쪽 모서리의 접힌 귀퉁이 */}
      <button className="sr-only" onClick={() => turn('prev')} disabled={s <= 0 || !!turning}>이전 쪽</button>
      <button className="sr-only" onClick={() => turn('next')} disabled={s >= total - 1 || !!turning}>다음 쪽</button>
    </div>
  );
}

// 진단 화면의 병목 설명서: 책이 아니라 보고서 한 장씩 넘겨 가며 읽는다(요약과 같은 종이 색)
function ReportPage({ p }: { p: ManualPage }) {
  return (
    <div className="rp-page">
      {p.title && <h3 className="rp-bar"><span>{p.title}</span>{p.extra}</h3>}
      {p.lead && <p className="rp-lead">{p.lead}</p>}
      {p.fig && (
        <div className={`rp-fig tone-${p.fig.tone ?? 'ink'}`}>
          <b>{p.fig.v}{p.fig.u && <small>{p.fig.u}</small>}</b>
          <span>{p.fig.k}</span>
        </div>
      )}
      {p.chain && (
        <ol className="rp-chain">
          {p.chain.labels.map((l, i) => <li key={l} className={`st-${p.chain!.states[i]}`}>{l}</li>)}
        </ol>
      )}
      {p.rows && (
        <table className="rp-rows"><tbody>
          {p.rows.map((r) => (
            <tr key={r.k} className={r.tone ? `tone-${r.tone}` : ''}><th scope="row">{r.k}</th><td>{r.v}{r.d && <small>{r.d}</small>}</td></tr>
          ))}
        </tbody></table>
      )}
      {p.body.map((t, i) => <p key={i} className="rp-p">{rich(t)}</p>)}
    </div>
  );
}

function ReportView({ pages: all }: { pages: ManualPage[] }) {
  // 한 장에 두 사항씩
  const pages = useMemo(() => Array.from({ length: Math.ceil(all.length / 2) }, (_, k) => all.slice(k * 2, k * 2 + 2)), [all]);
  const [raw, setI] = useState(0);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const last = pages.length - 1;
  const i = Math.min(raw, last);
  const go = useCallback((d: 1 | -1) => {
    setI((c) => Math.min(last, Math.max(0, c + d)));
    setDir(d === 1 ? 'next' : 'prev');
  }, [last]);
  useEffect(() => { setI(0); }, [all]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);
  return (
    <div className="card pn book-card theme-cool summary-card report-card">
      <DiagTabs />
      <div className="sum-paper">
        <header className="sum-head">
          <h2>병목 설명서</h2>
          <small>{i + 1} / {pages.length}</small>
        </header>
        <div className="rp-body">
          <div key={i} className={`rp-turn is-${dir}`}>{pages[i].map((p, k) => <ReportPage key={k} p={p} />)}</div>
        </div>
        <nav className="rp-nav" aria-label="쪽 넘기기">
          <button type="button" onClick={() => go(-1)} disabled={i === 0}>← 이전</button>
          <span className="rp-dots" aria-hidden="true">{pages.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</span>
          <button type="button" onClick={() => go(1)} disabled={i === last}>다음 →</button>
        </nav>
      </div>
      <UnderTab />
    </div>
  );
}

export function ManualBook() {
  const { data } = useView();
  const [pages, setPages] = useState<ManualPage[] | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    loadPages(data, ac.signal).then(setPages);
    return () => ac.abort();
  }, [data]);
  if (!pages) return <div className="card pn book-card theme-cool summary-card report-card"><DiagTabs /><div className="sum-paper"><header className="sum-head"><h2>병목 설명서</h2></header><p className="rp-p">설명서를 정리하는 중입니다.</p></div></div>;
  // 병목 범위 쪽에는 CCTV 현황 보기 버튼을 따로 둔다
  const withBtn = pages.map((p, k) => (p.title === '병목 범위' || (k === 2 && !pages.some((x) => x.title === '병목 범위')) ? { ...p, extra: <CctvButton /> } : p));
  return <ReportView pages={withBtn} />;
}
