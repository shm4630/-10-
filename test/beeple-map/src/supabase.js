import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// 값이 없으면 화면에서 안내할 수 있도록 null로 둔다.
export const supabase = url && key
  ? createClient(url, key, { auth: { persistSession: false } })
  : null;

export const SETUP_MESSAGE = 'Supabase 설정이 아직 없습니다. 환경 변수 VITE_SUPABASE_URL을 입력해 주세요.';

// 로그인 없이 제보를 구분하는 기기 식별값. 저장할 수 없는 환경에서는 매번 새로 만든다.
export function getDeviceId() {
  const name = 'beeple-device-id';
  try {
    let id = localStorage.getItem(name);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(name, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
