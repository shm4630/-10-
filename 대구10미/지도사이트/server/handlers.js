import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { findBoundary, fetchStoresInRing, MAX_STORES } from './collect.js';
import { CATEGORIES, filterRestaurants, parseSearch } from './gemini.js';

// 로컬 개발 서버(devApi.js)와 Vercel 함수(api/)가 함께 쓰는 로직이다.
// 각 함수는 응답으로 보낼 { status, body }를 돌려준다.

const CLIENT_OPTIONS = { auth: { persistSession: false, autoRefreshToken: false } };
const UPSERT_BATCH = 500;
const MAX_INPUT_LENGTH = 40;
const MAX_QUERY_LENGTH = 100;

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
    return '테이블이 없습니다. Supabase에서 supabase/schema.sql을 먼저 실행해 주세요.';
  }
  return `Supabase 오류: ${error.message}`;
}

// 다른 웹사이트가 이 API로 요청을 보내지 못하게 막는다.
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

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function toSlug(area, road) {
  return `${area}-${road}`.replace(/[\s/?#%\\]+/g, '-');
}

async function saveZone(client, { slug, road, area, boundary, stores }) {
  for (let i = 0; i < stores.length; i += UPSERT_BATCH) {
    // beeple_status는 보내지 않으므로 다시 수집해도 사용자 제보가 유지된다.
    const rows = stores.slice(i, i + UPSERT_BATCH).map((store) => ({
      ...store, updated_at: new Date().toISOString(),
    }));
    const { error } = await client.from('stores').upsert(rows, { onConflict: 'biz_id' });
    if (error) throw error;
  }

  const { data: zone, error: zoneError } = await client
    .from('zones')
    .upsert({
      slug,
      road,
      area,
      display_name: boundary.displayName,
      boundary: { type: 'Polygon', coordinates: [boundary.ring] },
      boundary_exact: boundary.exact,
      store_count: stores.length,
    }, { onConflict: 'slug' })
    .select('id')
    .single();
  if (zoneError) throw zoneError;

  const { error: deleteError } = await client.from('zone_stores').delete().eq('zone_id', zone.id);
  if (deleteError) throw deleteError;
  for (let i = 0; i < stores.length; i += UPSERT_BATCH) {
    const links = stores.slice(i, i + UPSERT_BATCH).map((store) => ({
      zone_id: zone.id, biz_id: store.biz_id,
    }));
    const { error } = await client.from('zone_stores').insert(links);
    if (error) throw error;
  }
}

export async function createZone(env, { body, encodedPassword, origin, host }) {
  if (!isSameOrigin(origin, host)) return fail(403, '허용되지 않은 요청입니다.');
  if (!env.ADMIN_PASSWORD) return fail(403, '환경 변수 ADMIN_PASSWORD를 설정해야 구획을 만들 수 있습니다.');
  if (!isPasswordMatch(decodePassword(encodedPassword), env.ADMIN_PASSWORD)) {
    return fail(401, '비밀번호가 맞지 않습니다.');
  }

  const url = env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || !env.DATA_GO_KR_KEY) {
    return fail(500, '환경 변수 VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATA_GO_KR_KEY를 입력해 주세요.');
  }

  const road = cleanText(body?.road);
  const area = cleanText(body?.area);
  if (!road || !area) return fail(400, '구획 이름과 동 이름 또는 지명을 모두 입력해 주세요.');
  if (road.length > MAX_INPUT_LENGTH || area.length > MAX_INPUT_LENGTH) {
    return fail(400, `${MAX_INPUT_LENGTH}자 이내로 입력해 주세요.`);
  }

  try {
    const boundary = await findBoundary(road, area);
    if (!boundary) return fail(404, `"${road}, ${area}"의 위치를 찾지 못했습니다. 동 이름을 확인해 주세요.`);

    const found = await fetchStoresInRing(env.DATA_GO_KR_KEY, boundary.ring);
    if (found.tooLarge) {
      return fail(422, `구획이 너무 넓습니다(약 ${found.total}곳, 최대 ${MAX_STORES}곳). 구나 시 대신 동 이름으로 입력해 주세요.`);
    }

    const filtered = await filterRestaurants(env, found.stores);
    const slug = toSlug(area, road);
    const client = createClient(url, serviceKey, CLIENT_OPTIONS);
    await saveZone(client, { slug, road, area, boundary, stores: filtered.stores });

    return {
      status: 200,
      body: {
        slug,
        storeCount: filtered.stores.length,
        boundaryExact: boundary.exact,
        aiFiltered: filtered.aiFiltered,
        excludedCount: filtered.excludedCount,
      },
    };
  } catch (error) {
    console.error(error);
    return fail(502, error.code ? describeError(error) : error.message);
  }
}

// AI를 쓸 수 없을 때 쓰는 단순 해석. 분류 이름과 단어 일치만 본다.
function parseSearchWithoutAi(query, placeWords) {
  const stopWords = /^(근처|주변|찾기|찾아줘|찾아|맛집|식당|음식점|있는|곳|추천|좀|에서|되는)$/;
  const tokens = query.split(/\s+/).filter(Boolean);
  const categories = CATEGORIES.filter((name) => query.includes(name));
  const keywords = tokens
    .map((token) => token.replace(/(집|점)$/, ''))
    .filter((token) => token.length > 1
      && !stopWords.test(token)
      && !/비플|페이|가능|불가/.test(token)
      && !placeWords.includes(token)
      && !categories.includes(token));
  let status = null;
  if (/비플|페이|가능|불가/.test(query)) status = /불가|안\s?되/.test(query) ? 'unavailable' : 'available';
  return { categories, keywords, status };
}

export async function searchStores(env, { body, origin, host }) {
  if (!isSameOrigin(origin, host)) return fail(403, '허용되지 않은 요청입니다.');
  const query = cleanText(body?.query);
  if (!query) return fail(400, '검색어를 입력해 주세요.');
  if (query.length > MAX_QUERY_LENGTH) return fail(400, `${MAX_QUERY_LENGTH}자 이내로 입력해 주세요.`);

  const placeWords = [cleanText(body?.road), cleanText(body?.area)].filter(Boolean);
  if (env.GEMINI_API_KEY) {
    try {
      return { status: 200, body: { ...(await parseSearch(env, query)), ai: true } };
    } catch (error) {
      console.error(error);
    }
  }
  return { status: 200, body: { ...parseSearchWithoutAi(query, placeWords), ai: false } };
}
