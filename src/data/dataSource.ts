// 데이터 접근은 이 파일 하나에 모은다. API로 바꿀 때는 BASE와 get()만 고친다.
import type { Bundle, Layout, PortState, Alert, Diagnosis, Action, SimStep, Result, CandBundle } from './types';

const BASE = `${import.meta.env.BASE_URL}mock/`;

async function get<T>(name: string): Promise<T> {
  const r = await fetch(`${BASE}${name}.json`);
  if (!r.ok) throw new Error(`${name} 불러오기 실패 (${r.status})`);
  return r.json() as Promise<T>;
}

export async function loadBundle(): Promise<Bundle> {
  const [layout, index, alerts, diagnosis, action, before, after, result, cands] = await Promise.all([
    get<Layout>('layout'),
    get<{ hours: number[] }>('state_index'),
    get<Alert[]>('alerts'),
    get<Diagnosis>('diagnosis'),
    get<Action>('action'),
    get<{ steps: SimStep[] }>('sim_before'),
    get<{ steps: SimStep[] }>('sim_after'),
    get<Result>('result'),
    get<CandBundle>('candidates'),
  ]);
  const list = await Promise.all(index.hours.map((h) => get<PortState>(`state_${h}`)));
  const states: Record<number, PortState> = {};
  list.forEach((s) => (states[s.h] = s));
  return { layout, states, hours: index.hours, alerts, diagnosis, action, simBefore: before.steps, simAfter: after.steps, result, cands };
}
