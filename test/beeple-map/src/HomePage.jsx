import { useEffect, useState } from 'react';
import { SETUP_MESSAGE, supabase } from './supabase.js';

export default function HomePage() {
  const [zones, setZones] = useState([]);
  const [listError, setListError] = useState(supabase ? '' : SETUP_MESSAGE);
  const [road, setRoad] = useState('');
  const [area, setArea] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('zones')
      .select('slug, road, area, store_count, boundary_exact')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setListError(`구획 목록을 불러오지 못했습니다: ${error.message}`);
        else setZones(data);
      });
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const response = await fetch('/api/zones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': encodeURIComponent(password),
        },
        body: JSON.stringify({ road, area }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.href = `/map/${encodeURIComponent(result.slug)}`;
    } catch (error) {
      setFormError(error.message || '구획을 만들지 못했습니다.');
      setBusy(false);
    }
  }

  return (
    <main className="home">
      <header>
        <h1>비플페이 지도</h1>
        <p>우리 동네 식당의 비플페이 사용 가능 여부를 함께 표시하는 지도입니다.</p>
      </header>

      <section aria-labelledby="zones-title">
        <h2 id="zones-title">구획 지도</h2>
        {listError && <p className="error" role="alert">{listError}</p>}
        {!listError && zones.length === 0 && <p className="muted">아직 만들어진 구획이 없습니다.</p>}
        <ul className="zone-list">
          {zones.map((zone) => (
            <li key={zone.slug}>
              <a href={`/map/${encodeURIComponent(zone.slug)}`}>
                <strong>{zone.road}</strong>
                <span className="muted">{zone.area} · 식당 {zone.store_count.toLocaleString()}곳</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="create-title">
        <h2 id="create-title">새 구획 만들기</h2>
        <form className="zone-form" onSubmit={handleSubmit}>
          <label>
            구획 이름
            <input value={road} onChange={(e) => setRoad(e.target.value)} placeholder="을지로" maxLength={40} required />
          </label>
          <label>
            동 이름 또는 지명
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="을지로동" maxLength={40} required />
          </label>
          <label>
            관리자 비밀번호
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? '식당 정보를 모으는 중입니다…' : '지도 만들기'}
          </button>
          {formError && <p className="error" role="alert">{formError}</p>}
        </form>
      </section>

      <footer className="muted">
        식당 정보: 소상공인시장진흥공단 상가(상권)정보 · 지도: © OpenStreetMap 기여자
      </footer>
    </main>
  );
}
