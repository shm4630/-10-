import { createZone, searchStores, sendJson } from './handlers.js';

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

// 로컬 개발 서버(npm run dev)에서 /api를 처리한다. 배포 환경에서는 api/ 폴더의 함수가 대신한다.
export function devApi(env) {
  return {
    name: 'beeple-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/zones', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, { status: 405, body: { error: '허용되지 않은 요청입니다.' } });
          return;
        }
        sendJson(res, await createZone(env, {
          body: await readJson(req),
          origin: req.headers.origin,
          host: req.headers.host,
        }));
      });
      server.middlewares.use('/api/search', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, { status: 405, body: { error: '허용되지 않은 요청입니다.' } });
          return;
        }
        sendJson(res, await searchStores(env, {
          body: await readJson(req),
          origin: req.headers.origin,
          host: req.headers.host,
        }));
      });
    },
  };
}
