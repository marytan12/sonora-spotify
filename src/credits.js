// Créditos de una canción: compositores, productores, músicos… desde MusicBrainz
// (https://musicbrainz.org, API abierta con CORS). La Web API de Spotify no los ofrece.
import { useEffect, useState } from 'react';

const MB = 'https://musicbrainz.org/ws/2';
const cache = new Map();
const inflight = new Map();

// MusicBrainz pide como máximo una petición por segundo
let last = 0;
async function mb(path, query, retry = true) {
  const wait = Math.max(0, last + 1100 - Date.now());
  last = Date.now() + wait;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(`${MB}/${path}?${new URLSearchParams({ fmt: 'json', ...query })}`);
  // 503 = servidor saturado o demasiadas peticiones: un reintento tras una pausa
  if (res.status === 503 && retry) {
    await new Promise((r) => setTimeout(r, 2000));
    return mb(path, query, false);
  }
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
  return res.json();
}

const esc = (s) => s.replace(/(["\\])/g, '\\$1');
const cleanName = (name) => name.replace(/\s+-\s+.*$/, '').replace(/\s*\((?:feat|with|ft)\.?[^)]*\)/i, '').trim();

/** La grabación con la duración más parecida a la de Spotify (y no más de 10 s de diferencia) */
function closest(recordings, ms) {
  const scored = (recordings || [])
    .map((r) => ({ r, d: r.length ? Math.abs(r.length - ms) : 5000 }))
    .filter((x) => x.d <= 10_000)
    .sort((a, b) => a.d - b.d);
  return scored[0]?.r || null;
}

async function findRecording(track) {
  const isrc = track.external_ids?.isrc;
  if (isrc) {
    const d = await mb(`isrc/${encodeURIComponent(isrc)}`, {}).catch(() => null);
    const r = closest(d?.recordings, track.duration_ms);
    if (r) return r;
  }
  const artist = track.artists?.[0]?.name || '';
  const d = await mb('recording', { query: `recording:"${esc(cleanName(track.name))}" AND artist:"${esc(artist)}"`, limit: '15' });
  return closest(d.recordings?.filter((r) => (r.score ?? 100) >= 80), track.duration_ms);
}

// Orden y nombre en español de cada papel
const ROLES = [
  ['composer', 'Composición'],
  ['lyricist', 'Letra'],
  ['writer', 'Autoría'],
  ['arranger', 'Arreglos'],
  ['producer', 'Producción'],
  ['vocal', 'Voz'],
  ['instrument', 'Instrumentos'],
  ['performer', 'Intérpretes'],
  ['programming', 'Programación'],
  ['recording', 'Grabación'],
  ['engineer', 'Ingeniería'],
  ['mix', 'Mezcla'],
  ['mastering', 'Masterización'],
];
const ROLE_NAME = Object.fromEntries(ROLES);

function collect(groups, rel) {
  if (rel['target-type'] !== 'artist' || !rel.artist) return;
  const type = rel.type;
  const extra = (rel.attributes || []).filter((a) => !['additional', 'guest', 'solo', 'co'].includes(a)).join(', ');
  const list = (groups[type] ??= []);
  const name = rel.artist.name;
  const existing = list.find((x) => x.name === name);
  if (existing) {
    if (extra && !existing.extra.includes(extra)) existing.extra = [existing.extra, extra].filter(Boolean).join(', ');
  } else list.push({ name, extra, id: rel.artist.id });
}

async function fetchCredits(track) {
  const found = await findRecording(track);
  if (!found) return { status: 'none' };
  const rec = await mb(`recording/${found.id}`, { inc: 'artist-rels+work-rels+work-level-rels' });
  const groups = {};
  for (const rel of rec.relations || []) {
    collect(groups, rel);
    // Compositores y letristas cuelgan de la obra, no de la grabación
    if (rel['target-type'] === 'work') for (const wr of rel.work?.relations || []) collect(groups, wr);
  }
  const known = ROLES.filter(([k]) => groups[k]).map(([k, label]) => ({ label, people: groups[k] }));
  const other = Object.keys(groups)
    .filter((k) => !ROLE_NAME[k])
    .map((k) => ({ label: k[0].toUpperCase() + k.slice(1), people: groups[k] }));
  return { status: 'ok', roles: [...known, ...other], url: `https://musicbrainz.org/recording/${found.id}` };
}

function loadCredits(track) {
  const id = track.id;
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  if (inflight.has(id)) return inflight.get(id);
  const p = fetchCredits(track)
    .catch(() => ({ status: 'error' }))
    .then((r) => {
      inflight.delete(id);
      if (r.status !== 'error') cache.set(id, r);
      return r;
    });
  inflight.set(id, p);
  return p;
}

/** Precarga los créditos (MusicBrainz admite 1 petición/s: usar solo para la siguiente canción) */
export function prefetchCredits(track) {
  if (track?.type === 'track' && track.id) loadCredits(track);
}

export function useCredits(track) {
  const id = track?.type === 'track' ? track.id : null;
  const [state, setState] = useState({ status: 'idle' });
  useEffect(() => {
    if (!id) return setState({ status: 'none', id });
    if (cache.has(id)) return setState({ ...cache.get(id), id });
    let alive = true;
    setState({ status: 'loading', id });
    loadCredits(track).then((r) => alive && setState({ ...r, id }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return state.id === id ? state : { status: 'loading', id };
}
