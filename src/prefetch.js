// Precarga de las próximas canciones de la cola: cuando una canción empieza, su portada,
// colores, letra y Canvas ya están descargados y el cambio se ve al instante.
import { getCanvasUrl, primeArt, warmVideo } from './art.js';
import { readPrefs } from './components/nowplaying/prefs.js';
import { prefetchCredits } from './credits.js';
import { prefetchLyrics } from './lyrics.js';

export const PREFETCH_COUNT = 5; // canciones de la cola que se precargan
const VIDEO_COUNT = 2; // de ellas, a cuántas se les descarga ya el vídeo del Canvas

const images = (t) => t?.album?.images || t?.images || [];
const done = new Set(); // uri de canciones ya precargadas en esta sesión

/** Precarga lo necesario para mostrar `track` sin esperas */
export function prefetchTrack(track, index = 0) {
  if (!track?.uri) return;
  const prefs = readPrefs();
  const key = `${track.uri}:${index < VIDEO_COUNT ? 'v' : ''}`;
  if (done.has(key)) return;
  done.add(key);

  const imgs = images(track);
  primeArt(imgs[0]?.url, { palette: prefs.breathe }); // portada grande y colores de "Sonando ahora"
  primeArt(imgs[imgs.length - 1]?.url, { palette: false }); // miniatura de la barra
  if (track.type !== 'track') return; // los episodios no tienen letra ni Canvas

  if (prefs.lyrics !== 'none') prefetchLyrics(track);
  if (prefs.canvas !== 'none') {
    getCanvasUrl(track.id).then((url) => index < VIDEO_COUNT && warmVideo(url));
  }
  // MusicBrainz limita a 1 petición/s: solo la siguiente y si el panel de créditos está abierto
  if (index === 0 && prefs.panel === 'credits') prefetchCredits(track);
}

/** Precarga las primeras canciones de la cola, en orden */
export function prefetchQueue(queue) {
  queue.slice(0, PREFETCH_COUNT).forEach((t, i) => prefetchTrack(t, i));
}
