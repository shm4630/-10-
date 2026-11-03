import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { createIcon, createPopup, groupByLocation, iconSignature } from './mapMarkers.js';
import { getDeviceId, SETUP_MESSAGE, supabase } from './supabase.js';

const PAGE_SIZE = 1000;

async function loadStores(zoneId) {
  const stores = [];
  // Supabase는 한 번에 최대 1000행을 돌려주므로 나눠서 받는다.
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('zone_stores')
      .select('stores(*)')
      .eq('zone_id', zoneId)
      .order('biz_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    stores.push(...data.map((row) => row.stores));
    if (data.length < PAGE_SIZE) return stores;
  }
}

function matchesFilter(store, filter) {
  if (!filter) return true;
  if (filter.status && store.beeple_status !== filter.status) return false;
  if (filter.categories.length > 0 && !filter.categories.includes(store.category_mid)) return false;
  if (filter.keywords.length > 0) {
    const text = `${store.name} ${store.category_small ?? ''}`;
    if (!filter.keywords.some((word) => text.includes(word))) return false;
  }
  return true;
}

export default function MapPage({ slug }) {
  const [zone, setZone] = useState(null);
  const [stores, setStores] = useState([]);
  const [error, setError] = useState(supabase ? '' : SETUP_MESSAGE);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(null);
  const [searching, setSearching] = useState(false);

  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());

  function mergeStore(next) {
    setStores((current) => current.map((store) => (
      store.biz_id === next.biz_id ? { ...store, ...next } : store
    )));
  }

  const reportRef = useRef(null);
  reportRef.current = async (bizId, status) => {
    setNotice('');
    const { data, error: reportError } = await supabase.rpc('report_beeple', {
      p_biz_id: bizId, p_status: status, p_device_id: getDeviceId(),
    });
    if (reportError) setNotice(reportError.message);
    else mergeStore(data);
  };
  const onReport = (bizId, status) => reportRef.current(bizId, status);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;

    (async () => {
      const { data, error: zoneError } = await supabase
        .from('zones').select('*').eq('slug', slug).maybeSingle();
      if (!active) return;
      if (zoneError) throw zoneError;
      if (!data) {
        setError('없는 구획입니다.');
        return;
      }
      setZone(data);
      const rows = await loadStores(data.id);
      if (active) setStores(rows);
    })().catch((loadError) => {
      if (active) setError(`지도를 불러오지 못했습니다: ${loadError.message}`);
    });

    // 다른 사용자의 제보를 바로 반영한다.
    const channel = supabase
      .channel(`stores-${slug}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stores' }, (payload) => {
        mergeStore(payload.new);
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [slug]);

  useEffect(() => {
    if (!zone || mapRef.current) return undefined;

    const map = L.map(mapElement.current);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자',
    }).addTo(map);
    const boundary = L.geoJSON(zone.boundary, {
      interactive: false,
      style: { color: '#2563eb', weight: 2, fillOpacity: 0.04, dashArray: '6 4' },
    }).addTo(map);
    const fitToZone = () => map.fitBounds(boundary.getBounds(), { padding: [16, 16], animate: false });
    fitToZone();
    mapRef.current = map;

    // 화면 크기가 늦게 정해져도 구획이 꽉 차게 보이도록, 사용자가 조작하기 전까지 다시 맞춘다.
    let userMoved = false;
    const markMoved = () => { userMoved = true; };
    const container = mapElement.current;
    container.addEventListener('pointerdown', markMoved);
    container.addEventListener('wheel', markMoved, { passive: true });
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      if (!userMoved) fitToZone();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      container.removeEventListener('pointerdown', markMoved);
      container.removeEventListener('wheel', markMoved);
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, [zone]);

  const visibleStores = useMemo(
    () => stores.filter((store) => matchesFilter(store, filter)),
    [stores, filter],
  );

  // 팝업이 닫히지 않도록 바뀐 마커만 고친다.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const groups = groupByLocation(visibleStores);
    const markers = markersRef.current;

    for (const [key, entry] of markers) {
      if (!groups.has(key)) {
        entry.marker.remove();
        markers.delete(key);
      }
    }
    for (const [key, group] of groups) {
      const entry = markers.get(key);
      const signature = iconSignature(group);
      if (!entry) {
        const [lon, lat] = key.split(',').map(Number);
        const marker = L.marker([lat, lon], { icon: createIcon(group), title: group[0].name })
          .bindPopup(createPopup(group, onReport), { maxHeight: 320 })
          .addTo(map);
        markers.set(key, { marker, signature });
      } else {
        if (entry.signature !== signature) entry.marker.setIcon(createIcon(group));
        entry.marker.setPopupContent(createPopup(group, onReport));
        entry.signature = signature;
      }
    }
  }, [visibleStores, zone]);

  async function handleSearch(event) {
    event.preventDefault();
    if (!query.trim()) {
      setFilter(null);
      return;
    }
    setSearching(true);
    setNotice('');
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, road: zone?.road, area: zone?.area }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setFilter(result);
    } catch (searchError) {
      setNotice(searchError.message || '검색하지 못했습니다.');
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setQuery('');
    setFilter(null);
  }

  const availableCount = stores.filter((store) => store.beeple_status === 'available').length;
  const unavailableCount = stores.filter((store) => store.beeple_status === 'unavailable').length;

  if (error) {
    return (
      <main className="home">
        <p className="error" role="alert">{error}</p>
        <a href="/">처음으로</a>
      </main>
    );
  }

  return (
    <main className="map-page">
      <header className="map-bar">
        <div className="map-title">
          <a href="/" aria-label="구획 목록으로">←</a>
          <h1>{zone ? `${zone.road} · ${zone.area}` : '불러오는 중…'}</h1>
        </div>
        <form className="search" onSubmit={handleSearch}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="근처 한식집 찾기"
            aria-label="식당 검색"
            maxLength={100}
          />
          <button type="submit" disabled={searching}>{searching ? '찾는 중' : '검색'}</button>
          {filter && <button type="button" className="ghost" onClick={clearSearch}>전체 보기</button>}
        </form>
        <p className="legend">
          <span><i className="dot dot-available" />가능 {availableCount}</span>
          <span><i className="dot dot-unavailable" />불가능 {unavailableCount}</span>
          <span><i className="dot" />전체 {filter ? `${visibleStores.length} / ` : ''}{stores.length}</span>
        </p>
        {zone && !zone.boundary_exact && (
          <p className="notice">이 구획은 경계 정보가 없어 주변 사각형 범위로 표시합니다.</p>
        )}
        {notice && <p className="error" role="alert">{notice}</p>}
      </header>
      <div className="map" ref={mapElement} />
    </main>
  );
}
