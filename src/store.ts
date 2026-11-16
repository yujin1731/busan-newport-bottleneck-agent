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
  layers: { flow: boolean; occ: boolean; ships: boolean; cctv: boolean };
  hover: null | { id: string; title: string; lines: string[]; x: number; y: number };
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

export const useUI = create<UI>((set, get) => ({
  data: null,
  step: 1,
  maxStep: 1,
  focus: 'port',
  hour: 0,
  layers: { flow: true, occ: false, ships: true, cctv: false },
  hover: null,
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
  ovOpen: true,
  resultOpen: false,
  set: (p) => set(p),
  go: (s) => {
    const p: Partial<UI> = { step: s, hover: null, resultOpen: false, maxStep: Math.max(get().maxStep, s) as Step };
    if (s === 1) Object.assign(p, { focus: 'port', playing: false });
    if (s === 2) Object.assign(p, { focus: 'DGT', hour: 0, playing: false });
    if (s === 3) Object.assign(p, { focus: 'DGT+HJNC', hour: 0, simMode: 'after', simT: get().simT > 0 ? get().simT : 0, playing: get().simT === 0 });
    if (s === 4) Object.assign(p, { focus: 'DGT+HJNC', playing: false, simT: 36, simMode: 'after' });
    set(p);
  },
  toggleLayer: (k) => set({ layers: { ...get().layers, [k]: !get().layers[k] } }),
}));

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__ui = useUI;
