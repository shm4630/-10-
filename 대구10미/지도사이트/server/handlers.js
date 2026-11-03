import { createClient } from '@supabase/supabase-js';
import { findBoundary, fetchStoresInRing, MAX_STORES } from './collect.js';
import { CATEGORIES, filterRestaurants, parseSearch } from './gemini.js';

// 로컬 개발 서버(devApi.js)와 Vercel 함수(api/)가 함께 쓰는 로직이다.
// 각 함수는 응답으로 보낼 { status, body }를 돌려준다.

const CLIENT_OPTIONS = { auth: { persistSession: false, autoRefreshToken: false } };
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

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function toSlug(area, road) {
  return `${area}-${road}`.replace(/[\s/?#%\\]+/g, '-');
}

// 저장은 서버만 아는 토큰을 확인하는 DB 함수로 한다. 사용자 제보는 함수 안에서 유지된다.
async function saveZone(client, token, { slug, road, area, boundary, stores }) {
  const { error } = await client.rpc('save_zone', {
    p_token: token,
    p_slug: slug,
    p_road: road,
    p_area: area,
    p_display_name: boundary.displayName,
    p_boundary: { type: 'Polygon', coordinates: [boundary.ring] },
    p_boundary_exact: boundary.exact,
    p_stores: stores,
  });
  if (error) throw error;
}

export async function createZone(env, { body, origin, host }) {
  if (!isSameOrigin(origin, host)) return fail(403, '허용되지 않은 요청입니다.');

  const url = env.VITE_SUPABASE_URL;
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey || !env.ZONE_WRITE_TOKEN || !env.DATA_GO_KR_KEY) {
    return fail(500, '환경 변수 VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, ZONE_WRITE_TOKEN, DATA_GO_KR_KEY를 입력해 주세요.');
  }

  const road = cleanText(body?.road);
  const area = cleanText(body?.area);
  if (!road || !area) return fail(400, '구획 이름과 동 이름 또는 지명을 모두 입력해 주세요.');
  if (road.length > MAX_INPUT_LENGTH || area.length > MAX_INPUT_LENGTH) {
    return fail(400, `${MAX_INPUT_LENGTH}자 이내로 입력해 주세요.`);
  }

  try {
    const client = createClient(url, publishableKey, CLIENT_OPTIONS);
    const slug = toSlug(area, road);

    // 누구나 요청할 수 있으므로 이미 있는 구획은 다시 수집하지 않는다.
    const { data: existing, error: existingError } = await client
      .from('zones').select('slug, store_count').eq('slug', slug).maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return { status: 200, body: { slug, storeCount: existing.store_count, existed: true } };
    }

    const boundary = await findBoundary(road, area);
    if (!boundary) return fail(404, `"${road}, ${area}"의 위치를 찾지 못했습니다. 동 이름을 확인해 주세요.`);

    const found = await fetchStoresInRing(env.DATA_GO_KR_KEY, boundary.ring);
    if (found.tooLarge) {
      return fail(422, `구획이 너무 넓습니다(약 ${found.total}곳, 최대 ${MAX_STORES}곳). 구나 시 대신 동 이름으로 입력해 주세요.`);
    }

    const filtered = await filterRestaurants(env, found.stores);
    await saveZone(client, env.ZONE_WRITE_TOKEN, { slug, road, area, boundary, stores: filtered.stores });

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
