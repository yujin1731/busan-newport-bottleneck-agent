import { useEffect, useMemo, useRef, useState } from 'react';
import { useUI } from '../store';
import { Icon } from './Icon';
import { fmt } from './bits';
import type { SimStep } from '../data/types';

// 색: 조치 안 함 = 청회색(비교 기준), 조치 후 = 파랑, 혼잡 전가 = 주황 빗금
const C_BASE = '#7c8fb0';
const C_ACT = '#2563eb';
const C_SHIFT = '#f08a24';

// 1시간 단위 평균(10분 × 6)
function hourly(steps: SimStep[], pick: (s: SimStep) => number) {
  return Array.from({ length: 6 }, (_, h) => {
    const seg = steps.slice(h * 6, h * 6 + 7);
    return Math.round(seg.reduce((a, s) => a + pick(s), 0) / seg.length);
  });
}

interface Tip { x: number; y: number; lines: string[] }

// 시간대별 짝 막대: 왼쪽 조치 안 함, 오른쪽 조치 후
function PairBars({ a, b, colorB, hatchB, onTip, unit }: { a: number[]; b: number[]; colorB: string; hatchB?: boolean; onTip: (t: Tip | null) => void; unit: string }) {
  const W = 300, H = 128, padL = 26, padB = 18, padT = 8;
  const max = Math.max(...a, ...b) * 1.1 || 1;
  const ticks = [0, Math.round(max / 2), Math.round(max)];
  const gw = (W - padL) / a.length, bw = Math.min(14, (gw - 10) / 2);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const bar = (x: number, v: number) => {
    const top = y(v), base = H - padB, h = Math.max(0, base - top), r = Math.min(4, h);
    return `M${x} ${base}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + bw - r}Q${x + bw} ${top} ${x + bw} ${top + r}V${base}Z`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rm-svg" role="img" aria-label={`시간대별 ${unit}: 조치 안 함 ${a.join(', ')}, 조치 후 ${b.join(', ')}`}>
      <defs>
        <pattern id="hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
          <rect width="5" height="5" fill={C_SHIFT} fillOpacity="0.35" />
          <rect width="2.2" height="5" fill={C_SHIFT} />
        </pattern>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="rm-grid" />
          <text x={padL - 6} y={y(t) + 3.5} className="rm-tick" textAnchor="end">{t}</text>
        </g>
      ))}
      {a.map((va, i) => {
        const x0 = padL + i * gw + (gw - bw * 2 - 2) / 2;
        return (
          <g
            key={i}
            onMouseMove={(e) => onTip({ x: e.clientX, y: e.clientY, lines: [`+${i}~${i + 1}시간`, `조치 안 함 ${va}${unit}`, `조치 후 ${b[i]}${unit}`] })}
            onMouseLeave={() => onTip(null)}
          >
            <rect x={padL + i * gw} y={padT} width={gw} height={H - padT - padB} fill="transparent" />
            <path d={bar(x0, va)} fill={C_BASE} />
            <path d={bar(x0 + bw + 2, b[i])} fill={hatchB ? 'url(#hatch)' : colorB} />
            <text x={padL + i * gw + gw / 2} y={H - 4} className="rm-tick" textAnchor="middle">+{i + 1}h</text>
          </g>
        );
      })}
    </svg>
  );
}

// 두 값 비교 막대 (선박 지연 위험)
function TwoBars({ from, to, onTip }: { from: number; to: number; onTip: (t: Tip | null) => void }) {
  const W = 140, H = 128, padB = 18, padT = 18;
  const max = 40;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const bw = 34;
  const items = [{ v: from, c: C_BASE, l: '조치 안 함', x: 22 }, { v: to, c: C_ACT, l: '조치 후', x: 84 }];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rm-svg" role="img" aria-label={`선박 지연 위험 ${from}%에서 ${to}%`}>
      <line x1={0} x2={W} y1={H - padB} y2={H - padB} className="rm-grid" />
      {items.map((it) => {
        const top = y(it.v), base = H - padB;
        return (
          <g key={it.l} onMouseMove={(e) => onTip({ x: e.clientX, y: e.clientY, lines: [it.l, `${it.v}%`] })} onMouseLeave={() => onTip(null)}>
            <path d={`M${it.x} ${base}V${top + 4}Q${it.x} ${top} ${it.x + 4} ${top}H${it.x + bw - 4}Q${it.x + bw} ${top} ${it.x + bw} ${top + 4}V${base}Z`} fill={it.c} />
            <text x={it.x + bw / 2} y={top - 5} className="rm-val" textAnchor="middle">{it.v}%</text>
            <text x={it.x + bw / 2} y={H - 4} className="rm-tick" textAnchor="middle">{it.l}</text>
          </g>
        );
      })}
    </svg>
  );
}

// 범위 막대 (추가 비용)
function RangeBar({ lo, hi, v }: { lo: number; hi: number; v: number }) {
  const W = 300, H = 56, a = 0, b = 3000;
  const x = (n: number) => 8 + (W - 16) * ((n - a) / (b - a));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rm-svg" role="img" aria-label={`추가 비용 ${fmt(v)}만 원, 범위 ${fmt(lo)}~${fmt(hi)}만 원`}>
      <line x1={x(a)} x2={x(b)} y1={22} y2={22} className="rm-track" />
      <line x1={x(lo)} x2={x(hi)} y1={22} y2={22} stroke={C_ACT} strokeOpacity="0.3" strokeWidth="10" strokeLinecap="round" />
      <circle cx={x(v)} cy={22} r={6.5} fill={C_ACT} stroke="#fff" strokeWidth="2" />
      {[0, 1000, 2000, 3000].map((t) => <text key={t} x={x(t)} y={48} className="rm-tick" textAnchor="middle">{fmt(t)}</text>)}
    </svg>
  );
}

export function ResultModal() {
  const open = useUI((s) => s.resultOpen);
  const set = useUI((s) => s.set);
  const data = useUI((s) => s.data)!;
  const [tip, setTip] = useState<Tip | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && set({ resultOpen: false });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, set]);

  const charts = useMemo(() => {
    const tot = (s: SimStep) => (s.queue.g_DGT ?? 0) + (s.queue.g_HJNC ?? 0);
    return {
      waitA: hourly(data.simBefore, tot),
      waitB: hourly(data.simAfter, tot),
      hjA: hourly(data.simBefore, (s) => s.queue.g_HJNC ?? 0),
      hjB: hourly(data.simAfter, (s) => s.queue.g_HJNC ?? 0),
    };
  }, [data]);

  if (!open) return null;
  const R = Object.fromEntries(data.result.items.map((r) => [r.id, r]));

  return (
    <div className="rm-overlay" onMouseDown={(e) => e.target === e.currentTarget && set({ resultOpen: false })}>
      <section className="rm card" role="dialog" aria-modal="true" aria-labelledby="rm-title">
        <header className="rm-head">
          <h2 id="rm-title">예상 결과</h2>
          <div className="rm-legend">
            <span><i style={{ background: C_BASE }} />조치 안 함</span>
            <span><i style={{ background: C_ACT }} />조치 후</span>
          </div>
          <button ref={closeRef} className="rm-close" onClick={() => set({ resultOpen: false })} aria-label="닫기"><Icon name="x" size={18} /></button>
        </header>

        <div className="rm-grid">
          <article className="rm-cell rm-wide">
            <div className="rm-k">항만 전체 트럭 대기 <span className="muted">대, 시간대 평균</span></div>
            <div className="rm-v is-good"><Icon name="down" size={16} />{Math.abs(R.wait.value)}%<small>범위 {Math.abs(R.wait.range[1])}~{Math.abs(R.wait.range[0])}% 감소</small></div>
            <PairBars a={charts.waitA} b={charts.waitB} colorB={C_ACT} onTip={setTip} unit="대" />
          </article>

          <article className="rm-cell">
            <div className="rm-k">선박 지연 위험</div>
            <div className="rm-v is-good">{R.ship.from}% → {R.ship.value}%<small>범위 {R.ship.range[0]}~{R.ship.range[1]}%</small></div>
            <TwoBars from={R.ship.from!} to={R.ship.value} onTip={setTip} />
          </article>

          <article className="rm-cell rm-wide">
            <div className="rm-k">혼잡 전가 <span className="muted">HJNC 게이트 대기, 대</span></div>
            <div className="rm-v is-shift">+{R.shift.value}분<small>범위 +{R.shift.range[0]}~+{R.shift.range[1]}분</small></div>
            <PairBars a={charts.hjA} b={charts.hjB} colorB={C_SHIFT} hatchB onTip={setTip} unit="대" />
          </article>

          <article className="rm-cell">
            <div className="rm-k">추가 비용 <span className="muted">만 원</span></div>
            <div className="rm-v">+{fmt(R.cost.value)}<small>{R.cost.note}</small></div>
            <RangeBar lo={R.cost.range[0]} hi={R.cost.range[1]} v={R.cost.value} />
          </article>
        </div>

        <section className="rm-ai">
          <h3><span className="ai-tag">AI 설명</span></h3>
          <ol>{data.action.explain.map((x) => <li key={x}>{x}</li>)}</ol>
        </section>
      </section>
      {tip && (
        <div className="tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 200), top: tip.y + 14 }} role="tooltip">
          <strong>{tip.lines[0]}</strong>
          {tip.lines.slice(1).map((l) => <span key={l}>{l}</span>)}
        </div>
      )}
    </div>
  );
}
