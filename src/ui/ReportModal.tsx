import { useEffect, useMemo, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useUI } from '../store';
import { useView } from '../view';
import { POLICIES, requestPolicy, type PolicyResult } from '../data/policy';
import { buildReport, type ReportRecord } from '../data/report';
import { camViews, renderCamPng } from './CctvPeek';
import { makeZip, type ZipFile } from '../data/zip';

// 업무보고서 양식: 제목, 결재란이 있는 머리표, ■ 항목별 본문. 화면·PDF·Word가 같은 마크업을 쓴다.
const DOC_CSS = `
.rdoc{box-sizing:border-box;width:720px;margin:0 auto;background:#fff;color:#111;border:1px solid #222;padding:28px 30px 34px;font-family:'Malgun Gothic','맑은 고딕','Noto Sans KR',sans-serif;font-size:13px;line-height:1.6}
.rdoc h1{margin:0 0 18px;text-align:center;font-size:26px;letter-spacing:.2em;font-weight:700}
.rdoc table{width:100%;border-collapse:collapse}
.rdoc th,.rdoc td{border:1px solid #333;padding:6px 8px;font-size:13px;vertical-align:middle}
.rdoc th{background:#f2f2f2;font-weight:700;text-align:center;white-space:nowrap}
.rdoc td{text-align:center}
.rdoc td.l{text-align:left}
.rdoc .sign th{width:52px;font-size:12px}
.rdoc .sign td{height:42px}
.rdoc h2{margin:20px 0 6px;font-size:14px;font-weight:700}
.rdoc h2::before{content:'■ ';font-size:11px}
.rdoc p{margin:0 0 6px}
.rdoc ul{margin:0 0 6px;padding-left:18px}
.rdoc li{margin:0 0 3px}
.rdoc .bad{color:#c00000;font-weight:700}
.rdoc .blank td{height:30px}
.rdoc .note{margin-top:14px;font-size:11.5px;color:#555}
.rdoc .gap td{border:0;padding:0;height:6px}
`;

// 화면에서는 3쪽으로 나눠 보이고(page 지정), PDF·Word 내보내기는 전체를 한 번에 쓴다(page 없음)
const PAGES: number[][] = [[0, 1, 2], [3, 4, 5], [6, 7]]; // 0 머리표, 1~7 항목, 7 뒤에 맺음말
export const REPORT_PAGES = PAGES.length;

function Doc({ r, page }: { r: ReportRecord; page?: number }) {
  const on = (n: number) => page === undefined || PAGES[page - 1].includes(n);
  return (
    <div className={`rdoc${page ? ' paged' : ''}`}>
      {page && page > 1 && <div className="pg-run">병목 상황 기록 보고서 · {r.docNo}</div>}
      {on(0) && (<>
      <h1>병목 상황 기록 보고서</h1>
      <table>
        <tbody>
          <tr>
            <th style={{ width: 92 }}>문서번호</th><td colSpan={2}>{r.docNo}</td>
            <th style={{ width: 52 }}>담당</th><th style={{ width: 52 }}>팀장</th><th style={{ width: 52 }}>부서장</th>
          </tr>
          <tr>
            <th>작성일시</th><td colSpan={2}>{r.writtenAt}</td>
            <td rowSpan={4} style={{ height: 96 }} /><td rowSpan={4} /><td rowSpan={4} />
          </tr>
          <tr><th>발생일시</th><td colSpan={2}>{r.occurredAt}</td></tr>
          <tr><th>지속시간</th><td colSpan={2}>{r.duration}째 (작성 시각까지)</td></tr>
          <tr><th>발생 장소</th><td colSpan={2}>{r.place}</td></tr>
          <tr><th>작성 주체</th><td colSpan={5}>Port-J 병목 진단 시스템 자동 기록 / 확인: 관제 담당자 (서명)</td></tr>
          <tr><th>제 목</th><td colSpan={5} style={{ fontWeight: 700 }}>{r.title}</td></tr>
        </tbody>
      </table>

      </>)}
      {on(1) && (<>
      <h2>1. 상황 개요</h2>
      <p>{r.overview}</p>
      </>)}
      {on(2) && (<>
      <h2>2. 병목 구간(장소)</h2>
      <table>
        <thead><tr><th>구분</th>{r.zones.map((z) => <th key={z.label}>{z.label}</th>)}</tr></thead>
        <tbody>
          <tr><th>혼잡도</th>{r.zones.map((z) => <td key={z.label} className={z.state === '병목' ? 'bad' : ''}>{z.pct}%</td>)}</tr>
          <tr><th>판정</th>{r.zones.map((z) => <td key={z.label} className={z.state === '병목' ? 'bad' : ''}>{z.state}</td>)}</tr>
        </tbody>
      </table>
      <table style={{ marginTop: 6 }}>
        <thead><tr><th>막힘이 이어진 순서</th>{r.path.map((p) => <th key={p.label}>{p.label}</th>)}</tr></thead>
        <tbody><tr><th>상태</th>{r.path.map((p) => <td key={p.label} className={p.state === '막힘' ? 'bad' : ''}>{p.state}</td>)}</tr></tbody>
      </table>

      </>)}
      {on(3) && (<>
      <h2>3. 발생 이유</h2>
      <ul>{r.reasons.map((t, i) => <li key={i}>{t}</li>)}</ul>
      {r.excluded.length > 0 && (<><p style={{ marginTop: 4 }}>따져 보고 제외한 다른 가능성</p><ul>{r.excluded.map((t, i) => <li key={i}>{t}</li>)}</ul></>)}

      </>)}
      {on(4) && (<>
      <h2>4. 영향</h2>
      <table>
        <thead><tr><th>항목</th><th>작성 시각 기준</th><th>평소</th></tr></thead>
        <tbody>{r.impacts.map((x) => <tr key={x.k}><th>{x.k}</th><td>{x.now}</td><td>{x.usual}</td></tr>)}</tbody>
      </table>
      <p style={{ marginTop: 6 }}>{r.impactNote}</p>

      </>)}
      {on(5) && (<>
      <h2>5. 대응 처리</h2>
      <table>
        <tbody>
          <tr><th style={{ width: 92 }}>운영 기준</th><td className="l">{r.response.policy}</td></tr>
          <tr><th>대응안</th><td className="l">{r.response.plan}</td></tr>
          <tr><th>방식·물량</th><td className="l">{r.response.type} · {r.response.volume}</td></tr>
          <tr><th>협의 대상</th><td className="l">{r.response.parties.join(', ')}</td></tr>
          <tr><th>제약</th><td className="l">{r.response.constraints.join(' / ') || '-'}</td></tr>
          <tr><th>처리 상태</th><td className="l">{r.response.decision}</td></tr>
        </tbody>
      </table>
      {r.history.length > 0 && <ul style={{ marginTop: 6 }}>{r.history.map((h, i) => <li key={i}>{h.at} 담당자 · {h.text}</li>)}</ul>}

      </>)}
      {on(6) && (<>
      <h2>6. 대응 효과(예측)</h2>
      {r.effects.length > 0 ? (
        <table>
          <thead><tr><th>항목</th><th>조치 안 함</th><th>조치 후</th><th>변화</th></tr></thead>
          <tbody>{r.effects.map((x) => <tr key={x.k}><th>{x.k}</th><td>{x.a}</td><td>{x.b}</td><td>{x.c}</td></tr>)}</tbody>
        </table>
      ) : <p>계산 중입니다.</p>}

      </>)}
      {on(7) && (<>
      <h2>7. 사후 확인 (실행 뒤 기록)</h2>
      <table>
        <tbody className="blank">
          <tr><th style={{ width: 150 }}>대응 실행 시각</th><td>{r.after.execAt}</td></tr>
          <tr><th>병목 해소 시각</th><td>{r.after.doneAt}</td></tr>
          <tr><th>실제 대기 차량 최고치</th><td>{r.after.peak}</td></tr>
          <tr><th>예측과 다른 점·비고</th><td>{r.after.note}</td></tr>
        </tbody>
      </table>
      <p className="note">이 기록은 병목이 생긴 장소·시각·지속시간·이유·영향·대응을 남겨, 같은 상황이 다시 생겼을 때 사후 판단에 쓰기 위한 것이다.</p>
      </>)}
      {page && <div className="pg-no">{page}</div>}
    </div>
  );
}

const docHtml = (r: ReportRecord, word = false) => {
  const body = renderToStaticMarkup(<Doc r={r} />);
  const head = word
    ? '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
    : '<html>';
  return `<!doctype html>${head}<head><meta charset="utf-8"><title>${r.docNo}</title><style>@page{size:A4;margin:14mm}body{margin:0}${DOC_CSS}</style></head><body>${body}</body></html>`;
};

function save(name: string, mime: string, body: string | Blob) {
  const blob = typeof body === 'string' ? new Blob(['﻿', body], { type: `${mime};charset=utf-8` }) : body;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 숨은 프레임에 보고서만 넣고 인쇄 창을 연다(인쇄 대상에서 'PDF로 저장'을 고른다)
function printPdf(r: ReportRecord) {
  const fr = document.createElement('iframe');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(fr);
  fr.srcdoc = docHtml(r);
  fr.onload = () => { fr.contentWindow?.focus(); fr.contentWindow?.print(); setTimeout(() => fr.remove(), 60000); };
}

type Item = { id: string; group: '사진' | '수치'; label: string; file: string; build: () => Promise<ZipFile> };
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map((x) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x)).join(',')).join('\r\n');
const utf8 = (t: string) => new TextEncoder().encode('\ufeff' + t);

// 병목을 알아볼 수 있는 자료를 골라서 내려받는다(고른 것만 ZIP 한 파일로 묶는다)
function DataPick({ r }: { r: ReportRecord }) {
  const { data, st } = useView();
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const tid = r.terminal;
  const items = useMemo<Item[]>(() => {
    const views = camViews(data, tid, st.gates[`g_${tid}`]?.queue ?? 0);
    const photos: Item[] = views.map((v, i) => ({
      id: `img${i}`, group: '사진', label: `CCTV 히트맵 · ${v.label} (${v.pct}%)`, file: `${i + 1}_${v.label}.png`,
      build: async () => ({ name: `사진/${i + 1}_${v.label}.png`, data: await renderCamPng(v, tid, st.asOf) }),
    }));
    const nums: Item[] = [
      { id: 'gate', group: '수치', label: '시간대별 게이트 대기·TAT·처리량 (최근 24시간)', file: '시간대별_게이트.csv', build: async () => ({ name: '수치/시간대별_게이트.csv', data: utf8(csv([['시각', '대기 차량(대)', 'TAT(분)', '처리량(대/시)', '상태'], ...[...data.hours].sort((a, b) => a - b).map((h) => { const s = data.states[h]; const g = s?.gates[`g_${tid}`]; return [s?.asOf ?? '', g?.queue ?? '', g?.tat ?? '', g?.thr ?? '', g?.state ?? '']; })])) }) },
      { id: 'zone', group: '수치', label: '구역별 혼잡도·판정', file: '구역별_혼잡도.csv', build: async () => ({ name: '수치/구역별_혼잡도.csv', data: utf8(csv([['구역', '혼잡도(%)', '판정'], ...r.zones.map((z) => [z.label, z.pct, z.state])])) }) },
      { id: 'occ', group: '수치', label: `${tid} 블록별 장치율`, file: '블록별_장치율.csv', build: async () => ({ name: '수치/블록별_장치율.csv', data: utf8(csv([['블록', '장치율(%)'], ...(data.layout.terminals.find((t) => t.id === tid)?.blocks ?? []).filter((b) => !b.temp).map((b) => [b.id, Math.round((st.occ[b.id] ?? 0) * 100)])])) }) },
      { id: 'json', group: '수치', label: '병목 기록 보고서 데이터', file: '병목기록.json', build: async () => ({ name: '수치/병목기록.json', data: new TextEncoder().encode(JSON.stringify(r, null, 2)) }) },
    ];
    return [...photos, ...nums];
  }, [data, st, tid, r]);
  const picked = items.filter((i) => sel[i.id]);
  const all = picked.length === items.length;
  const download = async () => {
    if (!picked.length) return;
    setBusy(true);
    try {
      const files = await Promise.all(picked.map((i) => i.build()));
      save(`병목자료_${tid}_${r.writtenAt.slice(0, 10).replace(/-/g, '')}.zip`, 'application/zip', makeZip(files));
    } finally { setBusy(false); }
  };
  const row = (i: Item) => (
    <li key={i.id}>
      <label className={sel[i.id] ? 'is-on' : ''}>
        <input type="checkbox" checked={!!sel[i.id]} onChange={(e) => setSel({ ...sel, [i.id]: e.target.checked })} />
        <span className={`dl-ico ${i.group === '사진' ? 'img' : 'tbl'}`} aria-hidden="true">{i.file.split('.').pop()?.toUpperCase()}</span>
        <span className="dl-name"><b>{i.label}</b><small>{i.file}</small></span>
      </label>
    </li>
  );
  return (
    <section className="dl-box" aria-label="관제 데이터 다운로드">
      <div className="dl-head">
        <span>다운로드할 자료를 선택하십시오. 고른 자료는 ZIP 한 파일로 저장됩니다.</span>
        <button type="button" onClick={() => setSel(all ? {} : Object.fromEntries(items.map((i) => [i.id, true])))}>{all ? '전체 해제' : '전체 선택'}</button>
      </div>
      <div className="dl-list">
        <h4>CCTV 사진</h4>
        <ul>{items.filter((i) => i.group === '사진').map(row)}</ul>
        <h4>수치 자료</h4>
        <ul>{items.filter((i) => i.group === '수치').map(row)}</ul>
      </div>
      <div className="dl-foot">
        <span>{picked.length ? `${picked.length}개 선택됨` : '선택한 자료 없음'}</span>
        <button type="button" className="dl-cancel" onClick={() => useUI.getState().set({ dataOpen: false })}>취소</button>
        <button type="button" className="dl-go" disabled={!picked.length || busy} onClick={download}>{busy ? '만드는 중' : '다운로드'}</button>
      </div>
    </section>
  );
}

// 보고서 내용(보고서 창과 데이터 창이 함께 쓴다)
function useReportRecord(open: boolean): ReportRecord | null {
  const set = useUI((s) => s.set);
  const policy = useUI((s) => s.policy);
  const simCand = useUI((s) => s.simCand);
  const decision = useUI((s) => s.decision);
  const history = useUI((s) => s.history);
  const acted = useUI((s) => s.acted);
  const ended = useUI((s) => s.ended);
  const { data, st } = useView();
  const [res, setRes] = useState<PolicyResult | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    requestPolicy(policy, data, st.asOf).then((r) => live && setRes(r)).catch(() => undefined);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && set({ reportOpen: false, dataOpen: false });
    window.addEventListener('keydown', onKey);
    return () => { live = false; window.removeEventListener('keydown', onKey); };
  }, [open, policy, data, st.asOf, set]);
  return useMemo(() => {
    if (!open) return null;
    const c = data.cands.candidates.find((x) => x.id === simCand);
    const action = !c || c.id === data.action.id ? data.action : { ...data.action, id: c.id, type: c.type, title: c.label, volume: { value: c.volume, unit: 'TEU' }, constraints: c.constraints, parties: c.parties };
    const pol = POLICIES.find((x) => x.id === policy)?.label ?? '';
    return buildReport(data, st, { policyLabel: pol, res: res && res.policy === policy ? res : null, candId: simCand, action, decision, history, executed: !!acted[data.diagnosis.alert], ended: !!ended[data.diagnosis.alert] });
  }, [open, data, st, res, policy, simCand, decision, history, acted, ended]);
}

// 기록서 창: 병목 상황 기록 보고서(미리보기·PDF·Word)
export function ReportModal() {
  const open = useUI((s) => s.reportOpen);
  const set = useUI((s) => s.set);
  const r = useReportRecord(open);
  if (!open || !r) return null;
  const stem = `병목기록보고서_${r.terminal}_${r.writtenAt.slice(0, 10).replace(/-/g, '')}`;
  return (
    <div className="rep-overlay" onMouseDown={(e) => e.target === e.currentTarget && set({ reportOpen: false })}>
      <div className="rep-bar" role="toolbar" aria-label="보고서 내보내기">
        <b>병목 상황 기록 보고서</b>
        <span className="rep-sp" />
        <button type="button" onClick={() => printPdf(r)}>PDF 저장</button>
        <button type="button" onClick={() => save(`${stem}.doc`, 'application/msword', docHtml(r, true))}>Word 저장</button>
        <button type="button" onClick={() => save(`${stem}.json`, 'application/json', JSON.stringify(r, null, 2))}>데이터(JSON)</button>
        <button type="button" className="rep-x" onClick={() => set({ reportOpen: false })} aria-label="닫기">✕</button>
      </div>
      <div className="rep-scroll"><style>{DOC_CSS}</style>{PAGES.map((_, i) => <Doc key={i} r={r} page={i + 1} />)}</div>
    </div>
  );
}

// 데이터 창: 관제 화면 위에 뜨는 대화상자. 관제 데이터(CCTV 사진·수치 자료)를 골라 내려받는다
export function DataModal() {
  const open = useUI((s) => s.dataOpen);
  const set = useUI((s) => s.set);
  const r = useReportRecord(open);
  if (!open || !r) return null;
  return (
    <div className="dl-overlay" onMouseDown={(e) => e.target === e.currentTarget && set({ dataOpen: false })}>
      <div className="dl-dialog" role="dialog" aria-modal="true" aria-label="관제 데이터 다운로드">
        <header>
          <b>관제 데이터 다운로드</b>
          <button type="button" onClick={() => set({ dataOpen: false })} aria-label="닫기">✕</button>
        </header>
        <DataPick r={r} />
      </div>
    </div>
  );
}
