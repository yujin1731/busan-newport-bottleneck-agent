import { create } from 'zustand';
import type { Bundle } from './data/types';

export type Step = 1 | 2 | 3 | 4;
export type Focus = 'port' | string; // 'port' 또는 터미널 id
export type Decision = null | 'approved' | 'held' | 'rejected';

interface UI {
  data: Bundle | null;
  step: Step;
  maxStep: Step;
  focus: Focus;
  hour: number; // -24 .. 0
  calm: boolean; // 평상시 화면(경보 전). 시간이 흘러 경보가 올라오면 false
  layers: { flow: boolean; occ: boolean; ships: boolean; cctv: boolean };
  hover: null | { id: string; title: string; lines: string[]; x: number; y: number };
  peek: null | { tid: string; x: number; y: number; seaY: number }; // seaY: 위쪽 터미널 줄 바로 아래 바다의 화면 높이
  acted: Record<string, number>; // 병목 id → 대응 승인 시각(ms)
  ended: Record<string, number>; // 병목 id → 종료 시각(ms)
  toasts: { key: string; title: string; text: string }[]; // 병목 종료 알림
  reportOpen: boolean; // 병목 상황 기록 보고서(미리보기·내보내기)
  policyPicked: boolean; // 대응 화면: 운영 기준을 골랐는지(false면 가운데에 대응안 폴더를 띄운다)
  diagView: 'summary' | 'book'; // 진단 화면: 처음에는 요약(표), 탭으로 설명서(책)로 바꾼다
  heatTab: null | number; // 진단 화면 책 위 인덱스 탭: 고른 CCTV 구역(열려 있는 동안 그 터미널의 히트맵 나열을 보여 준다)
  zoneSel: null | { tid: string; i: number }; // 히트맵 카드로 고른 구역(0 접속부, 1 진입로, 2 대기 차로, 3 야드 앞 도로)
  simT: number; // 0 .. 36 (10분 단위)
  playing: boolean;
  speed: 1 | 2 | 4;
  simMode: 'before' | 'after';
  decision: Decision;
  history: { at: string; text: string }[];
  legend: boolean;
  alertsOpen: boolean;
  policy: import("./data/policy").PolicyId;
  simCand: string;
  ovOpen: boolean;
  resultOpen: boolean;
  set: (p: Partial<UI>) => void;
  go: (s: Step) => void;
  toggleLayer: (k: keyof UI['layers']) => void;
}

export const CALM_HOUR = -10; // 모든 게이트가 정상인 시각(데이터상 8시간 전까지 정상)

export const useUI = create<UI>((set, get) => ({
  data: null,
  step: 1,
  maxStep: 1,
  focus: 'port',
  hour: CALM_HOUR, // 처음에는 아무 이상 없는 평상시 상태로 시작한다
  calm: true,
  layers: { flow: true, occ: false, ships: true, cctv: false },
  hover: null,
  peek: null,
  zoneSel: null,
  heatTab: null,
  diagView: 'summary',
  policyPicked: false,
  acted: {},
  ended: {},
  toasts: [],
  reportOpen: false,
  simT: 0,
  playing: false,
  speed: 2,
  simMode: 'after',
  decision: null,
  history: [],
  legend: false,
  alertsOpen: true,
  policy: "min_wait",
  simCand: "ACT-01",
  ovOpen: true, // 진행 중인 병목 목록은 처음부터 펼쳐 둔다
  resultOpen: false,
  set: (p) => set(p),
  go: (s) => {
    const p: Partial<UI> = { step: s, hover: null, zoneSel: null, heatTab: null, resultOpen: false, maxStep: Math.max(get().maxStep, s) as Step };
    if (s === 1) Object.assign(p, { focus: 'port', playing: false });
    if (s >= 2) Object.assign(p, { calm: false, hour: 0 });
    if (s === 2) p.diagView = 'summary';
    if (s === 2) Object.assign(p, { focus: 'DGT', hour: 0, playing: false });
    if (s === 3 && get().step !== 4) p.policyPicked = false;
    if (s === 3) Object.assign(p, { focus: 'DGT+HJNC', hour: 0, simMode: 'after', simT: get().simT > 0 ? get().simT : 0, playing: get().simT === 0 });
    if (s === 4) Object.assign(p, { focus: 'DGT+HJNC', playing: false, simT: 36, simMode: 'after' });
    set(p);
  },
  toggleLayer: (k) => set({ layers: { ...get().layers, [k]: !get().layers[k] } }),
}));

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__ui = useUI;

// CCTV 패널: 터미널에서 패널로 마우스를 옮기는 동안 잠깐 유지한다
let peekTimer: number | undefined;
export const peekHold = () => { if (peekTimer !== undefined) { window.clearTimeout(peekTimer); peekTimer = undefined; } };
export const peekLeave = (ms = 400) => {
  if (peekTimer !== undefined) return;
  peekTimer = window.setTimeout(() => { peekTimer = undefined; useUI.getState().set({ peek: null }); }, ms);
};
