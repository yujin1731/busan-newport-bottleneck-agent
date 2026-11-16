import { useUI, type Step } from '../store';
import { useView } from '../view';
import { Icon } from './Icon';
import { fmt, sign } from './bits';

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: '관제' },
  { n: 2, label: '진단' },
  { n: 3, label: '대응' },
  { n: 4, label: '승인' },
];

export function TopBar() {
  const { step, st } = useView();
  const go = useUI((s) => s.go);
  const maxReached = useUI((s) => s.maxStep);
  return (
    <header className="top">
      <button className="brand" onClick={() => go(1)} aria-label="관제 화면으로 이동">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        신항 병목 관제
      </button>
      <nav className="tabs" aria-label="진행 단계">
        {STEPS.map((s) => (
          <button
            key={s.n}
            className={`tab ${step === s.n ? 'is-now' : ''} ${s.n < step ? 'is-done' : ''}`}
            disabled={s.n > maxReached}
            onClick={() => go(s.n)}
            aria-current={step === s.n ? 'step' : undefined}
          >
            <span className="tab-n">{s.n < step ? <Icon name="check" size={12} /> : s.n}</span>
            {s.label}
          </button>
        ))}
      </nav>
      <div className="top-right">
        <div className="pill-info"><Icon name="history" size={15} />{st.asOf.slice(5).replace('-', '.')}</div>
      </div>
    </header>
  );
}

// S1 왼쪽 카드: 항만 전체 숫자
export function OverviewCard() {
  const { st, step, data } = useView();
  if (step !== 1) return null;
  const k = st.kpi;
  const occAll = Math.round((Object.entries(st.occ).filter(([id]) => !data.layout.terminals.some((t) => t.blocks.some((b) => b.id === id && b.temp))).reduce((a, [, v]) => a + v, 0) / Object.keys(st.occ).length) * 100);
  // 빨강 = 이상, 주황 = 주의, 파랑 = 정상
  const lv = (d: number, warn: number, bad: number) => (d > bad ? 'bad' : d > warn ? 'warn' : 'ok');
  const live = data.alerts.filter((a) => st.gates[a.node].state !== 'ok');
  const severe = live.some((a) => a.severity === '심각');
  const dTat = k.tat.value - (k.tat.usual ?? 0), dQ = k.queue.value - (k.queue.usual ?? 0);
  const rows = [
    { icon: 'clock', label: '평균 TAT', sub: `평소 ${sign(dTat)}분`, v: `${k.tat.value}`, u: '분', lvl: lv(dTat, 3, 10) },
    { icon: 'truck', label: '게이트 대기 차량', sub: `평소 ${sign(dQ)}대`, v: fmt(k.queue.value), u: '대', lvl: lv(dQ, 10, 30) },
    { icon: 'road', label: '공공도로 넘침', sub: k.spill.value ? `${k.spill.km} km 밀림` : '없음', v: `${k.spill.value}`, u: '구간', lvl: k.spill.value > 0 ? 'bad' : 'ok' },
    { icon: 'stack', label: '평균 장치율', sub: '85% 넘으면 포화', v: `${occAll}`, u: '%', lvl: occAll >= 85 ? 'bad' : occAll >= 75 ? 'warn' : 'ok', meter: occAll },
    { icon: 'alert', label: '병목 경보', sub: live.length ? `심각 ${live.filter((a) => a.severity === '심각').length} · 주의 ${live.filter((a) => a.severity === '주의').length}` : '없음', v: `${live.length}`, u: '건', lvl: severe ? 'bad' : live.length ? 'warn' : 'ok' },
  ] as { icon: string; label: string; sub: string; v: string; u: string; lvl: string; meter?: number }[];
  const nBad = rows.filter((r) => r.lvl === 'bad').length, nWarn = rows.filter((r) => r.lvl === 'warn').length;
  return (
    <section className="ov-card" aria-label="항만 현황">
      <div className="ov-head">
        <h2>항만 현황</h2>

        <span className="head-num" aria-label={`이상 ${nBad}건, 주의 ${nWarn}건`}>{nBad}<small>건 이상</small></span>
      </div>
      <ul className="ov">
        {rows.map((r) => (
          <li key={r.label} className={`ov-row lv-${r.lvl}`}>
            <span className="ov-icon"><Icon name={r.icon} size={18} /></span>
            <span className="ov-text"><b>{r.label}</b><small>{r.sub}</small>{r.meter !== undefined && <span className="ov-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, r.meter)}%` }} /><em /></span>}</span>
            <span className="ov-val">{r.v}<small>{r.u}</small></span>
          </li>
        ))}
      </ul>
    </section>
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
  const speed = useUI((s) => s.speed);
  const simMode = useUI((s) => s.simMode);
  const min = Math.round(simT * 10);
  const hh = Math.floor(min / 60), mm = String(min % 60).padStart(2, '0');
  const done = simT >= 36;
  return (
    <div className="simctl">
      <button className="btn btn-icon" onClick={() => (done ? set({ simT: 0, playing: true }) : set({ playing: !playing }))} aria-label={done ? '처음부터 재생' : playing ? '일시정지' : '재생'}>
        <Icon name={done ? 'replay' : playing ? 'pause' : 'play'} size={16} />
      </button>
      <div className="seg" role="group" aria-label="배속">
        {([1, 2, 4] as const).map((s) => (
          <button key={s} className={speed === s ? 'is-on' : ''} aria-pressed={speed === s} onClick={() => set({ speed: s })}>{s}x</button>
        ))}
      </div>
      <input type="range" min={0} max={36} step={0.1} value={simT} onChange={(e) => set({ simT: Number(e.target.value), playing: false })} aria-label="시뮬레이션 시각" aria-valuetext={`${hh}시간 ${mm}분`} />
      <span className="tb-time">+{hh}:{mm}<small> / 6:00</small></span>
      <div className="seg seg-mode" role="group" aria-label="비교">
        <button className={simMode === 'before' ? 'is-on' : ''} aria-pressed={simMode === 'before'} onClick={() => set({ simMode: 'before' })}>조치 안 함</button>
        <button className={simMode === 'after' ? 'is-on is-act' : ''} aria-pressed={simMode === 'after'} onClick={() => set({ simMode: 'after' })}>조치 후</button>
      </div>
    </div>
  );
}

// S1 오른쪽 열: 경보 목록(위)과 항만 현황(아래)을 각각 왼쪽 손잡이로 따로 넣었다 뺀다
export function RightRail({ alerts, overview }: { alerts: React.ReactNode; overview: React.ReactNode }) {
  const aOpen = useUI((s) => s.alertsOpen);
  const oOpen = useUI((s) => s.ovOpen);
  const setUI = useUI((s) => s.set);
  return (
    <div className="rail">
      <div className={`rail-item rail-alerts ${aOpen ? '' : 'is-closed'}`}>
        <Handle open={aOpen} label="경보 목록" on={() => setUI({ alertsOpen: !aOpen })} />
        {alerts}
      </div>
      <div className={`rail-item rail-ov ${oOpen ? '' : 'is-closed'}`}>
        <Handle open={oOpen} label="항만 현황" on={() => setUI({ ovOpen: !oOpen })} />
        {overview}
      </div>
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
