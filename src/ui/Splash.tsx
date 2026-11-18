// 시작 화면: 가운데 Port-J 로고, 둘레를 도는 두 줄의 원. phase가 fade가 되면 서서히 사라진다.
export function Splash({ phase }: { phase: 'on' | 'fade' }) {
  return (
    <div className={`splash ${phase === 'fade' ? 'is-fade' : ''}`} role="status" aria-label="Port-J 불러오는 중">
      <div className="splash-box">
        <svg className="splash-ring" viewBox="0 0 260 260" aria-hidden="true">
          <circle className="arc arc-a" cx="130" cy="130" r="118" />
          <circle className="arc arc-b" cx="130" cy="130" r="100" />
        </svg>
        <img className="splash-logo" src="/port-j-logo.png" alt="" />
      </div>
    </div>
  );
}
