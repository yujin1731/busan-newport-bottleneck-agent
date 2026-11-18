import { useEffect, useRef, useState } from 'react';
import { useUI } from '../store';
import { useView } from '../view';
import { Icon } from './Icon';
import { ManualBook } from './ManualBook';
import { SummaryCard } from './SummaryCard';
import { ResponseCard } from './ResponseCard';
import { POLICIES, requestPolicy, type PolicyResult } from '../data/policy';

export function Panel() {
  const step = useUI((s) => s.step);
  // S1은 오른쪽 열(RightRail)이 통째로 넣었다 뺀다
  // 승인은 대응 화면 위에 가운데 팝업으로 띄운다
  if (step === 4) return <ApproveModal />;
  return (
    <aside className={`panel ${step === 2 || step === 3 ? 'panel-book' : ''}`} aria-live="polite">
      {step === 1 && <S1 />}
      {step === 2 && <S2 />}
      {step === 3 && <S3 />}
    </aside>
  );
}

// 승인 창 오른쪽 아래: 관제 첫 화면으로 돌아가는 집 모양 버튼
function HomeIcon() {
  const set = useUI((s) => s.set);
  const go = useUI((s) => s.go);
  return (
    <button type="button" className="ap-homeico" aria-label="메인 화면으로" title="메인 화면으로" onClick={() => { set({ decision: null, policyPicked: false }); go(1); }}>
      <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
        <circle cx="32" cy="32" r="30" fill="#12304f" stroke="#fff" strokeWidth="2" />
        <path d="M32 14 12 31h6v17h10V38h8v10h10V31h6L40 22v-6h-5v2.2z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        <rect x="29" y="38" width="6" height="10" fill="#12304f" />
      </svg>
    </button>
  );
}

function ApproveModal() {
  const go = useUI((s) => s.go);
  const decision = useUI((s) => s.decision);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && go(3);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);
  return (
    <div className="rm-overlay" onMouseDown={(e) => e.target === e.currentTarget && decision !== 'approved' && go(3)}>
      <section className="rm ap card" role="dialog" aria-modal="true" aria-label="승인">
        <button ref={closeRef} className="rm-close ap-close" onClick={() => go(3)} aria-label="닫기"><Icon name="x" size={18} /></button>
        <S4 />
        <HomeIcon />
      </section>
    </div>
  );
}

function Sev({ s }: { s: '심각' | '주의' }) {
  return <span className={`sev ${s === '심각' ? 'sev-jam' : 'sev-warn'}`}><Icon name={s === '심각' ? 'alert' : 'ring'} size={13} />{s}</span>;
}

/* ---------- S1 항만 전체 관제 ---------- */
function S1() {
  const { data, st } = useView();
  const go = useUI((s) => s.go);
  const set = useUI((s) => s.set);
  const focus = useUI((s) => s.focus);
  const rank = (s: string) => (s === '심각' ? 0 : 1);
  // 심각 → 오래된 것 순
  const live = data.alerts
    .filter((a) => st.gates[a.node].state !== 'ok')
    .sort((x, y) => rank(x.severity) - rank(y.severity) || x.since.localeCompare(y.since));
  const nJam = live.filter((a) => a.severity === '심각').length;
  const t = focus !== 'port' ? data.layout.terminals.find((x) => x.id === focus) : null;
  return (
    <div className="card pn pn-alerts">
      <div className="pn-head">
        <h2>경보 목록</h2>
        <span className="head-num" aria-label={`경보 ${live.length}건, 심각 ${nJam}건`}>{live.length}<small>건</small></span>
      </div>
      {live.length === 0 && (
        <div className="empty-ok" role="status">
          <Icon name="check" size={16} />
          <span><b>경보 없음</b>모든 게이트가 평소 범위다 · {st.asOf.slice(11)} 기준</span>
        </div>
      )}
      <ul className="alerts" aria-label="경보 목록">
        {live.map((a) => {
          return (
            <li key={a.id} className={`alert ${a.severity === '심각' ? 'is-jam' : 'is-warn'} ${focus === a.terminal ? 'is-focus' : ''}`} aria-label={`${a.severity} 경보, ${a.title}`}>
              <div className="alert-top">
                <Sev s={a.severity} />
                <span className="alert-time" title={`${a.since}부터`}>{a.duration}째</span>
              </div>
              <div className="alert-title" title={a.title}>{a.title}</div>
              {a.diagnosis
                ? <div className="ar-actions"><button className="btn btn-primary btn-sm" onClick={() => go(2)}>진단 <Icon name="arrow" size={14} /></button></div>
                : <>
                    <div className="ar-actions"><button className="btn btn-ghost btn-sm" onClick={() => set({ focus: a.terminal })}>위치 보기</button></div>
                  </>}
            </li>
          );
        })}
      </ul>
      {t && (
        <section className="pn-sec">
          <h3>선택 구역</h3>
          <div className="sel">
            <strong>{t.name}</strong>
            <span>대기 {st.gates[`g_${t.id}`].queue}대 · TAT {st.gates[`g_${t.id}`].tat}분</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => set({ focus: 'port' })}>전체 보기</button>
        </section>
      )}
    </div>
  );
}

/* ---------- S2 병목 진단 ---------- */
function S2() {
  // 처음에는 요약(표), 위의 탭으로 설명서(책)를 고른다. 대응안으로 가는 길은 책의 마지막 쪽에 있다.
  const view = useUI((s) => s.diagView);
  return view === 'summary' ? <SummaryCard /> : <ManualBook />;
}


/* ---------- 결과 숫자 4칸 (승인 팝업) ---------- */
/* ---------- S3 대응 시뮬레이션 ---------- */
function S3() {
  const { data, st } = useView();
  const set = useUI((s) => s.set);
  const policy = useUI((s) => s.policy);
  const simCand = useUI((s) => s.simCand);
  const [res, setRes] = useState<PolicyResult | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current; // 마지막 선택의 응답만 반영
    const w = window as unknown as { __policyTest?: { delay?: Record<string, number>; fail?: boolean } };
    requestPolicy(policy, data, st.asOf, { delayMs: w.__policyTest?.delay?.[policy], fail: w.__policyTest?.fail })
      .then((r) => {
        if (my !== seq.current) return;
        setRes(r);
        // 기준 1위(실행 가능·조건부 포함) 후보의 시뮬레이션을 처음부터 재생
        const top = r.recommended ?? r.ranking.find((id) => r.candidates.find((c) => c.id === id)?.feasible !== 'no') ?? 'BASE';
        set({ simCand: top, simT: 0, playing: true, simMode: 'after' });
      })
      .catch(() => { /* 계산 실패 시 표는 '계산 중'으로 남는다. 기준을 다시 고르면 다시 요청한다 */ });
  }, [policy, data, st.asOf, set]);
  const shown = res && res.policy === policy ? res : null;
  // 대응 화면은 글 없이 표 두 개(해결 방안 / 효과)로 보여 준다. LLM 문장은 쓰지 않는다.
  const picked = useUI((s) => s.policyPicked);
  if (!picked) return null;
  const pol = POLICIES.find((x) => x.id === policy)!;
  return <ResponseCard res={shown} candId={simCand} policyLabel={pol.label} />;
}

/* ---------- S4 승인 ---------- */

function S4() {
  const { data } = useView();
  const set = useUI((s) => s.set);
  const decision = useUI((s) => s.decision);
  const history = useUI((s) => s.history);
  const simCand = useUI((s) => s.simCand);
  const a = useActiveAction();
  const now = () => new Date().toTimeString().slice(0, 5);

  // 승인 창의 중심: 우리가 무엇을 할 것인가를 한 문장으로
  const kind = data.cands.candidates.find((c) => c.id === simCand)?.kind;
  const [from, to] = a.title.split(' → ');
  const detail = /\((.+?)\)/.exec(a.title)?.[1] ?? '';
  const vol = `${a.volume.value.toLocaleString()} ${a.volume.unit}`;
  const doing: React.ReactNode = kind === 'transfer' && to
    ? <>{from}물 <b>{vol}</b>를<br /><b>{to}</b>로 옮긴다.</>
    : kind === 'reschedule'
      ? <>DGT 반입 예약 <b>{vol}</b>를<br /><b>{detail || '나중 시간으로'}</b> 미룬다.</>
      : kind === 'rehandle'
        ? <>DGT 야드 안에서 <b>{vol}</b>를<br /><b>재정리</b>한다.</>
        : <><b>{a.title}</b>를 실행한다.</>;

  const approve = () => set({ decision: 'approved', acted: { ...useUI.getState().acted, [data.diagnosis.alert]: Date.now() }, history: [{ at: now(), text: `승인 · ${a.title} ${vol}` }, ...history] });
  const undo = () => set({ decision: null, history: [{ at: now(), text: '승인 취소' }, ...history] });

  return (
    <div className="card pn">
      <div className="pn-head"><h2>승인</h2></div>

      <p className="ap-why"><span>문제</span>DGT 수출 블록 포화 → 게이트 대기열 → 배후도로 넘침</p>
      <section className="ap-do" aria-label="승인할 대응">
        <span className="ap-do-k">이번 대응</span>
        <p>{doing}</p>
      </section>

      {decision !== 'approved' ? (
        <div className="decide">
          <button className="btn btn-primary" onClick={approve}><Icon name="check" size={15} />승인</button>
        </div>
      ) : (
        <section className="pn-sec">
          <p className="ap-done"><Icon name="check" size={16} />승인되었습니다. 이 대응을 실행합니다.</p>
          <button className="btn btn-ghost btn-block ap-undo" onClick={undo}>승인 취소</button>
        </section>
      )}

      {history.length > 0 && (
        <section className="pn-sec">
          <h3>이력</h3>
          <ul className="hist">{history.map((h, i) => <li key={i}><span className="muted">{h.at}</span>담당자 · {h.text}</li>)}</ul>
        </section>
      )}
    </div>
  );
}


/** 대응 화면에서 선택된 후보를 승인 칸·승인 팝업이 쓰는 대응안 모양으로 맞춘다 */
function useActiveAction() {
  const { data } = useView();
  const simCand = useUI((s) => s.simCand);
  const c = data.cands.candidates.find((x) => x.id === simCand);
  if (!c || c.id === data.action.id) return data.action;
  return { ...data.action, id: c.id, type: c.type, title: c.label, volume: { value: c.volume, unit: 'TEU' }, constraints: c.constraints, parties: c.parties };
}
