import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useUI, peekHold, peekLeave } from '../store';
import { useView } from '../view';
import type { Bundle } from '../data/types';

// 터미널 카드에 마우스를 올리면 그 터미널의 CCTV 구역별 병목 상황(히트맵)을 나열한다.
// 지금 사진은 시연용 장면이다. 실제 사진은 public/mock/cctv.json 의 images 에 "터미널:번호" 로 연결한다.
export interface CamView { key: string; label: string; idx: number; pct: number; score: number; tag: '줄 번짐' | '붐빔' | '평상'; seed: number }

// 평소 = 같은 게이트의 지난 24시간 평균 대기 차량
function usualQueue(data: Bundle, node: string) {
  const hs = data.hours.filter((h) => h < 0);
  return hs.reduce((a, h) => a + (data.states[h]?.gates[node]?.queue ?? 0), 0) / Math.max(1, hs.length);
}

// 병목이 있다/없다를 판단하는 수치(%): 평소 대비 배율이 병목 기준(threshold)일 때 50%이고, 높을수록 100%에 가깝다.
// 실제 CCTV 판독 결과가 오면 판독 엔진이 내는 병목 확률로 바꾼다(지금은 시연용 계산).
export const bnPct = (idx: number, threshold: number) => Math.round(100 / (1 + Math.exp(-(idx - threshold) * 3)));

export function camViews(data: Bundle, tid: string, queueNow: number): CamView[] {
  const c = data.cctv;
  const ratio = queueNow / Math.max(1, usualQueue(data, `g_${tid}`));
  const w = c.weights[tid] ?? c.weights.default;
  const views = c.views.map((label, i) => {
    const idx = Math.max(0.5, Math.round((1 + (ratio - 1) * (w[i] ?? 0)) * 10) / 10);
    const tag = idx >= 2 ? '줄 번짐' : idx >= c.threshold ? '붐빔' : '평상';
    return { key: `${tid}:${i}`, label, idx, pct: bnPct(idx, c.threshold), score: Math.min(0.95, Math.round(0.23 * idx * 100) / 100), tag, seed: (tid.charCodeAt(0) * 31 + i * 17) % 997 } as CamView;
  });
  return views; // 트럭 이동 순서(왼쪽→오른쪽) 그대로
}

function rng(seed: number) {
  let s = (seed * 2654435761) % 4294967296;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function drawScene(g: CanvasRenderingContext2D, W: number, H: number, v: CamView, img: HTMLImageElement | null) {
  const r = rng(v.seed + 1);
  if (img) {
    g.drawImage(img, 0, 0, W, H);
  } else {
    const sky = g.createLinearGradient(0, 0, 0, H * 0.34);
    sky.addColorStop(0, '#c4d3e2'); sky.addColorStop(1, '#e3e8ec');
    g.fillStyle = sky; g.fillRect(0, 0, W, H * 0.34);
    // 멀리 보이는 컨테이너 더미와 크레인
    g.fillStyle = '#8b97a3';
    for (let x = 0; x < W; x += 9 + r() * 12) { const h = 4 + r() * 12; g.fillRect(x, H * 0.34 - h, 8 + r() * 6, h); }
    g.fillStyle = '#6f7c8a'; g.fillRect(W * 0.62, H * 0.1, 3, H * 0.24); g.fillRect(W * 0.5, H * 0.12, W * 0.28, 2);
    g.fillStyle = '#b9b7b0'; g.fillRect(0, H * 0.34, W, H * 0.66);
    // 도로(원근)와 차선
    g.fillStyle = '#9d9ea1';
    g.beginPath(); g.moveTo(0, H * 0.62); g.lineTo(W, H * 0.42); g.lineTo(W, H * 0.62); g.lineTo(0, H * 0.9); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1; g.setLineDash([6, 6]);
    g.beginPath(); g.moveTo(0, H * 0.76); g.lineTo(W, H * 0.52); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#c9c6bf'; g.fillRect(0, H * 0.9, W, H * 0.1);
  }
  // 차량: 지수가 높을수록 촘촘하게 길게 늘어선다
  const spacing = v.idx >= 1.5 ? 0.16 / v.idx : 0.15;
  const n = v.idx >= 1.5 ? Math.min(22, Math.round(0.8 / spacing)) : 6;
  const cars: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(0.97, v.idx >= 1.5 ? 0.97 - i * spacing : 0.05 + i * (0.9 / n) + r() * 0.04);
    const x = t * W, y = H * (0.8 - 0.3 * t) + (r() - 0.5) * H * 0.05;
    cars.push([x, y]);
    if (!img) {
      g.fillStyle = ['#3d4650', '#5a3a36', '#2f3a48', '#6b6f73'][i % 4]; g.fillRect(x - 5, y - 3.5, 10, 6);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x - 5, y - 3.5, 10, 1.5);
    }
  }
  return cars;
}

function drawHeat(g: CanvasRenderingContext2D, W: number, H: number, v: CamView, cars: [number, number][]) {
  const cols = 24, rows = 14, cw = W / cols, ch = H / rows;
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const mx = (cx + 0.5) * cw, my = (cy + 0.5) * ch;
    let d = 0;
    for (const [x, y] of cars) { const dx = (x - mx) / (cw * 2.2), dy = (y - my) / (ch * 1.8); d += Math.exp(-(dx * dx + dy * dy)); }
    const val = Math.min(1, d * (v.idx >= 1.5 ? 0.3 + 0.1 * v.idx : 0.12));
    if (val < 0.2) continue;
    g.fillStyle = val > 0.62 ? `rgba(200,30,30,${0.35 + val * 0.35})` : val > 0.38 ? `rgba(235,80,45,${0.3 + val * 0.4})` : `rgba(250,150,70,${0.25 + val * 0.4})`;
    g.fillRect(cx * cw, cy * ch, cw - 0.5, ch - 0.5);
  }
}

// 선택 다운로드용: 구역 CCTV 히트맵 사진(PNG)을 만든다
export function renderCamPng(v: CamView, tid: string, asOf: string, W = 960, H = 540): Promise<Uint8Array> {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const cars = drawScene(g, W, H, v, null);
  drawHeat(g, W, H, v, cars);
  g.fillStyle = 'rgba(10, 30, 55, 0.78)'; g.fillRect(0, 0, W, 44);
  g.fillStyle = '#fff'; g.font = '600 22px sans-serif'; g.textBaseline = 'middle';
  g.fillText(`${tid} ${v.label}`, 16, 22);
  g.textAlign = 'right'; g.fillText(`${asOf} · 혼잡도 ${v.pct}% · ${v.tag}`, W - 16, 22);
  return new Promise((res, rej) => cv.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a))) : rej(new Error('png'))), 'image/png'));
}

function HeatFrame({ v, src }: { v: CamView; src?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const W = 480, H = 270;
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    if (!g) return;
    const paint = (img: HTMLImageElement | null) => { const cars = drawScene(g, W, H, v, img); drawHeat(g, W, H, v, cars); };
    if (src) { const im = new Image(); im.onload = () => paint(im); im.onerror = () => paint(null); im.src = src; } else paint(null);
  }, [v, src]);
  return <canvas ref={ref} className="heat-cv" aria-label={`${v.label} 혼잡 히트맵`} />;
}

// 터미널 하나의 CCTV 구역별 히트맵 나열(제목줄 요약 + 사진 4장). 마우스 올림 패널과 진단 화면의 인덱스 탭 패널이 함께 쓴다
export function HeatRow({ tid, selected, onPick, check }: { tid: string; selected?: number | null; onPick?: (i: number) => void; check?: boolean }) {
  const { data, st } = useView();
  const views = useMemo(() => camViews(data, tid, st.gates[`g_${tid}`]?.queue ?? 0), [tid, data, st]);
  const peakIdx = Math.max(...views.map((x) => x.idx));
  const isBottleneck = peakIdx >= data.cctv.threshold;
  const name = data.layout.terminals.find((t) => t.id === tid)?.name ?? tid;
  // 진단 화면이 있는 터미널의 병목 카드 위에 마우스를 올리면 CHECK 버튼이 뜨고, 누르면 진단 화면으로 간다
  const diagnosable = !!check && data.alerts.some((a) => a.terminal === tid && a.diagnosis);
  const go = useUI((s) => s.go);
  return (
    <>
      <header>
        <b>{name} CCTV</b>
      </header>
      <div className="peek-flow">
        {views.map((v, i) => {
          const col = 1 + i * 2;
          return (
            <figure key={v.key} onClick={onPick ? () => onPick(i) : undefined} className={`pf ${isBottleneck && views.findIndex((x) => x.idx === peakIdx) === i ? 'pf-peak' : ''} ${selected === i ? 'pf-sel' : ''}`}>
              <div className="pf-label" style={{ gridColumn: col, gridRow: 1 }}>{v.label}</div>
              <div className="pf-img" style={{ gridColumn: col, gridRow: 2 }}>
                <HeatFrame v={v} src={data.cctv.images[v.key]} />
                {diagnosable && isBottleneck && views.findIndex((x) => x.idx === peakIdx) === i && (
                  <button className="pf-check" onClick={(e) => { e.stopPropagation(); useUI.getState().set({ peek: null }); go(2); }}>CHECK</button>
                )}
              </div>
              <div className="pf-num" style={{ gridColumn: col, gridRow: 3 }}>{v.pct}<small>%</small></div>
              {i < views.length - 1 && <span className="pf-arrow" style={{ gridColumn: col + 1, gridRow: 2 }} aria-hidden="true">→</span>}
            </figure>
          );
        })}
      </div>
    </>
  );
}

// 카드를 누르면 그 터미널의 그 지점으로 카메라가 가고 바닥을 혼잡 색으로 칠한다. 같은 카드를 다시 누르면 전체 화면으로
function selectZone(tid: string, i: number) {
  const s = useUI.getState();
  const same = s.zoneSel?.tid === tid && s.zoneSel.i === i;
  s.set(same ? { zoneSel: null, focus: 'port', peek: null } : { zoneSel: { tid, i }, focus: `zone:${tid}:${i}`, peek: null });
}

export function CctvPeek() {
  const peek = useUI((s) => s.peek);
  const step = useUI((s) => s.step);
  const { data } = useView();
  const tid = peek?.tid;
  void tid;
  const boxRef = useRef<HTMLElement>(null);
  const [h, setH] = useState(230); // 실제 패널 높이(그려진 뒤 측정)
  useLayoutEffect(() => { const el = boxRef.current; if (el && Math.abs(el.offsetHeight - h) > 1) setH(el.offsetHeight); });
  if (!peek || step !== 1) return null;
  const name = data.layout.terminals.find((t) => t.id === peek.tid)?.name ?? peek.tid;
  const maxRight = window.innerWidth >= 1250 ? window.innerWidth - 400 : window.innerWidth - 12; // 좁은 창에서는 오른쪽 칸 위로 겹쳐도 길게
  const TOP_SAFE = 86; // 위쪽 바와 겹치지 않는 최소 높이
  // 터미널 이름 칸(부두 위 도로쪽) 바로 위에 길게 띄운다
  const chip = document.querySelector(`.tbox[data-tid="${peek.tid}"]`)?.getBoundingClientRect();
  // 모든 터미널이 같은 크기, 같은 줄(이름 칸 맨 위 줄 바로 위)에 뜬다
  const rowTop = Math.min(...Array.from(document.querySelectorAll('.tbox')).map((el) => el.getBoundingClientRect().top));
  const cTop = rowTop, cBot = chip ? chip.bottom : peek.y;
  // 크기는 모든 터미널이 같다: 위쪽 줄(위쪽 바와 안 겹치게)과 아래쪽 줄(화면 아래로 안 넘치게) 중 더 좁은 쪽에 맞춘다
  const CHROME = 100, SIDE = 66, side = SIDE;
  // 확대해서 이름 칸이 화면 위로 벗어난 경우: 터미널 줄 기준 위치를 쓰지 않고 위쪽 바 바로 아래에 고정한다(바와 겹치지 않게)
  const anchored = rowTop - 10 - TOP_SAFE >= 170;
  const availTop = anchored ? rowTop - 10 - TOP_SAFE : Infinity;
  // 아래 3개 터미널: 위쪽 줄 이름 칸 높이부터(위쪽 터미널 부두와 이름 칸은 가려도 된다)
  const sTids = data.layout.terminals.filter((t) => t.quay === 'S').map((t) => t.id);
  const topRowBottom = Math.max(...sTids.map((id) => document.querySelector(`.tbox[data-tid="${id}"]`)?.getBoundingClientRect().bottom ?? 0));
  const seaTop = !anchored ? TOP_SAFE + 6 : topRowBottom > 0 ? rowTop : peek.seaY; // 이름 칸까지 덮는다(칸 맨 위 높이부터)
  const availBot = window.innerHeight - seaTop - 16;
  const avail = Math.min(availTop, availBot);
  const imgW = (w: number) => (w - side) / 4;
  const SHIFT = 72; // 터미널 가로 순서에 따라 시작점이 이만큼까지 오른쪽으로 밀린다
  let W = Math.min(1320, maxRight - 24 - SHIFT);
  if (CHROME + imgW(W) * (9 / 16) > avail) W = Math.max(520, Math.min(W, 4 * ((avail - CHROME) * 16 / 9) + side));
  const H = h;
  const lefts = Array.from(document.querySelectorAll('.tbox')).map((el) => el.getBoundingClientRect().left);
  const lo = Math.min(...lefts), hi = Math.max(...lefts);
  const frac = hi > lo && chip ? Math.max(0, Math.min(1, (chip.left - lo) / (hi - lo))) : 0; // 0(맨 왼쪽 터미널) ~ 1(맨 오른쪽)
  const left = 12 + SHIFT * frac;
  // 아래쪽 터미널(북쪽 부두)은 위쪽 터미널 줄 바로 아래 바다 자리에 같은 크기로 띄운다
  // 위쪽 줄(HJNC·PNC·PNIT)과 DGT는 이름 칸 위 배후단지 빈 자리, 아래 3개(BCT·BNCT·HPNT)는 위쪽 줄 바로 아래 바다 자리. 크기는 모두 같다
  const southRow = data.layout.terminals.find((t) => t.id === peek.tid)?.quay === 'N';
  const pos = !anchored ? { top: TOP_SAFE + 6 } : southRow ? { top: Math.max(TOP_SAFE, Math.min(seaTop, window.innerHeight - H - 8)) } : { top: Math.max(TOP_SAFE, Math.min(cTop - 10 - H, window.innerHeight - H - 8)) };
  void cBot; void H;
  return (
    <aside ref={boxRef} className="peek" onMouseEnter={peekHold} onMouseLeave={() => peekLeave(150)} style={{ left, width: W, ...pos }} aria-label={`${name} CCTV 병목 상황`}>
      <HeatRow tid={peek.tid} onPick={(i) => selectZone(peek.tid, i)} check />
    </aside>
  );
}
