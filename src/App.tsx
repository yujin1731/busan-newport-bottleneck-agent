import { useEffect, useState } from 'react';
import { useUI } from './store';
import { loadBundle } from './data/dataSource';
import { Scene } from './scene/Scene';
import { TopBar, OverviewCard, Tooltip, RightRail } from './ui/Chrome';
import { Panel } from './ui/Panels';
import { ResultModal } from './ui/ResultModal';

export default function App() {
  const data = useUI((s) => s.data);
  const set = useUI((s) => s.set);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    loadBundle().then((d) => set({ data: d })).catch((e) => setErr(String(e.message || e)));
  }, [set]);

  if (err) return <div className="boot"><b>데이터를 불러오지 못했다</b><span>{err}</span><button className="btn btn-soft" onClick={() => location.reload()}>다시 시도</button></div>;
  if (!data) return <div className="boot"><span className="boot-bar" />신항 데이터 불러오는 중</div>;

  return (
    <div className="app">
      <main className="stage"><Scene /></main>
      <TopBar />
      <RailSwitch />
      
      <Tooltip />
      <ResultModal />
    </div>
  );
}

// 관제(S1): 경보 목록 + 항만 현황을 오른쪽 한 열로. 다른 단계는 기존 오른쪽 칸
function RailSwitch() {
  const step = useUI((s) => s.step);
  if (step !== 1) return <Panel />;
  return <RightRail alerts={<Panel />} overview={<OverviewCard />} />;
}
