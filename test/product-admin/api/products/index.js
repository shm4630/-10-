import { listProducts, sendJson } from '../../server/productHandlers.js';

// Vercel 함수: GET /api/products
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, { status: 405, body: { error: '허용되지 않은 요청입니다.' } });
    return;
  }
  sendJson(res, await listProducts(process.env));
}
