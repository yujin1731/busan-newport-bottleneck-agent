import { useEffect, useRef, useState } from 'react';
import { useUI } from '../store';
import { useView } from '../view';
import { Icon } from './Icon';
import { fmt, sign } from './bits';
import type { ResultItem } from '../data/types';
import { SimControls } from './Chrome';
import { POLICIES, requestPolicy, type PolicyId, type PolicyResult, type Metric } from '../data/policy';

export function Panel() {
  const step = useUI((s) => s.step);
  // S1은 오른쪽 열(RightRail)이 통째로 넣었다 뺀다
  // 승인은 대응 화면 위에 가운데 팝업으로 띄운다
  if (step === 4) return <><aside className="panel" aria-hidden="true"><S3 /></aside><ApproveModal /></>;
  return (
    <aside className="panel" aria-live="polite">
      {step === 1 && <S1 />}
      {step === 2 && <S2 />}
      {step === 3 && <S3 />}
    </aside>
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
  const { data } = useView();
  const go = useUI((s) => s.go);
  const d = data.diagnosis;
  const a = data.alerts.find((x) => x.id === d.alert)!;
  const term = d.cause.blocks[0].split('-')[0];
  return (
    <>
    <div className="card pn">
      <div className="pn-head">
        <Sev s={a.severity} />
        <span className="muted">{a.since}부터 · {a.duration}</span>
      </div>
      <h2 className="pn-title">{a.title}</h2>

      {/* 핵심 숫자 블록: 터미널 내 상황(블록 장치율) */}
      <div className="hero hero-red">
        <span className="hero-k"><Icon name="pin" size={13} />{term} 내 상황 · {d.cause.label.replace(term + ' ', '')}</span>
        <b className="hero-v">{d.evidence.find((e) => e.id === 'occ')?.value ?? ''}<small>%</small></b>
        <span className="hero-chip">장치율 포화</span>
      </div>

      {/* 요약을 먼저: 화면이 낮아도 잘리지 않게 */}
      <p className="ai"><span className="ai-tag">요약</span>{d.summary}</p>

    </div>
    <div className="card pn-foot">
      <button className="btn btn-primary btn-block" onClick={() => go(3)}>대응안 보기 <Icon name="arrow" size={15} /></button>
    </div>
    </>
  );
}


/* ---------- 결과 숫자 4칸 (승인 팝업) ---------- */
function ResultGrid() {
  const { data } = useView();
  const show = (r: ResultItem) => {
    if (r.id === 'ship') return <>{r.from}<small>%</small><Icon name="arrow" size={13} className="ri-arrow" />{r.value}<small>%</small></>;
    if (r.id === 'shift') return <>+{r.value}<small>{r.unit}</small></>;
    if (r.id === 'cost') return <>+{fmt(r.value)}<small>{r.unit}</small></>;
    return <>{sign(r.value)}<small>{r.unit}</small></>;
  };
  return (
    <div className="res res-compact">
      {data.result.items.map((r) => (
        <div key={r.id} className={`res-cell ${r.good ? 'is-good' : 'is-cost'}`}>
          <div className="res-k">{r.label}</div>
          <div className="res-v">{show(r)}</div>
        </div>
      ))}
    </div>
  );
}

function Constraint({ ok }: { ok: boolean | null }) {
  return <span className={`ck ${ok === true ? 'ck-ok' : ok === false ? 'ck-no' : 'ck-wait'}`}><Icon name={ok === true ? 'check' : ok === false ? 'x' : 'wait'} size={14} /></span>;
}

/* ---------- S3 대응 시뮬레이션 ---------- */
function S3() {
  const { data, moved, simMode, st } = useView();
  const go = useUI((s) => s.go);
  const set = useUI((s) => s.set);
  const policy = useUI((s) => s.policy);
  const simCand = useUI((s) => s.simCand);
  const a = useActiveAction();
  const [res, setRes] = useState<PolicyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current; // 마지막 선택의 응답만 반영
    setBusy(true); setErr(null);
    const w = window as unknown as { __policyTest?: { delay?: Record<string, number>; fail?: boolean } };
    requestPolicy(policy, data, st.asOf, { delayMs: w.__policyTest?.delay?.[policy], fail: w.__policyTest?.fail })
      .then((r) => {
        if (my !== seq.current) return;
        setRes(r); setBusy(false);
        // 기준 1위(실행 가능·조건부 포함) 후보의 시뮬레이션을 처음부터 재생
        const top = r.recommended ?? r.ranking.find((id) => r.candidates.find((c) => c.id === id)?.feasible !== 'no') ?? 'BASE';
        set({ simCand: top, simT: 0, playing: true, simMode: 'after' });
      })
      .catch((e) => { if (my === seq.current) { setErr(String(e.message || e)); setBusy(false); } });
  }, [policy, data, st.asOf, set]);
  const shown = res && res.policy === policy ? res : null;
  const cand = shown?.candidates.find((c) => c.id === simCand);
  const base = shown?.candidates.find((c) => c.id === 'BASE');
  const sim = data.cands.candidates.find((c) => c.id === simCand);
  const row = (k: 'wait' | 'cutoffMiss' | 'cost', label: string) => {
    const v = cand?.metrics[k], b0 = base?.metrics[k];
    const d = v?.value != null && b0?.value != null && cand?.id !== 'BASE' ? v.value - b0.value : null;
    return (
      <>
        <dt>{label}</dt>
        <dd className={d === null || d === 0 ? '' : d < 0 ? 'is-good' : 'is-bad'} title={v?.why}>
          {v ? fmtM(v) : '-'}{d !== null && d !== 0 && <small> {d > 0 ? '+' : ''}{Math.round(d * 10) / 10}</small>}
        </dd>
      </>
    );
  };
  return (
    <>
    <div className="card pn pol" aria-busy={busy}>
      <div className="seg pol-seg" role="radiogroup" aria-label="대응안 기준">
        {POLICIES.map((p) => (
          <button key={p.id} role="radio" aria-checked={policy === p.id} className={policy === p.id ? 'is-on' : ''} onClick={() => set({ policy: p.id as PolicyId })}>{p.label}</button>
        ))}
      </div>
      {busy && <span className="pol-busy" role="status">계산 중</span>}
      {err && <p className="pol-err" role="alert">{err} · 다시 선택하면 재요청한다</p>}
      {shown?.status === 'withheld' && <p className="pol-err">추천 보류 · {shown.statusNote}</p>}
      {/* 이동형 후보만 이동량 숫자 블록을 둔다. 나머지는 제목·지표로 충분하다(중복 제거) */}
      {sim?.kind === 'transfer' && (
        <div className={`hero ${simMode === 'after' ? 'hero-blue' : 'hero-gray'}`}>
          <span className="hero-k">{simMode === 'after' ? '이동' : '조치 안 함'} · 6시간</span>
          <b className="hero-v">{simMode === 'after' ? Math.round(moved) : 0}<small>/ {a.volume.value} {a.volume.unit}</small></b>
        </div>
      )}
      <h2 className="pn-title">{cand?.label ?? a.title}</h2>
      {cand && cand.feasible !== 'yes' && <p className="pol-cond">{cand.feasible === 'no' ? '실행 불가' : `승인 필요 · ${cand.approvals.join(', ')}`}</p>}
      {cand && (
        <dl className="pol-metrics">
          {row('wait', '전체 차량 대기')}
          {row('cutoffMiss', '선적 마감 미준수')}
          {row('cost', '총 추가비용')}
        </dl>
      )}
      <SimControls />
    </div>
    <div className="card pn-foot pn-approve">
      <h3>승인 전 확인 <span className="muted">{a.constraints.filter((c) => c.ok === true).length}/{a.constraints.length} 충족</span></h3>
      <ul className="cons">
        {a.constraints.map((c) => (
          <li key={c.label}><Constraint ok={c.ok} /><b>{c.label}</b></li>
        ))}
      </ul>
      <div className="pn-foot-btns">
        <button className="btn btn-primary" onClick={() => go(4)}>승인 요청 <Icon name="arrow" size={15} /></button>
      </div>
    </div>
    </>
  );
}

/* ---------- S4 승인 ---------- */
const REASONS = ['대상 야드 여유 부족', '비용 과다', '운영사 협의 불가', '다른 조치 우선'];

function S4() {
  const { data } = useView();
  const set = useUI((s) => s.set);
  const go = useUI((s) => s.go);
  const decision = useUI((s) => s.decision);
  const history = useUI((s) => s.history);
  const act = useActiveAction();
  const [parties, setParties] = useState<Record<string, boolean>>(() => Object.fromEntries(act.parties.map((p) => [p, true])));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const a = useActiveAction();
  const now = () => new Date().toTimeString().slice(0, 5);

  const pending = a.constraints.filter((c) => c.ok === null).length;
  const approve = () => set({ decision: 'approved', history: [{ at: now(), text: `승인 · ${a.type} ${a.volume.value} ${a.volume.unit}` }, ...history] });
  // 승인 취소: 협의 요청이 실제로 나가기 전(시연에서는 실행 대기 전)까지 되돌릴 수 있다
  const undo = () => set({ decision: null, history: [{ at: now(), text: '승인 취소 · 협의 요청 회수' }, ...history] });
  const hold = () => { set({ decision: null, history: [{ at: now(), text: '보류 · 대응 재검토' }, ...history] }); go(3); };
  const reject = () => {
    set({ decision: null, history: [{ at: now(), text: `반려 · ${reason}` }, ...history] });
    setRejecting(false);
    go(1);
  };

  return (
    <div className="card pn">
      <div className="pn-head"><h2>승인</h2></div>

      <dl className="sheet">
        <dt>문제</dt><dd>DGT 수출 블록 포화 → 게이트 대기열 → 배후도로 넘침</dd>
        <dt>대응</dt><dd>{a.title} · {a.volume.value} {a.volume.unit}</dd>
        <dt>제약</dt><dd className="sheet-warn">운영사 협의 필요</dd>
      </dl>

      {a.id === data.action.id && <ResultGrid />}

      {decision !== 'approved' ? (
        <>
          <section className="pn-sec">
            <h3>협의 대상</h3>
            <ul className="parties">
              {a.parties.map((p) => (
                <li key={p}>
                  <label><input type="checkbox" checked={parties[p]} onChange={(e) => setParties({ ...parties, [p]: e.target.checked })} />{p}</label>
                </li>
              ))}
            </ul>
          </section>
          {!rejecting ? (
            <>
            {pending > 0 && (
              <p className="ap-warn"><Icon name="wait" size={14} />협의 필요 {pending}건이 남은 상태로 승인한다. 승인 뒤 협의 요청이 나간다.</p>
            )}
            <div className="decide">
              <button className="btn btn-primary" onClick={approve} disabled={!Object.values(parties).some(Boolean)}><Icon name="check" size={15} />{pending > 0 ? `승인 (협의 ${pending}건 남음)` : '승인'}</button>
              <button className="btn btn-ghost" onClick={hold}>보류</button>
              <button className="btn btn-danger-ghost" onClick={() => setRejecting(true)}>반려</button>
            </div>
            </>
          ) : (
            <div className="reject">
              <label htmlFor="rr">반려 사유</label>
              <select id="rr" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">선택</option>
                {REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
              <div className="decide">
                <button className="btn btn-danger" disabled={!reason} onClick={reject}>반려 확정</button>
                <button className="btn btn-ghost" onClick={() => setRejecting(false)}>취소</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <section className="pn-sec">
          <h3>진행</h3>
          <ol className="status">
            <li className="is-done"><Icon name="check" size={14} />승인됨</li>
            <li className="is-now"><Icon name="wait" size={14} />협의 요청 (시연) · {Object.entries(parties).filter(([, v]) => v).map(([k]) => k).join(', ')}</li>
            <li><Icon name="ring" size={14} />실행 대기</li>
          </ol>
          <p className="muted small">실제 공문은 발송되지 않는다.</p>
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

const fmtM = (m: Metric) => (m.value === null ? '산정 불가' : `${m.value.toLocaleString()} ${m.unit}`);

/** 대응 화면에서 선택된 후보를 승인 칸·승인 팝업이 쓰는 대응안 모양으로 맞춘다 */
function useActiveAction() {
  const { data } = useView();
  const simCand = useUI((s) => s.simCand);
  const c = data.cands.candidates.find((x) => x.id === simCand);
  if (!c || c.id === data.action.id) return data.action;
  return { ...data.action, id: c.id, type: c.type, title: c.label, volume: { value: c.volume, unit: 'TEU' }, constraints: c.constraints, parties: c.parties };
}
