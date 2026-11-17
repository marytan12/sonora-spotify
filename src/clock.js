// Reloj de reproducción estable: interpola la posición localmente y solo se resincroniza
// con Spotify cuando cambia la canción, se pausa/reanuda o la desviación supera 1 s.
// Así la barra de progreso y la letra avanzan de forma continua, sin saltos con cada sondeo.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useClock(playback) {
  const anchor = useRef(null);
  const item = playback?.item;
  if (item) {
    const fresh = {
      pos: playback.progress_ms,
      at: playback.fetchedAt,
      playing: playback.is_playing,
      uri: item.uri,
      dur: item.duration_ms || 0,
    };
    const a = anchor.current;
    if (!a || a.uri !== fresh.uri || a.playing !== fresh.playing || fresh.at < a.at) {
      anchor.current = fresh;
    } else if (a.jumped && fresh.at - a.jumped < 2500) {
      // Tras buscar, Spotify tarda en aplicar la nueva posición: se ignoran los sondeos
      // antiguos para que la letra y la barra no salten hacia atrás
    } else if (fresh.at !== a.at) {
      const estimate = a.pos + (a.playing ? fresh.at - a.at : 0);
      if (Math.abs(estimate - fresh.pos) > 1000) anchor.current = fresh;
    }
  } else {
    anchor.current = null;
  }

  const now = useCallback(() => {
    const a = anchor.current;
    if (!a) return 0;
    return Math.max(0, Math.min(a.dur, a.pos + (a.playing ? Date.now() - a.at : 0)));
  }, []);

  /** Mueve el reloj al instante (al buscar) sin esperar a Spotify */
  const jump = useCallback((ms) => {
    if (anchor.current) anchor.current = { ...anchor.current, pos: ms, at: Date.now(), jumped: Date.now() };
  }, []);

  return { now, jump };
}

/** Devuelve la posición actual re-renderizando cada `ms` (para barras de progreso) */
export function useTick(now, playing, ms = 200) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [playing, ms]);
  return now();
}

/** Ejecuta `fn(posición)` en cada fotograma mientras está montado */
export function useFrame(fn, deps) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let raf;
    const loop = () => {
      ref.current();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
