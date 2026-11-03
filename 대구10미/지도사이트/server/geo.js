// 경계 도형 계산. 좌표는 모두 [경도, 위도] 순서다.

function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(sum / 2);
}

// 섬처럼 조각난 경계는 가장 큰 조각을 구획으로 쓴다.
export function outerRing(geojson) {
  if (geojson?.type === 'Polygon') return geojson.coordinates[0];
  if (geojson?.type === 'MultiPolygon') {
    return geojson.coordinates
      .map((polygon) => polygon[0])
      .reduce((largest, ring) => (ringArea(ring) > ringArea(largest) ? ring : largest));
  }
  return null;
}

export function isInsideRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function boundsOfRing(ring) {
  const lons = ring.map(([lon]) => lon);
  const lats = ring.map(([, lat]) => lat);
  return {
    minLon: Math.min(...lons),
    minLat: Math.min(...lats),
    maxLon: Math.max(...lons),
    maxLat: Math.max(...lats),
  };
}

// 경계가 없는 도로나 지점은 주변을 감싸는 사각형을 구획으로 쓴다.
export function rectangleAround({ minLon, minLat, maxLon, maxLat }, meters) {
  const latMargin = meters / 111320;
  const lonMargin = meters / (111320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
  const west = minLon - lonMargin;
  const east = maxLon + lonMargin;
  const south = minLat - latMargin;
  const north = maxLat + latMargin;
  return [[west, south], [east, south], [east, north], [west, north], [west, south]];
}

export function rectangleToWkt({ minLon, minLat, maxLon, maxLat }) {
  const points = [
    [minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat],
  ];
  return `POLYGON((${points.map(([lon, lat]) => `${lon} ${lat}`).join(',')}))`;
}
