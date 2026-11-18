// Letras sincronizadas desde LRCLIB (https://lrclib.net), API abierta y con CORS.
import { useEffect, useState } from 'react';

const LRCLIB = 'https://lrclib.net/api';
const cache = new Map(); // id -> resultado
const inflight = new Map(); // id -> promesa en curso (evita pedir dos veces la misma letra)

// ---------- Letra elegida a mano (cuando la automática no cuadra) ----------
const PICK_KEY = 'sonora_lyrics_pick';
let picks = {};
try {
  picks = JSON.parse(localStorage.getItem(PICK_KEY)) || {};
} catch {
  /* sin almacenamiento */
}
const listeners = new Set();

/** Fija la letra de LRCLIB `lrclibId` para la canción `trackId` (null = volver a la automática) */
export function pickLyrics(trackId, lrclibId) {
  if (lrclibId == null) delete picks[trackId];
  else picks[trackId] = lrclibId;
  try {
    localStorage.setItem(PICK_KEY, JSON.stringify(picks));
  } catch {
    /* sin almacenamiento */
  }
  cache.delete(trackId);
  inflight.delete(trackId);
  listeners.forEach((f) => f(trackId));
}

function parseLrc(lrc) {
  const lines = [];
  // [offset:+/-ms] desplaza todas las marcas (positivo = la letra va antes)
  const offset = Number(lrc.match(/\[offset:\s*([+-]?\d+)\s*\]/i)?.[1] || 0);
  for (const raw of lrc.split(/\r?\n/)) {
    // Admite [mm:ss], [mm:ss.xx] y [mm:ss:xx]
    const stamps = [...raw.matchAll(/\[(\d+):(\d+)(?:[.:](\d+))?\]/g)];
    if (!stamps.length) continue; // etiquetas de metadatos ([ar:], [ti:], …)
    const text = raw
      .replace(/\[[^\]]*\]/g, '')
      .replace(/<\d+:\d+(?:[.:]\d+)?>/g, '') // marcas por palabra del LRC mejorado
      .replace(/\s+/g, ' ')
      .trim();
    for (const s of stamps) {
      const frac = s[3] ? Number(`0.${s[3]}`) : 0;
      lines.push({ t: Math.max(0, (Number(s[1]) * 60 + Number(s[2]) + frac) * 1000 - offset), text });
    }
  }
  lines.sort((a, b) => a.t - b.t);
  // Quita huecos vacíos repetidos y un hueco inicial antes de la primera línea con texto
  return lines.filter((l, i) => l.text || (i > 0 && lines[i - 1].text));
}

const secsOf = (track) => Math.round((track.duration_ms || 0) / 1000);
const cleanName = (name) => name.replace(/\s+-\s+.*$/, '').replace(/\s*\((?:feat|with|ft)\.?[^)]*\)/i, '').trim();

async function getJson(url) {
  const res = await fetch(url);
  if (res.ok) return res.json();
  if (res.status === 404) return null;
  throw new Error(`LRCLIB ${res.status}`); // 429 o caída: error temporal, se podrá reintentar
}

/** Convierte una entrada de LRCLIB en el estado de la letra, con datos para saber si cuadra */
function toResult(data, source, secs) {
  const meta = {
    id: data.id,
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

/** Todas las letras candidatas para una canción, las más probables primero */
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
  if (picked) {
    const data = await getJson(`${LRCLIB}/get/${picked}`);
    if (data) return toResult(data, 'manual', secs);
  }
  const base = {
    artist_name: track.artists?.[0]?.name || '',
    track_name: track.name,
    album_name: track.album?.name || '',
    duration: String(secs),
  };
  const exact = await getJson(`${LRCLIB}/get?${new URLSearchParams(base)}`);
  if (exact) return toResult(exact, 'exact', secs);
  // Búsqueda aproximada: sin sufijos tipo "- Remastered" y con la duración más parecida
  const list = (await lyricsCandidates(track)).filter((x) => !secs || !x.duration || Math.abs(x.duration - secs) <= 8);
  return list[0] ? toResult(list[0], 'search', secs) : { status: 'none' };
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

// La precarga va de una en una y espaciada para no saturar LRCLIB (responde 429 si hay ráfagas)
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
