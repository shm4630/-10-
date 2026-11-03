import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import HomePage from './HomePage.jsx';
import MapPage from './MapPage.jsx';
import 'leaflet/dist/leaflet.css';
import './App.css';

const mapPath = window.location.pathname.match(/^\/map\/([^/]+)/);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {mapPath ? <MapPage slug={decodeURIComponent(mapPath[1])} /> : <HomePage />}
  </StrictMode>,
);
