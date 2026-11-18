import { useEffect, useState } from 'react';
import { useUI } from '../store';
import { useView } from '../view';
import { POLICIES, requestPolicy, type PolicyId, type PolicyResult } from '../data/policy';

type Row = { id: PolicyId; label: string; plan: string; wait: string; cost: string; miss: string };
const n = (v: number) => v.toLocaleString();

// 세 가지 운영 기준을 각각 돌린 결과 중 1위 대응안을 한 표로 모은다
function useCompare(on: boolean) {
  const { data, st } = useView();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [base, setBase] = useState<Row | null>(null);
  useEffect(() => {
    if (!on || rows) return;
    let live = true;
    Promise.all(POLICIES.map((p) => requestPolicy(p.id, data, st.asOf))).then((rs: PolicyResult[]) => {
      if (!live) return;
      const b = rs[0].candidates.find((x) => x.id === 'BASE');
      if (b) {
        const h0 = Math.max(1, rs[0].horizon.minutes / 60);
        setBase({ id: 'min_wait', label: '조치 안 함', plan: '별도 조치 없이 지켜봄', wait: b.metrics.wait.value === null ? '-' : `${Math.round(b.metrics.wait.value / h0)}대`, cost: b.metrics.cost.value === null ? '-' : `${n(b.metrics.cost.value)}만 원`, miss: b.metrics.cutoffMiss.value === null ? '-' : `${n(b.metrics.cutoffMiss.value)} TEU` });
      }
      setRows(rs.map((r, i) => {
        const top = r.recommended ?? r.ranking.find((id) => r.candidates.find((c) => c.id === id)?.feasible !== 'no') ?? 'BASE';
        const c = r.candidates.find((x) => x.id === top)!;
        const h = Math.max(1, r.horizon.minutes / 60);
        const m = c.metrics;
        return {
          id: POLICIES[i].id,
          label: POLICIES[i].label,
          plan: c.label,
          wait: m.wait.value === null ? '-' : `${Math.round(m.wait.value / h)}대`,
          cost: m.cost.value === null ? '-' : `${n(m.cost.value)}만 원`,
          miss: m.cutoffMiss.value === null ? '-' : `${n(m.cutoffMiss.value)} TEU`,
        };
      }));
    }).catch(() => { /* 계산 실패 시 표는 비어 있다 */ });
    return () => { live = false; };
  }, [on, rows, data, st.asOf]);
  return { rows, base };
}

// 대응 화면에 들어오면 가운데에 운영 기준 선택창이 뜬다. 기준 3가지 중 하나를 고르면 그 기준의 대응안으로 넘어간다.
export function PolicyFolder() {
  const step = useUI((s) => s.step);
  const picked = useUI((s) => s.policyPicked);
  const set = useUI((s) => s.set);
  const go = useUI((s) => s.go);
  const [sel, setSel] = useState<PolicyId | null>(null);
  const [cmp, setCmp] = useState(false);
  const { rows, base } = useCompare(cmp);
  if (step !== 3 || picked) return null;
  const pick = (id: PolicyId) => set({ policy: id, policyPicked: true, simT: 0, playing: true, simMode: 'after' });
  return (
    <div className="fo-overlay" role="dialog" aria-modal="true" aria-label="운영 기준 선택">
      <button className="fo-x" onClick={() => go(2)} aria-label="진단으로 돌아가기">✕</button>
      <section className="po-panel">
        <h2>운영 기준 선택</h2>
        <div className="po-list" role="radiogroup" aria-label="운영 기준">
          {POLICIES.map((p, i) => {
            const on = sel === p.id;
            return (
              <button key={p.id} type="button" role="radio" aria-checked={on} className={`po-opt ${on ? 'is-on' : ''}`} onClick={() => setSel(p.id)} onDoubleClick={() => pick(p.id)}>
                <span className="po-no">기준 {i + 1}</span>
                <span className="po-radio" aria-hidden="true" />
                <b>{p.label}</b>
                <span className="po-desc">{p.desc}</span>
              </button>
            );
          })}
        </div>
        <div className="po-foot">
          <button type="button" className="po-cmp" onClick={() => setCmp(true)}>3가지 한눈에 비교</button>
          <button type="button" className="po-go" disabled={!sel} onClick={() => sel && pick(sel)}>{sel ? '선택한 기준으로 진행' : '기준을 선택하십시오'}</button>
        </div>
      </section>
      {cmp && (
        <div className="fo-cmp-wrap" onClick={() => setCmp(false)}>
          <section className="fo-cmp" onClick={(e) => e.stopPropagation()} aria-label="운영 기준 3가지 비교">
            <h3>운영 기준 3가지 비교<button type="button" onClick={() => setCmp(false)} aria-label="닫기">✕</button></h3>
            <table>
              <thead><tr><th>운영 기준</th><th>선택되는 대응</th><th>게이트 앞 대기 차량(평균)</th><th>총 추가비용</th><th>마감을 놓치는 물량</th><th /></tr></thead>
              <tbody>
                {!rows && <tr><td colSpan={6} className="wait">계산 중입니다.</td></tr>}
                {base && <tr className="base"><th scope="row">{base.label}</th><td className="left">{base.plan}</td><td>{base.wait}</td><td>{base.cost}</td><td>{base.miss}</td><td /></tr>}
                {rows?.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.label}</th>
                    <td className="left">{r.plan}</td>
                    <td>{r.wait}</td><td>{r.cost}</td><td>{r.miss}</td>
                    <td><button type="button" onClick={() => { setCmp(false); setSel(r.id); }}>선택</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
