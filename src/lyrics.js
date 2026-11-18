// Letras sincronizadas de dos fuentes:
// - LRCLIB (https://lrclib.net): API abierta y con CORS, sincronizada por líneas.
// - NetEase Cloud Music (no oficial, a través de /api/lyrics): por líneas y, en muchas canciones,
//   palabra a palabra, que es lo que permite que el relleno de cada palabra vaya con la voz.
// Se elige la mejor: palabra a palabra si la canción cuadra, si no, LRCLIB exacta, etc.
import { useEffect, useState } from 'react';

const LRCLIB = 'https://lrclib.net/api';
const NETEASE = import.meta.env.VITE_LYRICS_API ?? '/api/lyrics';
const cache = new Map(); // id -> resultado
const inflight = new Map(); // id -> promesa en curso (evita pedir dos veces la misma letra)
const listeners = new Set();

function readStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}
function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento */
  }
}

// ---------- Letra elegida a mano (cuando la automática no cuadra) ----------
// Valor: id de LRCLIB (número) o "ne:ID" para la de NetEase
const PICK_KEY = 'sonora_lyrics_pick';
const picks = readStore(PICK_KEY);

/** Fija la letra elegida para la canción `trackId` (null = volver a la automática) */
export function pickLyrics(trackId, choice) {
  if (choice == null) delete picks[trackId];
  else picks[trackId] = choice;
  writeStore(PICK_KEY, picks);
  cache.delete(trackId);
  inflight.delete(trackId);
  listeners.forEach((f) => f(trackId));
}

// ---------- Sincronía de cada canción (se recuerda) ----------
// Una misma letra puede ir algo adelantada o atrasada respecto a la grabación: el ajuste fino de
// cada canción se suma al general de Ajustes. Positivo = la letra va antes.
const OFFSET_KEY = 'sonora_lyrics_offsets';
const offsets = readStore(OFFSET_KEY);
const offsetListeners = new Set();

export const getSongOffset = (trackId) => (trackId && Number.isFinite(offsets[trackId]) ? offsets[trackId] : 0);
export function setSongOffset(trackId, ms) {
  if (!trackId) return;
  const v = Math.max(-5000, Math.min(5000, Math.round(ms)));
  if (v === 0) delete offsets[trackId];
  else offsets[trackId] = v;
  writeStore(OFFSET_KEY, offsets);
  offsetListeners.forEach((f) => f());
}
export function useSongOffset(trackId) {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    offsetListeners.add(f);
    return () => offsetListeners.delete(f);
  }, []);
  return getSongOffset(trackId);
}

// ---------- Formatos ----------
const stampMs = (m, s, frac) => (Number(m) * 60 + Number(s) + (frac ? Number(`0.${frac}`) : 0)) * 1000;
// Créditos que algunas letras traen como si fueran frases ("作词 : …", "Producer: …")
const CREDIT = /^(作词|作曲|编曲|制作人|混音|母带|和声|吉他|贝斯|鼓|录音|监制|出品|发行|企划|统筹|op|sp|lyrics?|lyricist|composer|producer|arranger|written by|mixed by|mastered by)\s*[:：]/i;

/** Duración de cada palabra: hasta la siguiente (o hasta el final de la frase) */
function closeWords(lines) {
  lines.forEach((l, i) => {
    if (!l.words) return;
    const end = l.end ?? lines[i + 1]?.t ?? l.t + 4000;
    l.words.forEach((w, k) => {
      if (w.d == null) w.d = Math.max(80, (l.words[k + 1]?.t ?? end) - w.t);
    });
  });
  return lines;
}

/** LRC: [mm:ss.xx] por frase y, en el LRC mejorado, <mm:ss.xx> por palabra */
export function parseLrc(lrc) {
  const lines = [];
  // [offset:+/-ms] desplaza todas las marcas (positivo = la letra va antes)
  const offset = Number(lrc.match(/\[offset:\s*([+-]?\d+)\s*\]/i)?.[1] || 0);
  for (const raw of lrc.split(/\r?\n/)) {
    // Admite [mm:ss], [mm:ss.xx] y [mm:ss:xx]
    const stamps = [...raw.matchAll(/\[(\d+):(\d+)(?:[.:](\d+))?\]/g)];
    if (!stamps.length) continue; // etiquetas de metadatos ([ar:], [ti:], …)
    const body = raw.replace(/\[[^\]]*\]/g, '');
    const text = body.replace(/<\d+:\d+(?:[.:]\d+)?>/g, '').replace(/\s+/g, ' ').trim();
    if (CREDIT.test(text)) continue;
    // Marcas por palabra (LRC mejorado)
    const wordStamps = [...body.matchAll(/<(\d+):(\d+)(?:[.:](\d+))?>([^<]*)/g)];
    for (const s of stamps) {
      const t = Math.max(0, stampMs(s[1], s[2], s[3]) - offset);
      const words =
        wordStamps.length > 1 && stamps.length === 1
          ? wordStamps.map((w) => ({ t: Math.max(0, stampMs(w[1], w[2], w[3]) - offset), text: w[4] })).filter((w) => w.text.trim())
          : null;
      lines.push(words?.length ? { t, text, words } : { t, text });
    }
  }
  lines.sort((a, b) => a.t - b.t);
  // Quita huecos vacíos repetidos y un hueco inicial antes de la primera línea con texto
  return closeWords(lines.filter((l, i) => l.text || (i > 0 && lines[i - 1].text)));
}

/** YRC de NetEase: [inicio,duración](inicioPalabra,duraciónPalabra,0)palabra… en milisegundos */
export function parseYrc(yrc) {
  const lines = [];
  for (const raw of yrc.split(/\r?\n/)) {
    const m = raw.match(/^\[(\d+),(\d+)\](.*)$/);
    if (!m) continue; // créditos en JSON y líneas vacías
    const words = m[3]
      .split(/(?=\(\d+,\d+,\d+\))/)
      .map((part) => part.match(/^\((\d+),(\d+),\d+\)([\s\S]*)$/))
      .filter(Boolean)
      .map((w) => ({ t: Number(w[1]), d: Number(w[2]), text: w[3] }))
      .filter((w) => w.text);
    const text = words.map((w) => w.text).join('').replace(/\s+/g, ' ').trim();
    if (!text || CREDIT.test(text)) continue;
    const t = Number(m[1]);
    lines.push({ t, end: t + Number(m[2]), text, words });
  }
  return lines.sort((a, b) => a.t - b.t);
}

const secsOf = (track) => Math.round((track.duration_ms || 0) / 1000);
const cleanName = (name) => name.replace(/\s+-\s+.*$/, '').replace(/\s*\((?:feat|with|ft)\.?[^)]*\)/i, '').trim();

async function getJson(url) {
  const res = await fetch(url);
  if (res.ok) return res.json();
  if (res.status === 404) return null;
  throw new Error(`Letras ${res.status}`); // 429 o caída: error temporal, se podrá reintentar
}

/** Convierte una entrada de LRCLIB en el estado de la letra, con datos para saber si cuadra */
function toResult(data, source, secs) {
  const meta = {
    id: data.id,
    provider: 'lrclib',
    source, // exact | search | manual
    name: data.trackName,
    artist: data.artistName,
    diff: data.duration && secs ? Math.abs(data.duration - secs) : null,
  };
  // Sospechosa: encontrada por búsqueda aproximada o con una duración bastante distinta
  meta.suspicious = source !== 'manual' && (source === 'search' || (meta.diff ?? 0) > 3);
  if (data.instrumental) return { status: 'instrumental', meta };
  if (data.syncedLyrics) {
    const lines = parseLrc(data.syncedLyrics);
    if (lines.length) return { status: 'synced', lines, meta };
  }
  if (data.plainLyrics) return { status: 'plain', lines: data.plainLyrics.split(/\r?\n/).map((text) => ({ text })), meta };
  return { status: 'none', meta };
}

// ---------- NetEase ----------
const normName = (s = '') =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
/** true si el artista de Spotify es exactamente uno de los acreditados en NetEase (no basta con que
 *  un nombre contenga al otro: «Air» no es «Air Supply») */
function sameArtist(spotifyArtist, ne) {
  const a = normName(spotifyArtist);
  if (!a) return false;
  const credits = Array.isArray(ne.artists) ? ne.artists : String(ne.artist || '').split(',');
  return credits.map(normName).includes(a);
}
async function fetchNetease(track, id) {
  const q = id
    ? { id }
    : { name: cleanName(track.name), artist: track.artists?.[0]?.name || '', duration: String(track.duration_ms || 0) };
  const r = await getJson(`${NETEASE}?${new URLSearchParams(q)}`);
  return r?.found ? r : null;
}

/**
 * Estado de la letra a partir de NetEase. `maxDiff`: diferencia de duración admitida (s);
 * `words`: exigir la versión palabra a palabra.
 */
function neteaseResult(ne, source, secs, { maxDiff = 3, words = false, artist = '' } = {}) {
  if (!ne) return null;
  const diff = ne.diff ?? (ne.duration && secs ? Math.abs(ne.duration / 1000 - secs) : null);
  if (source !== 'manual' && (diff == null || diff > maxDiff)) return null;
  if (source !== 'manual' && !sameArtist(artist, ne)) return null;
  const meta = { id: `ne:${ne.id}`, provider: 'netease', source, name: ne.name, artist: ne.artist, diff, suspicious: source !== 'manual' && diff > 3 };
  if (ne.instrumental && !ne.lrc && !ne.yrc) return words ? null : { status: 'instrumental', meta };
  const yrc = ne.yrc ? parseYrc(ne.yrc) : [];
  if (yrc.length > 2) return { status: 'synced', lines: yrc, meta: { ...meta, words: true } };
  if (words) return null;
  const lrc = ne.lrc ? parseLrc(ne.lrc) : [];
  return lrc.length > 2 ? { status: 'synced', lines: lrc, meta } : null;
}

/** La letra de NetEase como candidata para el selector (o null) */
export async function neteaseCandidate(track) {
  const ne = await fetchNetease(track).catch(() => null);
  if (!ne) return null;
  const r = neteaseResult(ne, 'manual', secsOf(track));
  return r?.status === 'synced' ? { id: `ne:${ne.id}`, name: ne.name, artist: ne.artist, diff: ne.diff, words: !!r.meta.words } : null;
}

/** Todas las letras candidatas de LRCLIB para una canción, las más probables primero */
export async function lyricsCandidates(track) {
  const artist = track.artists?.[0]?.name || '';
  const name = cleanName(track.name);
  const secs = secsOf(track);
  const lists = await Promise.all([
    getJson(`${LRCLIB}/search?${new URLSearchParams({ track_name: name, artist_name: artist })}`),
    getJson(`${LRCLIB}/search?${new URLSearchParams({ q: `${name} ${artist}` })}`),
  ]);
  const seen = new Set();
  const all = lists.flat().filter((x) => x && !seen.has(x.id) && seen.add(x.id));
  const close = (x) => Math.abs((x.duration || 0) - secs);
  return all.sort((a, b) => !!b.syncedLyrics - !!a.syncedLyrics || close(a) - close(b)).slice(0, 20);
}

async function fetchLyrics(track) {
  const secs = secsOf(track);
  const picked = picks[track.id];
  if (typeof picked === 'string' && picked.startsWith('ne:')) {
    const r = neteaseResult(await fetchNetease(track, picked.slice(3)).catch(() => null), 'manual', secs);
    if (r) return r;
  } else if (picked) {
    const data = await getJson(`${LRCLIB}/get/${picked}`);
    if (data) return toResult(data, 'manual', secs);
  }

  // Las dos fuentes a la vez; si una falla, se sigue con la otra
  const base = {
    artist_name: track.artists?.[0]?.name || '',
    track_name: track.name,
    album_name: track.album?.name || '',
    duration: String(secs),
  };
  let lrclibError = null;
  const [exact, ne] = await Promise.all([
    getJson(`${LRCLIB}/get?${new URLSearchParams(base)}`).catch((e) => {
      lrclibError = e;
      return null;
    }),
    fetchNetease(track).catch(() => null),
  ]);

  // 1. Palabra a palabra con la misma duración: la sincronía más fina
  const artist = track.artists?.[0]?.name || '';
  const word = neteaseResult(ne, 'netease', secs, { maxDiff: 2, words: true, artist });
  if (word) return word;
  // 2. LRCLIB exacta (por nombre, álbum y duración)
  const ex = exact && toResult(exact, 'exact', secs);
  if (ex && (ex.status === 'synced' || ex.status === 'instrumental')) return ex;
  // 3. NetEase por líneas con la misma duración
  const line = neteaseResult(ne, 'netease', secs, { maxDiff: 3, artist });
  if (line) return line;
  if (ex) return ex; // solo texto, sin sincronizar
  // 4. Búsqueda aproximada en LRCLIB: sin sufijos tipo "- Remastered" y con la duración más parecida
  let list = [];
  try {
    list = (await lyricsCandidates(track)).filter((x) => !secs || !x.duration || Math.abs(x.duration - secs) <= 8);
  } catch (e) {
    lrclibError ||= e;
  }
  const found = list[0] && toResult(list[0], 'search', secs);
  if (found?.status === 'synced') return found;
  // 5. NetEase con una duración algo distinta (se avisa de que puede no ser esta versión)
  const loose = neteaseResult(ne, 'netease', secs, { maxDiff: 8, artist });
  if (loose) return loose;
  if (found) return found;
  if (lrclibError) throw lrclibError; // sin resultado y con un fallo temporal: se podrá reintentar
  return { status: 'none' };
}

/** Carga (o reutiliza) la letra de una canción; comparte la petición si ya está en curso */
function loadLyrics(track) {
  const id = track.id;
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  if (inflight.has(id)) return inflight.get(id);
  const p = fetchLyrics(track)
    .catch(() => ({ status: 'error' }))
    .then((r) => {
      inflight.delete(id);
      if (r.status !== 'error') cache.set(id, r);
      return r;
    });
  inflight.set(id, p);
  return p;
}

// La precarga va de una en una y espaciada para no saturar las fuentes (responden 429 si hay ráfagas)
let prefetchChain = Promise.resolve();
const PREFETCH_GAP_MS = 400;

/** Precarga la letra de una canción de la cola */
export function prefetchLyrics(track) {
  if (track?.type !== 'track' || !track.id || cache.has(track.id) || inflight.has(track.id)) return;
  prefetchChain = prefetchChain
    .then(() => (cache.has(track.id) ? null : loadLyrics(track)))
    .then(() => new Promise((r) => setTimeout(r, PREFETCH_GAP_MS)));
}

/** Vuelve a intentar cargar la letra (tras un error temporal) */
export function retryLyrics(trackId) {
  cache.delete(trackId);
  inflight.delete(trackId);
  listeners.forEach((f) => f(trackId));
}

export function useLyrics(track, enabled) {
  const id = track?.id;
  const [state, setState] = useState({ status: 'idle' });
  const [ver, setVer] = useState(0);
  // Recarga cuando se elige otra letra para esta canción
  useEffect(() => {
    const f = (trackId) => trackId === id && setVer((v) => v + 1);
    listeners.add(f);
    return () => listeners.delete(f);
  }, [id]);
  useEffect(() => {
    if (!enabled || !id) return setState({ status: 'none', id });
    if (track.type !== 'track') return setState({ status: 'episode', id });
    if (cache.has(id)) return setState({ ...cache.get(id), id });
    let alive = true;
    setState({ status: 'loading', id });
    loadLyrics(track).then((r) => alive && setState({ ...r, id }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, enabled, ver]);
  // Al cambiar de canción, no mostrar la letra de la anterior mientras carga la nueva
  return state.id === id ? state : { status: 'loading', id };
}
