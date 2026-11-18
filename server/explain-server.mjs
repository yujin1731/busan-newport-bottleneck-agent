// 병목 설명서 서버 예시 (진단 화면의 자연어 설명)
//
// 화면은 숫자만 담은 facts(JSON)를 POST 하고, 이 서버가 LLM에게 쪽 목록을 받아 돌려준다.
// - 외부 패키지 없이 Node 내장 기능만 쓴다. (Node 18 이상)
// - API 키는 환경 변수 ANTHROPIC_API_KEY 에만 둔다. 화면(브라우저) 코드에는 키를 넣지 않는다.
// - 응답이 형식에 맞지 않거나 금지어가 있으면 502를 돌려준다. 화면은 그때 기본 문장으로 돌아간다.
//
// 실행:  ANTHROPIC_API_KEY=... node server/explain-server.mjs      (포트 8787)
// 화면:  .env.local 에 VITE_EXPLAIN_URL=/api/explain  (vite.config.ts 가 8787로 넘겨 준다)
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.EXPLAIN_PORT ?? 8787); // PORT는 화면 서버가 쓰는 값이라 따로 둔다
const MODEL = process.env.EXPLAIN_MODEL ?? 'claude-sonnet-5-5';
// 키: 환경 변수, 없으면 프로젝트의 .env.local 에 적힌 ANTHROPIC_API_KEY 한 줄만 읽는다(다른 값은 읽지 않는다)
function loadKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const text = readFileSync(fileURLToPath(new URL('../.env.local', import.meta.url)), 'utf8');
    const line = text.split(/[\r\n]+/).map((l) => l.trim()).find((l) => l.startsWith('ANTHROPIC_API_KEY='));
    return line ? line.slice('ANTHROPIC_API_KEY='.length).trim() || undefined : undefined;
  } catch { return undefined; }
}
const KEY = loadKey();
const MAX_BODY = 20_000; // facts는 작다. 큰 요청은 거절한다.
const BANNED = ['원인', '근거', '분석', '예측']; // 상황 자체와 앞으로의 모습만 쓴다

const SYSTEM = `너는 부산신항 관제 담당자에게 지금 병목 상황을 줄글로 설명하는 설명서 작성자다.
입력은 숫자만 담은 JSON(facts)이다. 아래 순서로 설명서 4쪽을 쓴다.

[쪽 구성(순서 고정)]
1. 제목 '현재 상황': "평상시와 다르게 ~구역에서 ~해서 ~돼서 병목으로 판단했습니다" 흐름의 줄글. 어디서, 무엇이 평소와 얼마나 다른지, 그래서 왜 병목인지(이유)가 한 흐름으로 들어간다.
2. 제목 '판단 이유': 그렇게 판단한 이유를 인과 문장(~해서 ~됩니다)으로 쓴다. 다른 가능성(예: 게이트 자체 문제)이 아닌 이유와, 막힘이 게이트 앞과 배후도로로 번진 과정을 쓴다.
3. 제목 '병목 범위': 구역별 배율(평소 대비)로 어디가 붐비고 어디는 평소 수준인지 쓴다.
4. 제목 '지속 시 영향': "이 상황이 지속된다면 ~됩니다"로 시작하는 문장으로 앞으로의 모습을 쓴다. 대응 화면으로 넘어가라는 안내 문장은 쓰지 않는다(화면의 버튼이 대신한다).

[규칙]
- facts에 있는 숫자와 이름만 쓴다. 없는 숫자, 시각, 터미널, 추정은 만들지 않는다.
- 제목은 위의 명사형 그대로 쓴다(서술형 문장으로 바꾸지 않는다).
- 줄글이다. 목록·표·번호를 쓰지 않는다. 한 쪽은 문단 두 개, 문단마다 두 문장 안쪽으로 쓴다.
- 문장은 존댓말(~습니다, ~됩니다)로 쓴다.
- '원인', '근거', '분석', '예측'이라는 말은 이름표나 문장에 쓰지 않는다. 이유는 '~해서', '~때문에', '~돼서' 같은 연결로 쓴다.
- 핵심 숫자는 **굵게**(별표 두 개) 감싼다.

[출력] JSON만 출력한다. 설명 문장이나 코드 블록을 붙이지 않는다.
{"pages":[{"title":string,"body":string[]}]}  // pages는 정확히 4개, body는 문단 배열`;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
function validFacts(f) {
  return f && typeof f.terminal === 'string' && f.blocks && isNum(f.blocks.occ) && f.gate && isNum(f.gate.queue) && Array.isArray(f.path?.labels) && Array.isArray(f.cctv);
}

function validPages(j) {
  const pages = j?.pages;
  if (!Array.isArray(pages) || pages.length !== 4) return false;
  return pages.every((p) => typeof p.title === 'string' && Array.isArray(p.body) && p.body.every((t) => typeof t === 'string'));
}
const hasBanned = (pages) => { const s = JSON.stringify(pages); return BANNED.some((w) => s.includes(w)); };

async function ask(facts, system = SYSTEM) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, system, messages: [{ role: 'user', content: JSON.stringify({ facts }) }] }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  const j = await r.json();
  const text = (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

// 같은 facts는 다시 부르지 않는다(30초). 화면을 다시 열 때마다 호출 비용이 들지 않게.
const cache = new Map();

const server = createServer(async (req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
  if (req.method !== 'POST' || !req.url?.startsWith('/api/explain')) return send(404, { error: 'not found' });
  if (!KEY) return send(503, { error: 'ANTHROPIC_API_KEY 없음' });
  try {
    const { facts } = JSON.parse(await readBody(req));
    if (!validFacts(facts)) return send(400, { error: 'facts 형식 오류' });
    const key = JSON.stringify(facts);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 30_000) return send(200, hit.body);
    const out = await ask(facts);
    if (!validPages(out) || hasBanned(out.pages)) return send(502, { error: '응답 형식 또는 금지어' });
    cache.set(key, { at: Date.now(), body: out });
    send(200, out);
  } catch (e) {
    // 키·요청 내용은 로그에 남기지 않는다
    console.error('[explain] 실패:', e instanceof Error ? e.message : 'unknown');
    send(502, { error: '설명 생성 실패' });
  }
});

// 이미 켜져 있으면(화면 서버가 함께 켜려 할 때) 조용히 끝낸다
server.on('error', (e) => { if (e.code === 'EADDRINUSE') { console.log(`explain server: ${PORT} 포트가 이미 켜져 있다. 그대로 쓴다.`); process.exit(0); } throw e; });
server.listen(PORT, '127.0.0.1', () => console.log(`explain server: http://127.0.0.1:${PORT}/api/explain  (모델 ${MODEL}, 키 ${KEY ? '있음' : '없음'})`));
