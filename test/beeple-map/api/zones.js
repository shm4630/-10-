import { createZone, sendJson } from '../server/handlers.js';

// Vercel 함수: POST /api/zones (관리자 비밀번호 필요)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, { status: 405, body: { error: '허용되지 않은 요청입니다.' } });
    return;
  }
  sendJson(res, await createZone(process.env, {
    body: req.body,
    encodedPassword: req.headers['x-admin-password'],
    origin: req.headers.origin,
    host: req.headers.host,
  }));
}
