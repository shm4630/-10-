import { searchStores, sendJson } from '../server/handlers.js';

// Vercel 함수: POST /api/search
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, { status: 405, body: { error: '허용되지 않은 요청입니다.' } });
    return;
  }
  sendJson(res, await searchStores(process.env, {
    body: req.body,
    origin: req.headers.origin,
    host: req.headers.host,
  }));
}
