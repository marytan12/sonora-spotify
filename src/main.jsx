import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Primero los ajustes de la app: el tema y el tamaño del texto se aplican antes de pintar nada
import './settings.js';
import App from './App.jsx';
import './styles.css';
import './nowplaying.css';
import './summary.css';
import './customize.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
