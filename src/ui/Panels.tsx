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
    <button type="button" className="ap-home" aria-label="메인 화면으로" onClick={() => { set({ decision: null, policyPicked: false }); go(1); }}>
      <svg viewBox="0 0 64 64" width="26" height="26" aria-hidden="true">
        <path d="M32 12 10 31h7v19h11V38h8v12h11V31h7L40 22v-7h-5v3z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <span>HOME</span>
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
  const go = useUI((s) => s.go);
  const a = useActiveAction();
  const [sent, setSent] = useState<Record<number, boolean>>({}); // 보낸 절차
  const [pick, setPick] = useState<Record<number, boolean>>({}); // 체크한 절차
  const [log, setLog] = useState<{ at: string; text: string }[]>([]); // 보낸 내용(표 아래에 쌓인다)
  const now = () => new Date().toTimeString().slice(0, 5);

  // 승인 뒤 이어지는 절차: 협의·통보 대상마다 한 줄, 마지막에 대응 실행. 상태 칸의 체크로 보낼 절차를 고른다
  const steps = [
    { who: '관제 담당', what: '대응 승인' },
    ...a.parties.map((who) => ({ who, what: who.includes('운영사') ? '협의 요청' : '통보' })),
    { who: '현장 운영', what: '대응 실행' },
  ];
  const open = steps.map((_, i) => i).filter((i) => i > 0 && !sent[i]); // 아직 보내지 않은 절차
  const picked = open.filter((i) => pick[i]);
  const allOn = open.length > 0 && picked.length === open.length;
  const toggleAll = () => setPick(allOn ? {} : Object.fromEntries(open.map((i) => [i, true])));
  const sendPicked = () => {
    if (!picked.length) return;
    setSent({ ...sent, ...Object.fromEntries(picked.map((i) => [i, true])) });
    setPick({});
    const at = new Date().toTimeString().slice(0, 8);
    const said = (i: number) => (steps[i].what === '협의 요청' ? `${steps[i].who}에 협의를 요청했습니다.` : steps[i].what === '통보' ? `${steps[i].who}에 통보했습니다.` : `${steps[i].who}에 대응 실행을 전달했습니다.`);
    setLog([...picked.map((i) => ({ at, text: said(i) })).reverse(), ...log]);
    set({ history: [{ at: now(), text: `${allOn ? '전체' : '선택'} 보내기 · ${picked.map((i) => steps[i].who).join(', ')}` }, ...history] });
  };
  const approve = () => set({ decision: 'approved', acted: { ...useUI.getState().acted, [data.diagnosis.alert]: Date.now() }, history: [{ at: now(), text: `승인 · ${a.title} ${a.volume.value.toLocaleString()} ${a.volume.unit}` }, ...history] });

  return (
    <div className="card pn">
      <div className="pn-head"><h2>승인</h2></div>

      {decision !== 'approved' && (
        <div className="ap-confirm" role="alertdialog" aria-label="승인 동의">
          <p>승인하는 것에 동의하십니까?</p>
          <div className="ap-confirm-btns">
            <button type="button" className="btn btn-primary" onClick={approve}>동의</button>
            <button type="button" className="btn btn-ghost" onClick={() => go(3)}>취소</button>
          </div>
        </div>
      )}
      {decision === 'approved' && (
        <section className="ap-steps" aria-label="승인 뒤 절차">
          <p className="ap-done">승인 처리 완료 · 아래 절차에 따라 대응을 실행합니다</p>
          <table>
            <thead>
              <tr>
                <th>순서</th><th>절차</th><th>대상</th>
                <th className="st"><label><input type="checkbox" checked={allOn} disabled={!open.length} onChange={toggleAll} />전체 선택</label></th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s, i) => (
                <tr key={i}>
                  <th scope="row">{i + 1}</th><td>{s.what}</td><td>{s.who}</td>
                  <td className={`st ${i === 0 || sent[i] ? 'ok' : ''}`}>
                    {i === 0 ? <span>완료</span> : sent[i] ? <span>보냄</span> : (
                      <label><input type="checkbox" checked={!!pick[i]} onChange={(e) => setPick({ ...pick, [i]: e.target.checked })} />대기</label>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-primary ap-sendall" disabled={!picked.length} onClick={sendPicked}>
            {!open.length ? '전체 보내기 완료' : allOn ? '전체 보내기' : picked.length ? `선택 보내기 (${picked.length})` : '보낼 절차를 선택하세요'}
          </button>
          {log.length > 0 && (
            <ul className="ap-log" aria-label="전달 내역" aria-live="polite">
              {log.map((l, k) => <li key={k}><time>{l.at}</time>{l.text}<b>전달 완료</b></li>)}
            </ul>
          )}
        </section>
      )}
      {/* 전부 보내고 나면 가운데에 HOME 버튼이 나온다 */}
      {decision === 'approved' && !open.length && (
        <div className="ap-foot">
          <HomeIcon />
        </div>
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
