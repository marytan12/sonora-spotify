// Letras sincronizadas desde LRCLIB (https://lrclib.net), API abierta y con CORS.
import { useEffect, useState } from 'react';

const cache = new Map();

function parseLrc(lrc) {
  const lines = [];
  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const s of stamps) lines.push({ t: (Number(s[1]) * 60 + Number(s[2])) * 1000, text });
  }
  return lines.sort((a, b) => a.t - b.t);
}

async function fetchLyrics(track) {
  const artist = track.artists?.[0]?.name || '';
  const base = {
    artist_name: artist,
    track_name: track.name,
    album_name: track.album?.name || '',
    duration: String(Math.round((track.duration_ms || 0) / 1000)),
  };
  let res = await fetch(`https://lrclib.net/api/get?${new URLSearchParams(base)}`);
  let data = res.ok ? await res.json() : null;
  if (!data) {
    // Búsqueda aproximada si no hay coincidencia exacta
    res = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: track.name, artist_name: artist })}`);
    const list = res.ok ? await res.json() : [];
    data = list.find((x) => x.syncedLyrics) || list[0] || null;
  }
  if (!data) return { status: 'none' };
  if (data.instrumental) return { status: 'instrumental' };
  if (data.syncedLyrics) return { status: 'synced', lines: parseLrc(data.syncedLyrics) };
  if (data.plainLyrics) return { status: 'plain', lines: data.plainLyrics.split('\n').map((text) => ({ text })) };
  return { status: 'none' };
}

export function useLyrics(track, enabled) {
  const id = track?.id;
  const [state, setState] = useState({ status: 'idle' });
  useEffect(() => {
    if (!enabled || !id) return setState({ status: 'none' });
    if (track.type !== 'track') return setState({ status: 'episode' });
    if (cache.has(id)) return setState(cache.get(id));
    let alive = true;
    setState({ status: 'loading' });
    fetchLyrics(track)
      .catch(() => ({ status: 'error' }))
      .then((r) => {
        if (r.status !== 'error') cache.set(id, r);
        if (alive) setState(r);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, enabled]);
  return state;
}
