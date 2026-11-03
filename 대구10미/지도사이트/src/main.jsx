import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import MapPage from './MapPage.jsx';
import 'leaflet/dist/leaflet.css';
import './App.css';

// 주소에 구획이 없으면 가장 최근 구획의 지도를 바로 보여준다.
const mapPath = window.location.pathname.match(/^\/map\/([^/]+)/);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MapPage slug={mapPath ? decodeURIComponent(mapPath[1]) : null} />
  </StrictMode>,
);
