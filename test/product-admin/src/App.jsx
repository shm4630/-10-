import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// 검색 대상 필드
const SEARCH_FIELDS = ['product_id', 'product_name', 'category', 'origin', 'allergen'];

// 상세 패널에 표시할 필드 (표시명, 컬럼명)
const DETAIL_FIELDS = [
  ['제품코드', 'product_id'],
  ['카테고리', 'category'],
  ['규격', 'spec'],
  ['판매가', 'sale_price'],
  ['원산지', 'origin'],
  ['보관방법', 'storage'],
  ['알레르기', 'allergen'],
  ['주의사항', 'caution'],
  ['판매시기', 'season'],
  ['판매상태', 'status'],
  ['비고', 'note'],
  ['등록일', 'created_at'],
  ['수정일', 'updated_at'],
];

function formatValue(field, value) {
  if (value === null || value === undefined || value === '') return '-';
  if (field === 'sale_price') return `${value.toLocaleString('ko-KR')}원`;
  if (field === 'created_at' || field === 'updated_at') {
    return new Date(value).toLocaleString('ko-KR');
  }
  return value;
}

async function requestJson(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `요청에 실패했습니다. (${res.status})`);
  return body;
}

function DeleteDialog({ product, deleting, error, onCancel, onConfirm }) {
  const passwordRef = useRef(null);
  const [password, setPassword] = useState('');

  useEffect(() => {
    passwordRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && !deleting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleting, onCancel]);

  return (
    <div className="overlay">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-desc">
        <h2 id="delete-title">상품을 삭제할까요?</h2>
        <p id="delete-desc">
          <strong>{product.product_name}</strong> ({product.product_id})이 Supabase에서 삭제됩니다.
          삭제하면 되돌릴 수 없습니다.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(password);
          }}
        >
          <label className="password-field" htmlFor="admin-password">관리자 비밀번호</label>
          <input
            id="admin-password"
            ref={passwordRef}
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={deleting}
            required
          />
          {error && <p className="error-text" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button type="button" onClick={onCancel} disabled={deleting}>취소</button>
            <button type="submit" className="danger" disabled={deleting || !password}>
              {deleting ? '삭제 중...' : '삭제'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetailPanel({ product, onClose, onDelete }) {
  return (
    <aside className="detail" aria-labelledby="detail-title">
      <div className="detail-head">
        <h2 id="detail-title">{product.product_name}</h2>
        <button type="button" onClick={onClose}>닫기</button>
      </div>
      <dl>
        {DETAIL_FIELDS.map(([label, field]) => (
          <div key={field}>
            <dt>{label}</dt>
            <dd>{formatValue(field, product[field])}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="danger" onClick={() => onDelete(product)}>이 상품 삭제</button>
    </aside>
  );
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { products: rows } = await requestJson('/api/products');
      setProducts(rows);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      SEARCH_FIELDS.some((f) => (p[f] ?? '').toLowerCase().includes(q)),
    );
  }, [products, query]);

  const selected = products.find((p) => p.product_id === selectedId) ?? null;

  const openDelete = (product) => {
    setDeleteError('');
    setMessage('');
    setDeleteTarget(product);
  };

  const closeDelete = useCallback(() => setDeleteTarget(null), []);

  const confirmDelete = async (password) => {
    const target = deleteTarget;
    setDeleting(true);
    setDeleteError('');
    try {
      await requestJson(`/api/products/${encodeURIComponent(target.product_id)}`, {
        method: 'DELETE',
        // 헤더에는 한글을 그대로 넣을 수 없어 인코딩한다.
        headers: { 'X-Admin-Password': encodeURIComponent(password) },
      });
      setDeleteTarget(null);
      setMessage(`${target.product_name} 상품을 삭제했습니다.`);
      if (selectedId === target.product_id) setSelectedId(null);
      await load();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>상품 관리</h1>
        <button type="button" onClick={load} disabled={loading}>새로고침</button>
      </header>

      <div className="search">
        <label htmlFor="search">상품 검색</label>
        <input
          id="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제품명, 코드, 카테고리, 원산지, 알레르기"
        />
      </div>

      <p className="status-line" role="status">
        {message || (!loading && !loadError && (query.trim()
          ? `전체 ${products.length}개 중 ${filtered.length}개`
          : `전체 ${products.length}개`))}
      </p>

      {loadError && (
        <div className="notice" role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={load}>다시 시도</button>
        </div>
      )}

      {loading && products.length === 0 && !loadError && <p className="empty">불러오는 중...</p>}

      {!loadError && !loading && filtered.length === 0 && (
        <p className="empty">{query.trim() ? '검색 결과가 없습니다.' : '등록된 상품이 없습니다.'}</p>
      )}

      <div className={selected ? 'content has-detail' : 'content'}>
        {!loadError && filtered.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">코드</th>
                  <th scope="col">제품명</th>
                  <th scope="col">카테고리</th>
                  <th scope="col">규격</th>
                  <th scope="col" className="num">판매가</th>
                  <th scope="col">알레르기</th>
                  <th scope="col"><span className="sr-only">삭제</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.product_id} className={p.product_id === selectedId ? 'selected' : undefined}>
                    <td className="code">{p.product_id}</td>
                    <td>
                      <button type="button" className="link" onClick={() => setSelectedId(p.product_id)}>
                        {p.product_name}
                      </button>
                    </td>
                    <td>{formatValue('category', p.category)}</td>
                    <td>{formatValue('spec', p.spec)}</td>
                    <td className="num">{formatValue('sale_price', p.sale_price)}</td>
                    <td>{formatValue('allergen', p.allergen)}</td>
                    <td>
                      <button
                        type="button"
                        className="danger-text"
                        aria-label={`${p.product_name} 삭제`}
                        onClick={() => openDelete(p)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selected && (
          <DetailPanel product={selected} onClose={() => setSelectedId(null)} onDelete={openDelete} />
        )}
      </div>

      {deleteTarget && (
        <DeleteDialog
          product={deleteTarget}
          deleting={deleting}
          error={deleteError}
          onCancel={closeDelete}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
