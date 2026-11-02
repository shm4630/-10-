import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// 로컬 개발 서버(productApi.js)와 Vercel 함수(api/)가 함께 쓰는 로직이다.
// 각 함수는 응답으로 보낼 { status, body }를 돌려준다.

const PRODUCT_ID = /^P-[0-9]{4}$/;
const CLIENT_OPTIONS = { auth: { persistSession: false, autoRefreshToken: false } };

export function sendJson(res, { status, body }) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function fail(status, error) {
  return { status, body: { error } };
}

function describeError(error) {
  if (error.code === 'PGRST205' || error.code === '42P01') {
    return 'products 테이블이 없습니다. Supabase에서 schema.sql과 seed.sql을 먼저 실행해 주세요.';
  }
  return `Supabase 오류: ${error.message}`;
}

function isProjectUrl(url) {
  return /^https?:\/\//.test(url);
}

// 다른 웹사이트가 이 API로 삭제 요청을 보내지 못하게 막는다.
function isSameOrigin(origin, host) {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// 길이가 달라도 비교 시간이 같도록 해시를 비교한다.
function isPasswordMatch(input, expected) {
  const hash = (value) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(input), hash(expected));
}

// 브라우저가 한글 비밀번호도 헤더로 보낼 수 있게 인코딩하므로 여기서 되돌린다.
function decodePassword(encoded) {
  try {
    return decodeURIComponent(encoded ?? '');
  } catch {
    return '';
  }
}

export async function listProducts(env) {
  const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey } = env;
  if (!url || !anonKey) {
    return fail(500, '환경 변수 SUPABASE_URL, SUPABASE_ANON_KEY를 입력해 주세요.');
  }
  if (!isProjectUrl(url)) {
    return fail(500, 'SUPABASE_URL에는 Session Pooler 주소가 아니라 프로젝트 URL(https://프로젝트ID.supabase.co)을 입력해 주세요.');
  }

  try {
    // 조회는 anon key(RLS 적용)를 쓴다.
    const { data, error } = await createClient(url, anonKey, CLIENT_OPTIONS)
      .from('products')
      .select('*')
      .order('product_id');
    if (error) return fail(502, describeError(error));
    return { status: 200, body: { products: data } };
  } catch (err) {
    return fail(502, `Supabase에 연결하지 못했습니다: ${err.message}`);
  }
}

export async function deleteProduct(env, { id, encodedPassword, origin, host }) {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey, ADMIN_PASSWORD: adminPassword } = env;
  if (!PRODUCT_ID.test(id)) return fail(404, '없는 경로입니다.');
  if (!isSameOrigin(origin, host)) return fail(403, '허용되지 않은 요청입니다.');

  // 비밀번호가 설정되지 않았으면 삭제를 열어 두지 않고 막는다.
  if (!adminPassword) return fail(503, '환경 변수 ADMIN_PASSWORD가 없어 삭제할 수 없습니다.');
  if (!isPasswordMatch(decodePassword(encodedPassword), adminPassword)) {
    return fail(401, '관리자 비밀번호가 올바르지 않습니다.');
  }

  if (!url || !serviceRoleKey) {
    return fail(500, '환경 변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 입력해 주세요.');
  }
  if (!isProjectUrl(url)) {
    return fail(500, 'SUPABASE_URL에는 Session Pooler 주소가 아니라 프로젝트 URL(https://프로젝트ID.supabase.co)을 입력해 주세요.');
  }

  try {
    // 삭제는 비밀번호를 확인한 뒤에만 service role key로 실행한다.
    const { data, error } = await createClient(url, serviceRoleKey, CLIENT_OPTIONS)
      .from('products')
      .delete()
      .eq('product_id', id)
      .select('product_id');
    if (error) return fail(502, describeError(error));
    if (data.length === 0) return fail(404, '이미 삭제되었거나 없는 상품입니다.');
    return { status: 200, body: { deleted: id } };
  } catch (err) {
    return fail(502, `Supabase에 연결하지 못했습니다: ${err.message}`);
  }
}
