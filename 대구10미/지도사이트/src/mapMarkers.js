import L from 'leaflet';

const STATUS_LABEL = { available: '비플페이 가능', unavailable: '비플페이 불가능' };

// 상가 좌표는 건물 단위라 같은 좌표에 여러 식당이 겹친다. 한 마커로 묶어 목록으로 고르게 한다.
export function groupByLocation(stores) {
  const groups = new Map();
  for (const store of stores) {
    const key = `${store.lon},${store.lat}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(store);
  }
  return groups;
}

// 하나라도 가능이면 형광, 모두 불가능이면 회색, 나머지는 기본 표시다.
function groupState(group) {
  if (group.some((store) => store.beeple_status === 'available')) return 'available';
  if (group.every((store) => store.beeple_status === 'unavailable')) return 'unavailable';
  return 'unknown';
}

export function iconSignature(group) {
  return `${groupState(group)}:${group.length}`;
}

export function createIcon(group) {
  const badge = group.length > 1 ? `<span class="pin-count">${group.length}</span>` : '';
  return L.divIcon({
    className: 'pin-wrap',
    html: `<span class="pin pin-${groupState(group)}"></span>${badge}`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -10],
  });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  // 상호는 외부 자료이므로 HTML이 아닌 글자로만 넣는다.
  if (text) node.textContent = text;
  return node;
}

function reportButton(store, status, label, onReport) {
  const button = element('button', `report report-${status}`, label);
  button.type = 'button';
  button.setAttribute('aria-pressed', String(store.beeple_status === status));
  button.addEventListener('click', () => onReport(store.biz_id, status));
  return button;
}

export function createPopup(group, onReport) {
  const root = element('div', 'popup');
  if (group.length > 1) root.append(element('p', 'popup-note', `이 건물의 식당 ${group.length}곳`));

  const list = element('ul', 'popup-list');
  for (const store of group) {
    const item = element('li');
    const name = store.branch ? `${store.name} ${store.branch}` : store.name;
    item.append(element('strong', null, name));
    item.append(element('p', 'popup-meta', [store.category_small, store.floor && `${store.floor}층`].filter(Boolean).join(' · ')));
    item.append(element('p', 'popup-meta', store.address));
    if (store.beeple_status) {
      item.append(element('p', `popup-status status-${store.beeple_status}`, STATUS_LABEL[store.beeple_status]));
    }
    const buttons = element('div', 'report-row');
    buttons.append(
      reportButton(store, 'available', '가능', onReport),
      reportButton(store, 'unavailable', '불가능', onReport),
    );
    item.append(buttons);
    list.append(item);
  }
  root.append(list);
  return root;
}
