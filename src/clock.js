// Reloj de reproducción estable: interpola la posición localmente y se resincroniza con Spotify.
// - Desviaciones grandes (más de 1 s: alguien ha buscado en otro dispositivo…): salto directo.
// - Desviaciones pequeñas: se corrige la mitad en cada sondeo, sin saltos visibles. Antes se
//   toleraban hasta 1 s de error, y eso era justo lo que hacía que la letra fuera a destiempo.
// - Si suena en este navegador, manda la posición del propio reproductor (más precisa).
import { useCallback, useEffect, useRef, useState } from 'react';

const sameTrack = (s, a) => s.uri === a.uri || s.linked === a.uri || (s.name === a.name && Math.abs(s.dur - a.dur) < 2000);

export function useClock(playback, sdk) {
  const anchor = useRef(null);
  const item = playback?.item;
  if (item) {
    const fresh = {
      pos: playback.progress_ms,
      at: playback.fetchedAt,
      playing: playback.is_playing,
      uri: item.uri,
      name: item.name,
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
      const err = fresh.pos - estimate;
      if (Math.abs(err) > 1000) anchor.current = fresh;
      else if (Math.abs(err) > 40) anchor.current = { ...a, pos: estimate + err / 2, at: fresh.at };
    }
  } else {
    anchor.current = null;
  }

  const now = useCallback(() => {
    const a = anchor.current;
    if (!a) return 0;
    // Reproductor de este navegador: su posición es la del audio que suena (salvo justo tras buscar,
    // hasta que el reproductor confirma la nueva posición)
    const s = sdk?.read();
    if (s && sameTrack(s, a) && s.playing === a.playing && Date.now() - s.at < 30_000 && !(a.jumped && s.at < a.jumped)) {
      return Math.max(0, Math.min(a.dur, s.pos + (s.playing ? Date.now() - s.at : 0)));
    }
    return Math.max(0, Math.min(a.dur, a.pos + (a.playing ? Date.now() - a.at : 0)));
  }, [sdk]);

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
