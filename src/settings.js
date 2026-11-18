// Ajustes de toda la app (se guardan en el navegador): tema, color de acento, densidad, tamaño del
// texto, transparencia del cristal, barra superior, sección de inicio, secciones de Escuchar,
// doble clic, atajos de teclado y volumen. Los de «Sonando ahora» están en nowplaying/prefs.js.
import { useEffect, useState } from 'react';

const KEY = 'sonora_settings_v1';

export const HOME_SECTIONS = [
  ['quick', 'Accesos rápidos'],
  ['recent', 'Escuchado recientemente'],
  ['topTracks', 'Tus canciones más escuchadas'],
  ['topArtists', 'Tus artistas más escuchados'],
  ['playlists', 'Tus playlists'],
];

// [acción, descripción, tecla por defecto]
export const SHORTCUTS = [
  ['toggle', 'Reproducir o pausar', 'Space'],
  ['next', 'Siguiente canción', 'Ctrl+ArrowRight'],
  ['previous', 'Canción anterior', 'Ctrl+ArrowLeft'],
  ['forward', 'Adelantar 10 s', 'ArrowRight'],
  ['back', 'Retroceder 10 s', 'ArrowLeft'],
  ['volUp', 'Subir el volumen', 'Ctrl+ArrowUp'],
  ['volDown', 'Bajar el volumen', 'Ctrl+ArrowDown'],
  ['mute', 'Silenciar', 'M'],
  ['like', 'Me gusta', 'L'],
  ['shuffle', 'Aleatorio', 'S'],
  ['repeat', 'Repetir', 'R'],
  ['nowPlaying', 'Abrir o cerrar Sonando ahora', 'P'],
  ['fullscreen', 'Pantalla completa (en Sonando ahora)', 'F'],
  ['search', 'Buscar', '/'],
];

export const ACCENT_COLORS = ['art', '#FF375F', '#FF9F0A', '#FFD60A', '#30D158', '#64D2FF', '#0A84FF', '#BF5AF2'];
export const TEXT_SIZES = { s: 14.5, m: 16, l: 17.5, xl: 19 };
export const START_PAGES = [
  ['home', 'Escuchar'],
  ['search', 'Buscar'],
  ['library', 'Biblioteca'],
  ['resumen', 'Resumen'],
];

export const DEFAULTS = {
  theme: 'dark', // dark | light | system
  accent: 'art', // art (el color de lo que suena) | #hex
  density: 'comfortable', // comfortable | compact
  textSize: 'm', // s | m | l | xl
  glassClarity: 50, // 0 = cristal más denso … 100 = más transparente
  nav: 'scroll', // scroll (se compacta al bajar) | always | never
  startPage: 'home',
  homeOrder: HOME_SECTIONS.map(([k]) => k),
  homeHidden: [],
  dblClick: 'play', // play | queue
  keys: Object.fromEntries(SHORTCUTS.map(([k, , d]) => [k, d])),
  startVolume: -1, // -1 = no cambiarlo; 0-100 = volumen al abrir la app
  fadeIn: false, // subida suave del volumen al dar play
};

const ALLOWED = {
  theme: ['dark', 'light', 'system'],
  density: ['comfortable', 'compact'],
  textSize: Object.keys(TEXT_SIZES),
  nav: ['scroll', 'always', 'never'],
  startPage: START_PAGES.map(([k]) => k),
  dblClick: ['play', 'queue'],
};

function sanitize(p) {
  const n = { ...DEFAULTS, ...(p && typeof p === 'object' ? p : {}) };
  for (const [k, list] of Object.entries(ALLOWED)) if (!list.includes(n[k])) n[k] = DEFAULTS[k];
  if (!(n.accent === 'art' || /^#[0-9a-f]{6}$/i.test(n.accent))) n.accent = 'art';
  n.glassClarity = Number.isFinite(n.glassClarity) ? Math.min(100, Math.max(0, n.glassClarity)) : DEFAULTS.glassClarity;
  n.startVolume = Number.isFinite(n.startVolume) ? Math.min(100, Math.max(-1, Math.round(n.startVolume))) : -1;
  n.fadeIn = n.fadeIn === true;
  // Orden de las secciones: las que falten (secciones nuevas) se añaden al final
  const known = HOME_SECTIONS.map(([k]) => k);
  const order = Array.isArray(n.homeOrder) ? n.homeOrder.filter((k, i, a) => known.includes(k) && a.indexOf(k) === i) : [];
  n.homeOrder = [...order, ...known.filter((k) => !order.includes(k))];
  n.homeHidden = Array.isArray(n.homeHidden) ? n.homeHidden.filter((k) => known.includes(k)) : [];
  const keys = {};
  for (const [k, , d] of SHORTCUTS) keys[k] = typeof n.keys?.[k] === 'string' ? n.keys[k] : d;
  n.keys = keys;
  return n;
}

function read() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return sanitize(null);
  }
}

let settings = read();
const listeners = new Set();
const mqLight = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: light)') : null;

export const readSettings = () => settings;
export const isLight = () => settings.theme === 'light' || (settings.theme === 'system' && !!mqLight?.matches);
export const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

/** Aplica al documento lo que se resuelve con CSS: tema, densidad, tamaño del texto y cristal */
function apply() {
  const root = document.documentElement;
  const light = isLight();
  root.classList.toggle('theme-light', light);
  root.classList.toggle('density-compact', settings.density === 'compact');
  root.style.colorScheme = light ? 'light' : 'dark';
  root.style.fontSize = `${TEXT_SIZES[settings.textSize]}px`;
  // Transparencia del cristal: más transparente = menos tinte y menos desenfoque
  const t = settings.glassClarity / 100;
  root.style.setProperty('--glass-k', (1.6 - 1.2 * t).toFixed(2));
  root.style.setProperty('--glass-blur', `${Math.round(20 - 16 * t)}px`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f5f5f7' : '#121216');
  listeners.forEach((f) => f());
}

export function setSettings(patch) {
  settings = sanitize({ ...settings, ...(typeof patch === 'function' ? patch(settings) : patch) });
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* sin almacenamiento: se aplica solo en esta sesión */
  }
  apply();
}

export const resetSettings = () => setSettings(DEFAULTS);

if (typeof window !== 'undefined') {
  mqLight?.addEventListener?.('change', apply);
  // Otra pestaña de Sonora ha cambiado los ajustes
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    settings = read();
    apply();
  });
  apply();
}

/** Ajustes actuales; el componente se vuelve a pintar cuando cambian */
export function useSettings() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => listeners.delete(f);
  }, []);
  return [settings, setSettings];
}
