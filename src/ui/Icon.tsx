// 직접 그린 아이콘(선 1.5, 24 격자)
const P: Record<string, JSX.Element> = {
  pin: <path d="M12 21s-6-5.6-6-11a6 6 0 1 1 12 0c0 5.4-6 11-6 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  camera: <><rect x="3" y="7" width="13" height="10" rx="1.5" /><path d="m16 11 5-3v8l-5-3" /></>,
  dot: <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" />,
  ring: <circle cx="12" cy="12" r="6.5" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  wait: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 2" /></>,
  alert: <><path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" /><path d="M12 10v4.5M12 17.2v.3" /></>,
  play: <path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" />,
  pause: <path d="M8 5.5v13M16 5.5v13" strokeWidth="2.6" />,
  replay: <><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4.5 4.5v4h4" /></>,
  arrow: <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  layers: <><path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z" /><path d="m3.5 12.5 8.5 4.5 8.5-4.5" /></>,
  bell: <><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5Z" /><path d="M10 20.5h4" /></>,
  live: <><circle cx="12" cy="12" r="3" fill="currentColor" /><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  history: <><path d="M12 7.5V12l3 2" /><circle cx="12" cy="12" r="8.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5h4" /></>,
  truck: <><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  road: <><path d="M8 3 5 21M16 3l3 18" /><path d="M12 4v3M12 10.5v3M12 17v3" /></>,
  stack: <><rect x="3.5" y="13" width="7.5" height="6" /><rect x="13" y="13" width="7.5" height="6" /><rect x="8.2" y="6" width="7.5" height="6" /></>,
};

export function Icon({ name, size = 16, className }: { name: keyof typeof P | string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}
