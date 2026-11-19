import { useEffect, useState } from 'react';
import { useUI, type Step } from '../store';
import { useView } from '../view';
import { Icon } from './Icon';
import { endBottleneck } from '../data/bottleneck';

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: '관제' },
  { n: 2, label: '진단' },
  { n: 3, label: '대응' },
  { n: 4, label: '승인' },
];

// 실제 현재 시각(1초마다 갱신)
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(t); }, []);
  return now;
}
const p2 = (v: number) => String(v).padStart(2, '0');

export function TopBar() {
  const { step } = useView();
  const now = useNow();
  const go = useUI((s) => s.go);
  const maxReached = useUI((s) => s.maxStep);
  return (
    <header className="top">
      <div className="brand-group">
        <button className="logo-btn" onClick={() => go(1)} aria-label="관제 화면으로 이동"><img className="brand-logo" src="/port-j-logo.png" alt="" /></button>
        <button className="brand" onClick={() => go(1)} aria-label="Port-J, 관제 화면으로 이동">Port-J</button>
      </div>
      <nav className="tabs" aria-label="진행 단계">
        {STEPS.map((s) => (
          <button
            key={s.n}
            className={`tab ${step === s.n ? 'is-now' : ''} ${s.n < step ? 'is-done' : ''}`}
            disabled={s.n > maxReached}
            onClick={() => go(s.n)}
            aria-current={step === s.n ? 'step' : undefined}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="top-right">
        <div className="pill-info"><Icon name="history" size={15} />{p2(now.getMonth() + 1)}.{p2(now.getDate())} {p2(now.getHours())}:{p2(now.getMinutes())}:{p2(now.getSeconds())}</div>
      </div>
    </header>
  );
}

// 항만 현황(접이식): TAT와 장치율만. 선택한 터미널 기준(마우스로 연 CCTV 터미널 > 카드로 고른 구역 > 확대한 터미널), 없으면 항만 전체
const SAT = 85; // 포화선(%)
const TAT_ALERT = 10; // 평소보다 이만큼(분) 이상 늘면 탭에 점
export function useOv() {
  const { st, data } = useView();
  const peek = useUI((s) => s.peek);
  const zoneSel = useUI((s) => s.zoneSel);
  const focus = useUI((s) => s.focus);
  const real = (id: string | null | undefined) => (id && data.layout.terminals.some((t) => t.id === id) ? id : null);
  const tid = real(peek?.tid) ?? real(zoneSel?.tid) ?? real(focus);
  const body = (t: typeof data.layout.terminals[number]) => t.blocks.filter((b) => !b.temp);
  const occOf = (t: typeof data.layout.terminals[number]) => Math.round((body(t).reduce((s, b) => s + (st.occ[b.id] ?? 0), 0) / body(t).length) * 100);
  let tat: number, usual: number, occ: number;
  if (tid) {
    const t = data.layout.terminals.find((x) => x.id === tid)!;
    const past = data.hours.filter((h) => h < 0).map((h) => data.states[h]?.gates[`g_${tid}`]?.tat).filter((v): v is number => typeof v === 'number');
    tat = st.gates[`g_${tid}`]?.tat ?? 0;
    usual = past.length ? past.reduce((s, v) => s + v, 0) / past.length : tat;
    occ = occOf(t);
  } else {
    tat = st.kpi.tat.value; usual = st.kpi.tat.usual ?? st.kpi.tat.value;
    const ts = data.layout.terminals;
    occ = Math.round(ts.reduce((s, t) => s + occOf(t), 0) / ts.length);
  }
  const dTat = Math.round(tat - usual);
  return { name: tid ?? '전체', tat: Math.round(tat), dTat, occ, alert: occ >= SAT || dTat >= TAT_ALERT };
}

// 대응이 진행 중인 병목: 직접 STOP을 누르거나, 자동 종료를 켜 두면 정해진 시간 뒤 스스로 종료한다(시연에서는 시간을 줄여 둔다)
const AUTO_SEC = 8;
function DoingControls({ id }: { id: string }) {
  const auto = useUI((s) => s.autoEnd);
  const set = useUI((s) => s.set);
  const [left, setLeft] = useState(AUTO_SEC);
  useEffect(() => {
    if (!auto) { setLeft(AUTO_SEC); return; }
    const t = window.setInterval(() => setLeft((v) => v - 1), 1000);
    return () => window.clearInterval(t);
  }, [auto]);
  useEffect(() => { if (auto && left <= 0) endBottleneck(id); }, [auto, left, id]);
  return (
    <>
      <button type="button" role="switch" aria-checked={auto} className={`bn-auto ${auto ? 'is-on' : ''}`} onClick={() => set({ autoEnd: !auto })}>
        <i aria-hidden="true" />
        <span>{auto ? `자동 종료 ${Math.max(0, left)}초 전` : '자동 종료'}</span>
      </button>
      <button type="button" className="bn-stop" onClick={() => endBottleneck(id)}><i aria-hidden="true" />STOP</button>
    </>
  );
}

// 진행 중인 병목 목록: 동시에 여러 곳에서 병목이 생길 수 있어 한꺼번에 나열한다.
// 대응을 승인하면 '대응 진행 중'이 되고, STOP으로 직접 마치거나 시간이 지나 자동으로 '종료'가 된다.
export function OverviewCard() {
  const { step, data, st } = useView();
  const acted = useUI((s) => s.acted);
  const ended = useUI((s) => s.ended);
  if (step !== 1) return null;
  const rank = (s: string) => (s === '심각' ? 0 : 1);
  const list = data.alerts
    .filter((a) => st.gates[a.node].state !== 'ok')
    .sort((x, y) => Number(!!ended[x.id]) - Number(!!ended[y.id]) || rank(x.severity) - rank(y.severity) || x.since.localeCompare(y.since));
  const live = list.filter((a) => !ended[a.id]).length;
  return (
    <section className="ov-card bn" aria-label="진행 중인 병목">
      <div className="ov-head">
        <h2>진행 중인 병목</h2>
        <span className="head-num" aria-label={`${live}건`}>{live}<small>건</small></span>
      </div>
      {list.length === 0 && (
        <div className="bn-calm" role="status">
          <span className="bn-calm-mark"><Icon name="check" size={16} /></span>
          <div><b>정상 운영 중</b></div>
        </div>
      )}
      <ul className="bn-list">
        {list.map((a) => {
          const done = !!ended[a.id];
          const doing = !!acted[a.id] && !done;
          return (
            <li key={a.id} className={`bn-item ${done ? 'is-done' : a.severity === '심각' ? 'is-jam' : 'is-warn'}`}>
              <div className="bn-top">
                <span className="bn-sev">{done ? '종료' : a.severity}</span>
              </div>
              <div className="bn-title">{a.title}</div>
              <div className="bn-act">
                {done && <span className="bn-state"><Icon name="check" size={14} />혼잡도 정상화</span>}
                {doing && <DoingControls id={a.id} />}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// 병목 종료 알림: 패널 밑에 잠깐 떴다가 사라진다
export function ToastHost() {
  const toasts = useUI((s) => s.toasts);
  const set = useUI((s) => s.set);
  const step = useUI((s) => s.step);
  const [okd, setOkd] = useState<Record<string, boolean>>({}); // 확인을 누른 알림
  if (!toasts.length || step !== 1) return null;
  return (
    <div className="toasts is-inline" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.key} className="toast">
          <b>{t.title}</b>
          {!okd[t.key] ? (
            <button type="button" className="toast-ok" onClick={() => setOkd({ ...okd, [t.key]: true })}>확인</button>
          ) : (
            <div className="toast-btns">
              <button type="button" className="toast-rep" onClick={() => set({ reportOpen: true })}>레포트 분석</button>
              <button type="button" className="toast-rep" onClick={() => set({ dataOpen: true })}>관제 데이터 다운로드</button>
            </div>
          )}
          <button type="button" aria-label="알림 닫기" onClick={() => set({ toasts: useUI.getState().toasts.filter((x) => x.key !== t.key) })}>✕</button>
        </div>
      ))}
    </div>
  );
}

export function Tooltip() {
  const h = useUI((s) => s.hover);
  if (!h) return null;
  const x = Math.min(h.x + 14, window.innerWidth - 240);
  return (
    <div className="tip" style={{ left: x, top: h.y + 14 }} role="tooltip">
      <strong>{h.title}</strong>
      {h.lines.map((l) => <span key={l}>{l}</span>)}
    </div>
  );
}

export function TimeBar() {
  return null;
}

// S3 오른쪽 카드 안의 시뮬레이션 재생 조작
export function SimControls() {
  const set = useUI((s) => s.set);
  const simT = useUI((s) => s.simT);
  const playing = useUI((s) => s.playing);
  const min = Math.round(simT * 10);
  const hh = Math.floor(min / 60), mm = String(min % 60).padStart(2, '0');
  const done = simT >= 36;
  return (
    <div className="simctl">
      <button className="btn btn-icon" onClick={() => (done ? set({ simT: 0, playing: true }) : set({ playing: !playing }))} aria-label={done ? '처음부터 재생' : playing ? '일시정지' : '재생'}>
        <Icon name={done ? 'replay' : playing ? 'pause' : 'play'} size={16} />
      </button>
      <input type="range" min={0} max={36} step={0.1} value={simT} onChange={(e) => set({ simT: Number(e.target.value), playing: false })} aria-label="시뮬레이션 시각" aria-valuetext={`${hh}시간 ${mm}분`} />
      <span className="tb-time">+{hh}:{mm}<small> / 6:00</small></span>
    </div>
  );
}

// S1 오른쪽 열: 경보 목록(위)과 항만 현황(아래)을 각각 왼쪽 손잡이로 따로 넣었다 뺀다
export function RightRail({ alerts, overview }: { alerts: React.ReactNode | null; overview: React.ReactNode }) {
  const aOpen = useUI((s) => s.alertsOpen);
  const oOpen = useUI((s) => s.ovOpen);
  const setUI = useUI((s) => s.set);
  return (
    <div className="rail">
      {alerts && (
        <div className={`rail-item rail-alerts ${aOpen ? '' : 'is-closed'}`}>
          <Handle open={aOpen} label="경보 목록" on={() => setUI({ alertsOpen: !aOpen })} />
          {alerts}
        </div>
      )}
      <div className={`rail-item rail-ov ${oOpen ? '' : 'is-closed'}`}>
        <Handle open={oOpen} label="진행 중인 병목" on={() => setUI({ ovOpen: !oOpen })} />
        {overview}
      </div>
      <ToastHost />
    </div>
  );
}

function Handle({ open, label, on }: { open: boolean; label: string; on: () => void }) {
  return (
    <button className="rail-toggle" onClick={on} aria-expanded={open} aria-label={`${label} ${open ? '접기' : '펼치기'}`}>
      <Icon name="chevron" size={16} />
    </button>
  );
}
