import { deleteProduct, sendJson } from '../../server/productHandlers.js';

// Vercel 함수: DELETE /api/products/:id
export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    sendJson(res, { status: 405, body: { error: '허용되지 않은 요청입니다.' } });
    return;
  }
  sendJson(res, await deleteProduct(process.env, {
    id: req.query.id,
    encodedPassword: req.headers['x-admin-password'],
    origin: req.headers.origin,
    host: req.headers.host,
  }));
}
