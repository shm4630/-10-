import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { devApi } from './server/devApi.js';

export default defineConfig(({ mode }) => {
  // VITE_ 접두사 없이 읽은 값은 브라우저 코드에 포함되지 않고 로컬 서버에서만 쓰인다.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), devApi(env)],
    server: {
      host: '127.0.0.1',
      port: 5174,
      cors: false,
    },
  };
});
