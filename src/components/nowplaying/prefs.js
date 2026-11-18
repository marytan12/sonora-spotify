// Preferencias de la vista Sonando ahora (se guardan en el navegador)
import { useEffect, useState } from 'react';

// ---------- Preferencias ----------
export const PREFS_KEY = 'sonora_np_prefs_v2';
export const DEFAULTS = {
  layout: 'classic', // classic | stage (portada grande) | lyrics (solo letra) | studio (portada pequeña y mucha información)
  theme: 'liquid', // liquid | minimal
  font: 'inter', // inter | montserrat | dot
  shape: 'rounded', // rounded | square | circle
  filter: 'none', // none | grayscale | sepia | vintage | vivid
  accent: 'auto', // auto | #hex
  canvas: 'cover', // none | background | cover | both | portrait
  portraitPos: 'left', // left | center
  blur: 60, // desenfoque del fondo con portada
  canvasBlur: 12, // desenfoque del fondo con Canvas
  dim: 30, // oscurecer el fondo (0-80 %)
  lyrics: 'side', // side | cover | line | none
  lyricSize: 'm', // s | m | l
  lyricAlign: 'left', // left | center
  lyricOffset: 0, // ms: positivo adelanta la letra
  autoHide: false, // ocultar barras tras unos segundos sin mover el ratón
  breathe: true, // fondo que cambia despacio entre los colores de la portada
  breatheSpeed: 'normal', // slow | normal | fast
  bg: 'cover', // cover (portada difuminada) | artist (foto del artista) | gradient | solid
  clockAfter: 0, // minutos sin tocar nada para mostrar el reloj (0 = nunca)
  lyricFill: 'word', // word (palabra a palabra) | line (la línea entera) | none (sin animación)
  lyricFont: 'same', // same (la de la vista) | una de FONTS
  lyricWeight: 'auto', // auto | regular | semibold | bold | black
  lyricColor: 'white', // white | accent
  coverLines: 3, // frases visibles con la letra sobre la portada: 1, 2 o 3
  hidden: [], // elementos ocultos (ver ELEMENTS)
  panel: 'lyrics', // lyrics | queue | devices | credits | settings | none
};
// Elementos que se pueden ocultar desde Ajustes
export const ELEMENTS = [
  ['device', 'Sonando en…'],
  ['actions', 'Me gusta y botones'],
  ['times', 'Tiempos'],
  ['modes', 'Aleatorio y repetir'],
  ['volume', 'Volumen'],
  ['tablabels', 'Nombres de pestañas'],
];
// Valores permitidos: cualquier preferencia antigua (vinilo, temas retirados…) vuelve al valor por defecto
const ALLOWED = {
  layout: ['classic', 'stage', 'lyrics', 'studio'],
  theme: ['liquid', 'minimal'],
  font: ['inter', 'montserrat', 'rounded', 'serif', 'mono', 'dot'],
  shape: ['rounded', 'square', 'circle'],
  filter: ['none', 'grayscale', 'sepia', 'vintage', 'vivid'],
  canvas: ['none', 'background', 'cover', 'both', 'portrait'],
  portraitPos: ['left', 'center'],
  lyrics: ['side', 'cover', 'line', 'none'],
  lyricSize: ['s', 'm', 'l'],
  lyricAlign: ['left', 'center'],
  panel: ['lyrics', 'queue', 'devices', 'credits', 'settings', 'none'],
  breatheSpeed: ['slow', 'normal', 'fast'],
  bg: ['cover', 'artist', 'gradient', 'solid'],
  clockAfter: [0, 1, 3, 5, 10],
  lyricFill: ['word', 'line', 'none'],
  lyricFont: ['same', 'inter', 'montserrat', 'rounded', 'serif', 'mono', 'dot'],
  lyricWeight: ['auto', 'regular', 'semibold', 'bold', 'black'],
  lyricColor: ['white', 'accent'],
  coverLines: [1, 2, 3],
};
export const FONTS = {
  inter: { label: 'Inter', css: "'Inter', sans-serif" },
  montserrat: { label: 'Montserrat', css: "'Montserrat', sans-serif", g: 'Montserrat:wght@400;500;600;700;800;900' },
  rounded: { label: 'Redondeada', css: "'Nunito', sans-serif", g: 'Nunito:wght@400;500;600;700;800;900' },
  serif: { label: 'Con serifa', css: "'Playfair Display', serif", g: 'Playfair+Display:wght@400;500;600;700;800;900' },
  mono: { label: 'Monoespaciada', css: "'JetBrains Mono', monospace", g: 'JetBrains+Mono:wght@400;500;600;700;800' },
  dot: { label: 'Matriz de puntos', css: "'DotGothic16', sans-serif", g: 'DotGothic16' },
};
export const LYRIC_WEIGHTS = { regular: 500, semibold: 600, bold: 800, black: 900 };
export const ACCENTS = ['auto', '#FFFFFF', '#30D158', '#FF453A', '#0A84FF', '#BF5AF2', '#FF9F0A', '#64D2FF'];

function sanitize(p) {
  const n = { ...DEFAULTS, ...p };
  for (const [k, list] of Object.entries(ALLOWED)) if (!list.includes(n[k])) n[k] = DEFAULTS[k];
  for (const [k, lo, hi] of [['blur', 0, 120], ['canvasBlur', 0, 60], ['dim', 0, 80], ['lyricOffset', -2000, 2000]]) {
    n[k] = Number.isFinite(n[k]) ? Math.min(hi, Math.max(lo, n[k])) : DEFAULTS[k];
  }
  if (typeof n.accent !== 'string' || !(n.accent === 'auto' || /^#[0-9a-f]{6}$/i.test(n.accent))) n.accent = 'auto';
  n.autoHide = n.autoHide === true;
  n.breathe = n.breathe !== false;
  n.hidden = Array.isArray(n.hidden) ? n.hidden.filter((k) => ELEMENTS.some(([e]) => e === k)) : [];
  delete n.anim;
  delete n.glassPanel;
  return n;
}

function loadFont(key) {
  const f = FONTS[key];
  if (!f?.g || document.getElementById(`font-${key}`)) return;
  const l = document.createElement('link');
  l.id = `font-${key}`;
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${f.g}&display=swap`;
  document.head.appendChild(l);
}

export function usePrefs() {
  const [prefs, setPrefs] = useState(() => {
    try {
      return sanitize(JSON.parse(localStorage.getItem(PREFS_KEY)));
    } catch {
      return DEFAULTS;
    }
  });
  useEffect(() => loadFont(prefs.font), [prefs.font]);
  useEffect(() => loadFont(prefs.lyricFont), [prefs.lyricFont]);
  const update = (patch) =>
    setPrefs((p) => {
      const n = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(n));
      } catch {
        /* sin almacenamiento */
      }
      return n;
    });
  return [prefs, update];
}

/** Lee las preferencias guardadas sin montar ningún componente (para la precarga) */
export function readPrefs() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(PREFS_KEY)));
  } catch {
    return DEFAULTS;
  }
}

// ---------- Preajustes ----------
// Combinaciones de ajustes con nombre. Las de serie no se pueden borrar; las tuyas se guardan aparte.
// El panel abierto no forma parte de un preajuste.
export const BUILTIN_PRESETS = [
  ['Fiesta', { layout: 'stage', canvas: 'both', breathe: true, breatheSpeed: 'fast', dim: 20, blur: 40, lyrics: 'cover', coverLines: 2, lyricColor: 'accent' }],
  ['Concentración', { layout: 'classic', theme: 'minimal', lyrics: 'none', canvas: 'none', breathe: false, dim: 55, autoHide: true }],
  ['Noche', { layout: 'stage', dim: 70, blur: 90, breatheSpeed: 'slow', lyrics: 'line', clockAfter: 3, accent: '#FF9F0A', filter: 'vintage' }],
  ['Karaoke en casa', { layout: 'lyrics', lyricSize: 'l', lyricColor: 'accent', breatheSpeed: 'normal', dim: 45 }],
  ['Estudio', { layout: 'studio', theme: 'minimal', font: 'mono', lyricFont: 'inter', breathe: false }],
];
const PRESETS_KEY = 'sonora_np_presets_v1';

export function readPresets() {
  try {
    const list = JSON.parse(localStorage.getItem(PRESETS_KEY));
    return Array.isArray(list) ? list.filter((p) => p && typeof p.name === 'string' && p.prefs && typeof p.prefs === 'object').slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function writePresets(list) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* sin almacenamiento */
  }
}

/** Ajustes de un preajuste listos para aplicar (sobre los de serie, sin tocar el panel abierto) */
export function presetPrefs(p, panel) {
  const { panel: _ignored, ...rest } = p;
  return { ...sanitize({ ...DEFAULTS, ...rest }), panel };
}
