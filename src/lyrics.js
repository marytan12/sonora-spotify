// Letras sincronizadas desde LRCLIB (https://lrclib.net), API abierta y con CORS.
import { useEffect, useState } from 'react';

const cache = new Map();

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

async function fetchLyrics(track) {
  const artist = track.artists?.[0]?.name || '';
  const secs = Math.round((track.duration_ms || 0) / 1000);
  const base = {
    artist_name: artist,
    track_name: track.name,
    album_name: track.album?.name || '',
    duration: String(secs),
  };
  let res = await fetch(`https://lrclib.net/api/get?${new URLSearchParams(base)}`);
  let data = res.ok ? await res.json() : null;
  if (!data) {
    // Búsqueda aproximada: sin sufijos tipo "- Remastered" y con la duración más parecida
    const name = track.name.replace(/\s+-\s+.*$/, '').replace(/\s*\((?:feat|with|ft)\.?[^)]*\)/i, '').trim();
    res = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: name, artist_name: artist })}`);
    const list = (res.ok ? await res.json() : []).filter((x) => !secs || !x.duration || Math.abs(x.duration - secs) <= 8);
    const close = (x) => Math.abs((x.duration || secs) - secs);
    list.sort((a, b) => !!b.syncedLyrics - !!a.syncedLyrics || close(a) - close(b));
    data = list[0] || null;
  }
  if (!data) return { status: 'none' };
  if (data.instrumental) return { status: 'instrumental' };
  if (data.syncedLyrics) {
    const lines = parseLrc(data.syncedLyrics);
    if (lines.length) return { status: 'synced', lines };
  }
  if (data.plainLyrics) return { status: 'plain', lines: data.plainLyrics.split(/\r?\n/).map((text) => ({ text })) };
  return { status: 'none' };
}

export function useLyrics(track, enabled) {
  const id = track?.id;
  const [state, setState] = useState({ status: 'idle' });
  useEffect(() => {
    if (!enabled || !id) return setState({ status: 'none', id });
    if (track.type !== 'track') return setState({ status: 'episode', id });
    if (cache.has(id)) return setState({ ...cache.get(id), id });
    let alive = true;
    setState({ status: 'loading', id });
    fetchLyrics(track)
      .catch(() => ({ status: 'error' }))
      .then((r) => {
        if (r.status !== 'error') cache.set(id, r);
        if (alive) setState({ ...r, id });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, enabled]);
  // Al cambiar de canción, no mostrar la letra de la anterior mientras carga la nueva
  return state.id === id ? state : { status: 'loading', id };
}
