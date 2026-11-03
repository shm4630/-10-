import { boundsOfRing, isInsideRing, outerRing, rectangleAround, rectangleToWkt } from './geo.js';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const STORE_API_URL = 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInPolygon';
const USER_AGENT = 'beeple-map/0.1 (https://github.com/shm4630)';
const FOOD_CATEGORY = 'I2';
const PAGE_SIZE = 1000;
// 함수 실행 시간 안에 처리할 수 있는 범위로 제한한다.
export const MAX_STORES = 5000;
const APPROX_MARGIN_METERS = 200;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function searchNominatim(query) {
  const params = new URLSearchParams({
    q: query, format: 'jsonv2', polygon_geojson: '1', countrycodes: 'kr', limit: '5',
  });
  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ko' },
  });
  if (!response.ok) throw new Error(`구획 검색에 실패했습니다. (HTTP ${response.status})`);
  return response.json();
}

// 경계 폴리곤을 우선 찾고, 없으면 도로나 지점 주변 사각형을 구획으로 쓴다.
export async function findBoundary(road, area) {
  const queries = [`${road}, ${area}`, area];
  let fallback = null;

  for (const [index, query] of queries.entries()) {
    // Nominatim 이용 정책: 초당 1건 이하
    if (index > 0) await wait(1100);
    const results = await searchNominatim(query);
    const exact = results.find((item) => outerRing(item.geojson));
    if (exact) {
      return { ring: outerRing(exact.geojson), exact: true, displayName: exact.display_name };
    }
    fallback ??= results[0];
  }

  if (!fallback) return null;
  const [south, north, west, east] = fallback.boundingbox.map(Number);
  return {
    ring: rectangleAround(
      { minLon: west, minLat: south, maxLon: east, maxLat: north },
      APPROX_MARGIN_METERS,
    ),
    exact: false,
    displayName: fallback.display_name,
  };
}

async function fetchStorePage(serviceKey, wkt, pageNo) {
  const query = new URLSearchParams({
    pageNo: String(pageNo),
    numOfRows: String(PAGE_SIZE),
    key: wkt,
    indsLclsCd: FOOD_CATEGORY,
    type: 'json',
  });
  // 인증키는 포털에서 받은 형태 그대로 보낸다.
  const response = await fetch(`${STORE_API_URL}?serviceKey=${serviceKey}&${query}`);
  if (!response.ok) throw new Error(`식당 정보 조회에 실패했습니다. (HTTP ${response.status})`);
  const data = await response.json();
  const code = data.header?.resultCode;
  if (code === '03') return { total: 0, items: [] }; // 03: 결과 없음
  if (code !== '00') throw new Error(`식당 정보 조회에 실패했습니다. (${data.header?.resultMsg ?? code})`);
  return { total: Number(data.body.totalCount), items: data.body.items };
}

// 사각형으로 넉넉히 조회한 뒤 실제 경계 안에 있는 곳만 남긴다.
export async function fetchStoresInRing(serviceKey, ring) {
  const wkt = rectangleToWkt(boundsOfRing(ring));
  const first = await fetchStorePage(serviceKey, wkt, 1);
  if (first.total > MAX_STORES) {
    return { tooLarge: true, total: first.total, stores: [] };
  }

  const pageCount = Math.ceil(first.total / PAGE_SIZE);
  const rest = await Promise.all(
    Array.from({ length: Math.max(pageCount - 1, 0) }, (_, i) => fetchStorePage(serviceKey, wkt, i + 2)),
  );
  const items = [first, ...rest].flatMap((page) => page.items);

  return {
    tooLarge: false,
    total: first.total,
    stores: items
      .filter((item) => isInsideRing([Number(item.lon), Number(item.lat)], ring))
      .map(toStoreRow),
  };
}

function toStoreRow(item) {
  return {
    biz_id: item.bizesId,
    name: item.bizesNm,
    branch: item.brchNm || null,
    category_mid: item.indsMclsNm || null,
    category_small: item.indsSclsNm || null,
    address: item.rdnmAdr || item.lnoAdr || null,
    floor: item.flrNo || null,
    lon: Number(item.lon),
    lat: Number(item.lat),
  };
}
