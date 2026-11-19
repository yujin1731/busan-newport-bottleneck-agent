import { useEffect, useRef, useState } from 'react';
import { useUI } from './store';
import { loadBundle } from './data/dataSource';
import { Scene } from './scene/Scene';
import { TopBar, OverviewCard, Tooltip, RightRail } from './ui/Chrome';
import { Panel } from './ui/Panels';
import { ResultModal } from './ui/ResultModal';
import { CctvPeek } from './ui/CctvPeek';
import { HeatPanel } from './ui/IndexTabs';
import { PolicyFolder } from './ui/PolicyFolder';
import { ReportModal, DataModal } from './ui/ReportModal';
import { Splash } from './ui/Splash';

const CALM_HOLD_MS = 13000; // 평상시 화면을 보여 주는 시간

export default function App() {
  const data = useUI((s) => s.data);
  const set = useUI((s) => s.set);
  const [err, setErr] = useState<string | null>(null);
  // 시작 화면: 로고와 도는 원이 먼저 나오고, 자료가 준비되면(최소 1.8초) 흐려지면서 메인 화면이 나온다
  const t0 = useRef(Date.now());
  const [splash, setSplash] = useState<'on' | 'fade' | 'off'>('on');
  useEffect(() => {
    if (!data || splash !== 'on') return;
    const wait = Math.max(0, 1800 - (Date.now() - t0.current));
    const t = window.setTimeout(() => setSplash('fade'), wait);
    return () => window.clearTimeout(t);
  }, [data, splash]);
  useEffect(() => {
    if (splash !== 'fade') return;
    const t = window.setTimeout(() => setSplash('off'), 600);
    return () => window.clearTimeout(t);
  }, [splash]);
  useEffect(() => {
    loadBundle().then((d) => set({ data: d })).catch((e) => setErr(String(e.message || e)));
  }, [set]);

  // 평상시 → 경보: 시작 화면이 걷힌 뒤 잠시 이상 없는 상태를 보여 주고, 시간이 흐르며 DGT 병목이 올라온다.
  // Enter 키를 누르면 기다리지 않고 바로 시작한다(영상 촬영용).
  const calm = useUI((s) => s.calm);
  const step = useUI((s) => s.step);
  useEffect(() => {
    if (!data || splash !== 'off' || !calm || step !== 1) return;
    let tick: number | undefined;
    let began = false;
    const begin = () => {
      if (began) return;
      began = true;
      window.clearTimeout(hold);
      tick = window.setInterval(() => {
        const h = useUI.getState().hour + 1;
        if (h >= 0) { window.clearInterval(tick); set({ hour: 0, calm: false }); } else set({ hour: h });
      }, 600);
    };
    const hold = window.setTimeout(begin, CALM_HOLD_MS);
    const key = (e: KeyboardEvent) => { if (e.key === 'Enter') begin(); };
    window.addEventListener('keydown', key);
    return () => { window.clearTimeout(hold); window.clearInterval(tick); window.removeEventListener('keydown', key); };
  }, [data, splash, calm, step, set]);

  if (err) return <div className="boot"><b>데이터를 불러오지 못했다</b><span>{err}</span><button className="btn btn-soft" onClick={() => location.reload()}>다시 시도</button></div>;
  if (!data) return <Splash phase="on" />;

  return (
    <div className="app">
      <main className="stage"><Scene /></main>
      <TopBar />
      <RailSwitch />
      
      <Tooltip />
      <CctvPeek />
      <HeatPanel />
      <PolicyFolder />
      <ReportModal />
      <DataModal />
      <ResultModal />
      {splash !== 'off' && <Splash phase={splash} />}
    </div>
  );
}

// 관제(S1): 경보 목록 + 항만 현황을 오른쪽 한 열로. 다른 단계는 기존 오른쪽 칸
function RailSwitch() {
  const step = useUI((s) => s.step);
  if (step !== 1) return <Panel />;
  return <RightRail alerts={null} overview={<OverviewCard />} />;
}
