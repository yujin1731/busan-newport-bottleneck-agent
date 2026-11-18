import { useEffect, useRef, useState } from 'react';
import { useUI } from './store';
import { loadBundle } from './data/dataSource';
import { Scene } from './scene/Scene';
import { TopBar, OverviewCard, Tooltip, RightRail, ToastHost } from './ui/Chrome';
import { checkAutoEnd } from './data/bottleneck';
import { Panel } from './ui/Panels';
import { ResultModal } from './ui/ResultModal';
import { CctvPeek } from './ui/CctvPeek';
import { HeatPanel } from './ui/IndexTabs';
import { PolicyFolder } from './ui/PolicyFolder';
import { ReportModal } from './ui/ReportModal';
import { Splash } from './ui/Splash';

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
  // 승인한 대응이 끝날 시각이 되면 병목을 종료로 바꾼다
  useEffect(() => {
    const t = window.setInterval(() => checkAutoEnd(), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    loadBundle().then((d) => set({ data: d })).catch((e) => setErr(String(e.message || e)));
  }, [set]);

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
      <ToastHost />
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
