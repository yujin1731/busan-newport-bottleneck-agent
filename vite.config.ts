import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';

// 화면 서버(npm run dev)를 켜면 병목 설명서 서버(server/explain-server.mjs)도 함께 켠다.
// 이미 켜져 있으면(포트 사용 중) 조용히 넘어간다. 화면 서버를 끄면 같이 꺼진다.
function explainServer(): Plugin {
  return {
    name: 'explain-server',
    apply: 'serve',
    configureServer(server) {
      const child = spawn(process.execPath, ['server/explain-server.mjs'], { stdio: 'inherit' });
      const stop = () => { if (!child.killed) child.kill(); };
      server.httpServer?.on('close', stop);
      process.on('exit', stop);
    },
  };
}

export default defineConfig({
  plugins: [react(), explainServer()],
  // 병목 설명서 서버로 넘겨 준다. 서버가 응답하지 않으면 화면은 기본 문장을 쓴다.
  server: { proxy: { '/api/explain': 'http://127.0.0.1:8787' } },
});
