import { useEffect } from 'react';
import { useUI } from '../store';
import { useView } from '../view';
import { HeatRow } from './CctvPeek';

// 진단 화면 위의 인덱스 탭 두 개: 요약(표) / 설명서(책). 누른 탭이 위로 솟아 있다.
export function DiagTabs() {
  const view = useUI((s) => s.diagView);
  const set = useUI((s) => s.set);
  return (
    <div className="idx-tabs" role="tablist" aria-label="진단 보기 선택">
      <button role="tab" aria-selected={view === 'summary'} className={`idx-tab idx-1 ${view === 'summary' ? 'is-on' : ''}`} onClick={() => set({ diagView: 'summary', heatTab: null })}>요약</button>
      <button role="tab" aria-selected={view === 'book'} className={`idx-tab idx-2 ${view === 'book' ? 'is-on' : ''}`} onClick={() => set({ diagView: 'book', heatTab: null })}>설명서</button>
    </div>
  );
}

// 요약·설명서 카드 아래에 매달린 주황 인덱스: 대응안으로 넘어간다
export function UnderTab({ label = '대응안', to = 3 }: { label?: string; to?: 3 | 4 }) {
  const go = useUI((s) => s.go);
  return <button type="button" className="idx-tab idx-or-go idx-under" onClick={() => go(to)}>{label} <span aria-hidden="true">→</span></button>;
}

// 책의 마지막 쪽 아래 버튼: 설명서를 다 읽고 대응안으로 넘어간다
export function NextButton() {
  const go = useUI((s) => s.go);
  return (
    <div className="pg-actions">
      <button className="pg-btn pg-btn-go" onClick={(e) => { e.stopPropagation(); go(3); }}>대응안 보기 <span aria-hidden="true">→</span></button>
    </div>
  );
}

// 탭을 누르면 왼쪽 위(책과 위쪽 바에 겹치지 않는 자리)에 뜨는 히트맵 나열
export function HeatPanel() {
  const tab = useUI((s) => s.heatTab);
  const step = useUI((s) => s.step);
  const set = useUI((s) => s.set);
  const { data } = useView();
  useEffect(() => {
    if (tab === null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && set({ heatTab: null });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, set]);
  if (tab === null || step !== 2) return null;
  const tid = data.diagnosis.cause.blocks[0].split('-')[0];
  // 책(오른쪽 열)의 왼쪽 빈 자리를 채운다. CSS의 clamp(560px, 54vw, 1000px)와 같은 값
  const w = window.innerWidth;
  const book = Math.min(1000, Math.max(560, w * 0.54));
  const width = Math.max(420, Math.min(860, w - book - 24 - 24 - 16));
  return (
    <aside className="peek heat-sel" style={{ left: 24, top: 92, width }} aria-label="CCTV 히트맵 선택창">
      <HeatRow tid={tid} />
    </aside>
  );
}

// 대응 화면의 책갈피(주황): 기준을 다시 고르거나, 승인 요청으로 넘어간다
export function ResponseTabs() {
  const set = useUI((s) => s.set);
  return (
    <div className="idx-tabs" role="tablist" aria-label="책갈피">
      <button className="idx-tab idx-or-0" title="운영 기준 다시 고르기" aria-label="운영 기준 다시 고르기" onClick={() => set({ policyPicked: false })}>←</button>
    </div>
  );
}

// 병목 범위 쪽 아래의 버튼: 누르면 이 터미널의 구역별 CCTV 히트맵 나열이 왼쪽 위에 뜬다(다시 누르면 닫힌다)
export function CctvButton() {
  const tab = useUI((s) => s.heatTab);
  const set = useUI((s) => s.set);
  return (
    <div className="pg-actions">
      <button className="pg-btn" aria-pressed={tab !== null} onClick={(e) => { e.stopPropagation(); set({ heatTab: tab === null ? 0 : null }); }}>{tab === null ? 'CCTV 현황 보기' : 'CCTV 현황 닫기'}</button>
    </div>
  );
}
