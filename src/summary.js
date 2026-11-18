// "Tu resumen": cálculos a partir de tus canciones y artistas más escuchados y de lo último que
// has escuchado, y la tarjeta en imagen (formato historia, 1080x1920) para compartir.

export const RANGES = [
  ['short_term', 'Últimas 4 semanas', 'del último mes'],
  ['medium_term', 'Últimos 6 meses', 'de los últimos 6 meses'],
  ['long_term', 'Desde siempre', 'de siempre'],
];

const MOMENTS = [
  ['madrugada', 'de madrugada', 0, 6],
  ['mañana', 'por la mañana', 6, 12],
  ['tarde', 'por la tarde', 12, 20],
  ['noche', 'por la noche', 20, 24],
];

const yearOf = (t) => Number(String(t?.album?.release_date || '').slice(0, 4)) || null;
const imageOf = (x) => (x?.images || x?.album?.images || [])[0]?.url || null;

/** Calcula todas las cifras del resumen */
export function analyze(tracks = [], artists = [], recent = []) {
  tracks = tracks.filter(Boolean);
  artists = artists.filter(Boolean);

  // Década favorita (por fecha de publicación de tus canciones más escuchadas)
  const decades = {};
  for (const t of tracks) {
    const y = yearOf(t);
    if (y) decades[Math.floor(y / 10) * 10] = (decades[Math.floor(y / 10) * 10] || 0) + 1;
  }
  const decadeEntries = Object.entries(decades).sort((a, b) => b[1] - a[1]);
  const decade = decadeEntries[0]
    ? { label: `${decadeEntries[0][0]}s`, share: Math.round((decadeEntries[0][1] / tracks.length) * 100) }
    : null;
  const years = tracks.map(yearOf).filter(Boolean);
  const newest = years.length ? Math.max(...years) : null;
  const oldest = years.length ? Math.min(...years) : null;

  // Variedad: cuántos artistas distintos hay entre tus canciones más escuchadas
  const distinct = new Set(tracks.flatMap((t) => (t.artists || []).slice(0, 1).map((a) => a.id || a.name))).size;
  const variety = tracks.length ? distinct / tracks.length : 0;
  const style =
    variety >= 0.7 ? 'Siempre descubriendo' : variety <= 0.35 ? 'Fidelidad total' : 'Equilibrio perfecto';

  // Momento del día (de lo último que has escuchado)
  const hours = recent.map((r) => new Date(r.played_at).getHours()).filter((h) => Number.isFinite(h));
  const moments = MOMENTS.map(([key, phrase, from, to]) => ({
    key,
    phrase,
    count: hours.filter((h) => h >= from && h < to).length,
  }));
  const topMoment = hours.length ? [...moments].sort((a, b) => b.count - a.count)[0] : null;

  // Canción que más se repite en lo último escuchado
  const plays = {};
  for (const r of recent) if (r.track?.id) plays[r.track.id] = { track: r.track, n: (plays[r.track.id]?.n || 0) + 1 };
  const onRepeat = Object.values(plays).sort((a, b) => b.n - a.n)[0];

  // Géneros (Spotify no siempre los da para todos los artistas)
  const genreScore = {};
  artists.forEach((a, i) => (a.genres || []).forEach((g) => (genreScore[g] = (genreScore[g] || 0) + (artists.length - i))));
  const genres = Object.entries(genreScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([g]) => g);

  const minutes = Math.round(tracks.reduce((s, t) => s + (t.duration_ms || 0), 0) / 60000);
  const explicit = tracks.length ? Math.round((tracks.filter((t) => t.explicit).length / tracks.length) * 100) : 0;

  return {
    topArtist: artists[0] || null,
    topTrack: tracks[0] || null,
    artists: artists.slice(0, 5),
    tracks: tracks.slice(0, 5),
    decade,
    newest,
    oldest,
    distinct,
    style,
    moments,
    topMoment,
    onRepeat: onRepeat && onRepeat.n > 1 ? onRepeat : null,
    genres,
    minutes,
    explicit,
    count: tracks.length,
  };
}

/** Frase que resume tu forma de escuchar */
export const tagline = (s) => (s.topMoment ? `${s.style}, sobre todo ${s.topMoment.phrase}` : s.style);

// ======================= Tarjeta para compartir =======================
function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Recorta el texto con "…" para que quepa en `max` píxeles */
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const iw = img.width * s;
  const ih = img.height * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * Dibuja la tarjeta del resumen y devuelve un Blob PNG.
 * @param {ReturnType<typeof analyze>} s
 * @param {{ period: string, color: string | null, name?: string }} opts  color = "r g b"
 */
export async function renderCard(s, { period, color, name }) {
  const W = 1080;
  const H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  await document.fonts?.ready;
  const font = (w, px) => `${w} ${px}px Inter, "Segoe UI", system-ui, sans-serif`;
  const rgb = color ? color.split(' ').map(Number) : [110, 90, 170];
  const tint = (a) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;

  const [hero, ...covers] = await Promise.all([
    loadImage(imageOf(s.topArtist)),
    ...s.tracks.map((t) => loadImage((t.album?.images || []).slice(-1)[0]?.url || imageOf(t))),
  ]);

  // Fondo: foto del artista nº1 muy desenfocada y teñida con su color
  ctx.fillStyle = '#121216';
  ctx.fillRect(0, 0, W, H);
  if (hero) {
    ctx.save();
    ctx.filter = 'blur(80px) saturate(1.4) brightness(0.55)';
    drawCover(ctx, hero, -200, -200, W + 400, H + 400);
    ctx.restore();
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, tint(0.45));
  g.addColorStop(0.55, 'rgba(18, 18, 22, 0.55)');
  g.addColorStop(1, 'rgba(18, 18, 22, 0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  // Cabecera
  ctx.font = font(700, 40);
  ctx.fillText('Sonora', 90, 140);
  ctx.font = font(500, 36);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(fit(ctx, `Tu resumen ${period}${name ? ` · ${name}` : ''}`, W - 180), 90, 196);

  // Artista nº1 con su foto grande
  const size = 560;
  const ix = (W - size) / 2;
  const iy = 270;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 30;
  roundRect(ctx, ix, iy, size, size, 48);
  ctx.fillStyle = tint(0.6);
  ctx.fill();
  ctx.restore();
  if (hero) {
    ctx.save();
    roundRect(ctx, ix, iy, size, size, 48);
    ctx.clip();
    drawCover(ctx, hero, ix, iy, size, size);
    ctx.restore();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = font(600, 36);
  ctx.fillText('Tu artista nº 1', W / 2, iy + size + 80);
  ctx.fillStyle = '#fff';
  ctx.font = font(800, 76);
  ctx.fillText(fit(ctx, s.topArtist?.name || '—', W - 160), W / 2, iy + size + 170);
  ctx.font = font(500, 38);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(fit(ctx, tagline(s), W - 160), W / 2, iy + size + 236);
  ctx.textAlign = 'left';

  // Dos columnas: top artistas y top canciones
  const top = iy + size + 330;
  const colW = (W - 180 - 60) / 2;
  const col = (x, title, rows, withCovers) => {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = font(700, 32);
    ctx.fillText(title, x, top);
    rows.forEach((r, i) => {
      const y = top + 70 + i * 86;
      let tx = x;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = font(700, 34);
      ctx.fillText(String(i + 1), x, y + 26);
      tx += 44;
      if (withCovers && covers[i]) {
        ctx.save();
        roundRect(ctx, tx, y - 16, 64, 64, 10);
        ctx.clip();
        drawCover(ctx, covers[i], tx, y - 16, 64, 64);
        ctx.restore();
        tx += 82;
      }
      ctx.fillStyle = '#fff';
      ctx.font = font(600, 34);
      ctx.fillText(fit(ctx, r, x + colW - tx), tx, y + 26);
    });
  };
  col(90, 'Top artistas', s.artists.map((a) => a.name), false);
  col(90 + colW + 60, 'Top canciones', s.tracks.map((t) => t.name), true);

  // Cifras
  const stats = [
    s.decade && ['Tu década', s.decade.label],
    ['Artistas distintos', String(s.distinct)],
    s.topMoment && ['Escuchas más', s.topMoment.key],
  ].filter(Boolean);
  const sy = H - 215;
  const sw = (W - 180) / stats.length;
  stats.forEach(([k, v], i) => {
    const x = 90 + i * sw;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = font(600, 30);
    ctx.fillText(k, x, sy);
    ctx.fillStyle = '#fff';
    ctx.font = font(800, 56);
    ctx.fillText(fit(ctx, v, sw - 20), x, sy + 70);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = font(500, 28);
  ctx.fillText('sonora-spotify-lac.vercel.app', 90, H - 80);

  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}
