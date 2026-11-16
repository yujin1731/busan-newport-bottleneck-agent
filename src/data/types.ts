export type Src = '실측' | '추정' | '시뮬';
export type St = 'ok' | 'warn' | 'jam';
export interface Rect { x0: number; x1: number; z0: number; z1: number }

export interface Block { id: string; cx: number; cz: number; axis: 'x' | 'z'; bays: number; rows: number; temp?: boolean }
export interface Terminal {
  id: string; name: string; box: number[]; quay: 'N' | 'S' | 'E'; approx: boolean; automated: boolean;
  rect: Rect; gate: { x: number; z: number }; blocks: Block[];
}
export interface GNode { id: string; name: string; x: number; z: number; kind: 'ext' | 'wait' | 'junction' | 'gate'; terminal?: string }
export interface GLink { id: string; from: string; to: string; name: string; public: boolean }
export interface Layout {
  meta: { title: string; unit: string; note: string };
  container: { L: number; W: number; H: number; gapL: number; gapW: number };
  terminals: Terminal[]; nodes: GNode[]; links: GLink[];
  land: { id: string; rect: Rect }[];
  cctv: { id: string; x: number; z: number; node: string }[];
}

export interface Kpi { value: number; usual?: number; unit: string; src?: Src; km?: number }
export interface PortState {
  h: number; asOf: string;
  kpi: { tat: Kpi; queue: Kpi; spill: Kpi; alerts: Kpi };
  occ: Record<string, number>;
  gates: Record<string, { queue: number; tat: number; thr: number; state: St }>;
  links: Record<string, { speed: number; state: St }>;
  ships: Record<string, number>;
}
export interface Alert { id: string; severity: '심각' | '주의'; node: string; terminal: string; title: string; since: string; duration: string; diagnosis: boolean; brief?: { cause: string; usualThr: [number, number]; verdict: string } }
export interface Evidence { id: string; label: string; value: number; unit: string; usual: [number, number]; series: number[]; src: Src; verdict: string }
export interface Diagnosis {
  alert: string;
  congestion: { node: string; label: string; detail: string };
  cause: { blocks: string[]; label: string; detail: string };
  confidence: '높음' | '중간' | '낮음';
  pathLabels: string[]; pathState: string[];
  evidence: Evidence[]; summary: string;
  video: { camera: string; at: string; score: number; label: string; similar: { at: string; sim: number }[] };
  alt: { label: string; confidence: string; note: string }[];
}
export interface Action {
  id: string; type: string; title: string; volume: { value: number; unit: string }; window: string;
  from: { node: string; label: string }; to: { node: string; block: string; label: string };
  route: string[]; constraints: { label: string; detail: string; ok: boolean | null }[];
  explain: string[]; parties: string[];
}
export interface SimStep { step: number; minute: number; queue: Record<string, number>; moved: number }
export interface ResultItem { id: string; label: string; value: number; from?: number; unit: string; range: [number, number]; src: Src; good: boolean; note?: string; where?: string }
export interface Result { basis: string; items: ResultItem[] }

export interface Bundle {
  layout: Layout; states: Record<number, PortState>; hours: number[]; alerts: Alert[];
  diagnosis: Diagnosis; action: Action; simBefore: SimStep[]; simAfter: SimStep[]; result: Result; cands: CandBundle;
}

// 대응 후보 시연 시뮬레이션(public/mock/candidates.json, scripts/gen-candidates.mjs)
export interface CandSim {
  id: string; label: string; kind: string; approvals: string[]; blocked: boolean; route: boolean;
  type: string; volume: number; parties: string[]; constraints: { label: string; detail: string; ok: boolean | null }[];
  steps: SimStep[];
  cutoff: { needTEU: number; atLoadingByCutoffTEU: number; note: string };
  qty: { transportTEU: number; returnTEU: number; rehandleMoves: number; storageTEUday: number };
}
export interface CandBundle {
  demo: boolean;
  assumptions: Record<'transportPerTEU' | 'rehandlePerMove' | 'storagePerTEUday' | 'waitPerVehHour' | 'cutoffHours', { value: number; src: string }>;
  candidates: CandSim[];
}
