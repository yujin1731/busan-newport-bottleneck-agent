import { useUI } from '../store';

// 시연: 대응을 승인하고 이만큼(ms) 지나면 혼잡도가 정상으로 돌아와 병목이 끝난 것으로 본다
export const AUTO_END_MS = 14000;

// 병목 종료: 목록에서 '종료'로 바꾸고 알림을 띄운다(수동 STOP과 자동 종료가 함께 쓴다)
export function endBottleneck(id: string, manual = false) {
  const u = useUI.getState();
  if (u.ended[id] || !u.data) return;
  const a = u.data.alerts.find((x) => x.id === id);
  const label = a ? a.title.replace(/ · .*/, '') : id;
  u.set({
    ended: { ...u.ended, [id]: Date.now() },
    toasts: [...u.toasts, { key: `${id}-${Date.now()}`, title: '병목 종료', text: `${label}: ${manual ? '대응 진행을 마쳤습니다.' : '혼잡도가 정상으로 돌아왔습니다.'}` }],
  });
}

// 대응을 승인한 병목만 시간이 지나면 자동으로 끝낸다
export function checkAutoEnd(now = Date.now()) {
  const u = useUI.getState();
  for (const [id, at] of Object.entries(u.acted)) {
    if (!u.ended[id] && now - at >= AUTO_END_MS) endBottleneck(id);
  }
}
