import type { Src } from '../data/types';

export function SrcTag({ s }: { s?: Src }) {
  if (!s) return null;
  return <span className={`src src-${s === '실측' ? 'm' : s === '추정' ? 'e' : 's'}`}>{s}</span>;
}

export const fmt = (n: number) => n.toLocaleString('ko-KR');
export const sign = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));

// 근거 추이: 평소 범위 띠 + 선 + 마지막 점
export function Trend({ series, usual, bad }: { series: number[]; usual: [number, number]; bad: boolean }) {
  const W = 132, H = 36, pad = 3;
  const lo = Math.min(...series, usual[0]), hi = Math.max(...series, usual[1]);
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2);
  const x = (i: number) => pad + (i / (series.length - 1)) * (W - pad * 2);
  const d = series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const last = series[series.length - 1];
  return (
    <svg className="trend" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`최근 12시간 추이, 평소 ${usual[0]}~${usual[1]}`}>
      <rect x={pad} y={y(usual[1])} width={W - pad * 2} height={Math.max(1, y(usual[0]) - y(usual[1]))} className="trend-band" />
      <path d={d} className={bad ? 'trend-line bad' : 'trend-line'} />
      <circle cx={x(series.length - 1)} cy={y(last)} r={2.6} className={bad ? 'trend-dot bad' : 'trend-dot'} />
    </svg>
  );
}
