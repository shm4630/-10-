import { deleteProduct, listProducts, sendJson } from './productHandlers.js';

// 로컬 개발 서버(npm run dev)에서 /api/products를 처리한다. 배포 환경에서는 api/ 폴더의 함수가 대신한다.
export function productApi(env) {
  return {
    name: 'product-api',
    configureServer(server) {
      server.middlewares.use('/api/products', async (req, res) => {
        const path = new URL(req.url, 'http://localhost').pathname;

        if (req.method === 'GET' && path === '/') {
          sendJson(res, await listProducts(env));
          return;
        }

        if (req.method === 'DELETE') {
          sendJson(res, await deleteProduct(env, {
            id: path.slice(1),
            encodedPassword: req.headers['x-admin-password'],
            origin: req.headers.origin,
            host: req.headers.host,
          }));
          return;
        }

        sendJson(res, { status: 404, body: { error: '없는 경로입니다.' } });
      });
    },
  };
}
