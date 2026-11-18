import { useUI } from '../store';

// 병목 종료: 관제 화면의 STOP을 누르면 목록에서 '종료'로 바꾸고 알림을 띄운다
export function endBottleneck(id: string) {
  const u = useUI.getState();
  if (u.ended[id] || !u.data) return;
  const a = u.data.alerts.find((x) => x.id === id);
  const label = a ? a.title.replace(/ · .*/, '') : id;
  u.set({
    ended: { ...u.ended, [id]: Date.now() },
    toasts: [...u.toasts, { key: `${id}-${Date.now()}`, title: '병목 종료', text: `${label} · 대응 종료, 혼잡도 정상화 확인` }],
  });
}

