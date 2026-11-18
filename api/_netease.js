// Letras de NetEase Cloud Music (API no oficial, sin clave). Tiene letra sincronizada por líneas
// y, en muchas canciones, palabra a palabra (formato YRC). El navegador no puede llamarla
// directamente (no envía cabeceras CORS), así que pasa por api/lyrics.js (y por Vite en desarrollo).
// Los archivos de api/ que empiezan por "_" no son rutas en Vercel.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Referer: 'https://music.163.com/',
};

async function getJson(url) {
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error(`NetEase ${r.status}`);
  return r.json();
}

/** Nombre normalizado para comparar: sin acentos, sin "(feat. …)", "- Remastered"… */
const norm = (s = '') =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*[([].*?[)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const VERSION_WORDS = /\b(live|remix|acoustic|instrumental|karaoke|cover|demo|sped up|slowed|nightcore|version|edit)\b/i;

/** Busca la canción y devuelve la que mejor cuadra en nombre, artista y duración */
async function search(name, artist, durationMs) {
  const d = await getJson(`https://music.163.com/api/search/get?${new URLSearchParams({ s: `${name} ${artist}`, type: '1', limit: '12' })}`);
  const songs = d?.result?.songs || [];
  const n = norm(name);
  const a = norm(artist);
  // Si la canción original no es una versión, se penalizan los directos, remezclas…
  const wantsVersion = VERSION_WORDS.test(name);
  let best = null;
  for (const s of songs) {
    const sn = norm(s.name);
    const artists = (s.artists || s.ar || []).map((x) => norm(x.name));
    const diff = durationMs && s.duration ? Math.abs(s.duration - durationMs) / 1000 : null;
    let score = 0;
    if (sn === n) score += 4;
    else if (sn.includes(n) || n.includes(sn)) score += 1;
    else continue;
    if (artists.some((x) => x === a)) score += 3;
    else if (artists.some((x) => x && (x.includes(a) || a.includes(x)))) score += 1;
    else score -= 3;
    if (diff !== null) score += diff <= 2 ? 3 : diff <= 5 ? 1 : diff <= 10 ? -2 : -8;
    if (!wantsVersion && VERSION_WORDS.test(s.name)) score -= 3;
    if (!best || score > best.score) best = { score, id: s.id, name: s.name, artist: (s.artists || s.ar || []).map((x) => x.name).join(', '), duration: s.duration, diff };
  }
  return best && best.score >= 4 ? best : null;
}

async function lyric(id) {
  const d = await getJson(`https://music.163.com/api/song/lyric/v1?id=${id}&lv=-1&kv=-1&tv=-1&rv=-1&yv=-1&ytv=-1&yrv=-1`);
  return {
    lrc: d?.lrc?.lyric || '',
    yrc: d?.yrc?.lyric || '',
    instrumental: !!(d?.pureMusic || d?.nolyric),
  };
}

/** { id } o { name, artist, duration } → letra y datos de la canción encontrada */
export async function lookupLyrics({ id, name, artist, duration }) {
  const song = id ? { id: Number(id) } : await search(name, artist, Number(duration) || 0);
  if (!song) return { found: false };
  const l = await lyric(song.id);
  if (!l.lrc && !l.yrc && !l.instrumental) return { found: false };
  return { found: true, ...song, ...l };
}

/** Comprueba y normaliza los parámetros de la petición; null si no son válidos */
export function parseQuery(q) {
  const id = q.id ? String(q.id) : '';
  if (id) return /^\d{1,15}$/.test(id) ? { id } : null;
  const name = String(q.name || '').slice(0, 200).trim();
  const artist = String(q.artist || '').slice(0, 200).trim();
  const duration = Number(q.duration) || 0;
  return name ? { name, artist, duration } : null;
}
