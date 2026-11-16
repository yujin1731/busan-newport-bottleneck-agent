import { useUI } from './store';
import { gateQueues, simMoved } from './scene/geo';

// 지금 화면이 보여 주는 상태(시간 막대·시뮬레이션 반영)
export function useView() {
  const data = useUI((s) => s.data)!;
  const step = useUI((s) => s.step);
  const hour = useUI((s) => s.hour);
  const simT = useUI((s) => s.simT);
  const simMode = useUI((s) => s.simMode);
  const st = data.states[step >= 3 ? 0 : hour];
  const simCand = useUI((s) => s.simCand);
  // 대응 화면: '조치 후'는 선택 기준 1위 후보의 시뮬레이션을 재생한다
  const candSteps = data.cands.candidates.find((c) => c.id === simCand)?.steps ?? data.simAfter;
  const sim = step >= 3 ? (simMode === 'after' ? candSteps : data.simBefore) : null;
  const queues = gateQueues(st, sim, simT);
  const moved = sim ? simMoved(sim, simT) : 0;
  return { data, step, st, sim, queues, moved, simT, simMode };
}
