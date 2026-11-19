// Reloj de reproducción estable: interpola la posición localmente y se resincroniza con Spotify.
// - Desviaciones grandes (más de 1 s: alguien ha buscado en otro dispositivo…): salto directo.
// - Desviaciones pequeñas: se corrige la mitad en cada sondeo, sin saltos visibles. Antes se
//   toleraban hasta 1 s de error, y eso era justo lo que hacía que la letra fuera a destiempo.
// - Si suena en este navegador, manda la posición del propio reproductor (más precisa).
// - Los sondeos en los que no cambia nada visible no vuelven a dibujar la app (store.jsx), pero el
//   reloj los lee igualmente de `poll.latest` para seguir corrigiéndose.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const sameTrack = (s, a) => s.uri === a.uri || s.linked === a.uri || (s.name === a.name && Math.abs(s.dur - a.dur) < 2000);

/** Corrige el ancla con un sondeo de la misma canción y en el mismo estado (sonando o en pausa) */
function correct(a, pos, at) {
  if (a.jumped && at - a.jumped < 2500) return a; // tras buscar, Spotify tarda en aplicar la posición
  if (at <= a.at) return a;
  // En pausa no hay nada que suavizar: la posición es la que dice Spotify
  if (!a.playing) return pos === a.pos ? a : { ...a, pos, at };
  const estimate = a.pos + (a.playing ? at - a.at : 0);
  const err = pos - estimate;
  if (Math.abs(err) > 1000) return { ...a, pos, at };
  if (Math.abs(err) > 40) return { ...a, pos: estimate + err / 2, at };
  return a;
}

export function useClock(playback, sdk, poll) {
  const anchor = useRef(null);
  const fed = useRef(undefined); // último estado de reproducción ya aplicado al reloj
  const polled = useRef(0); // marca del último sondeo leído de `poll`
  // Solo cuando cambia el estado de reproducción (no en cualquier render: un render con un estado
  // antiguo desharía las correcciones hechas con sondeos más recientes)
  if (playback !== fed.current) {
    fed.current = playback;
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
      // Otra canción, pausa/reanudación o un estado anterior (una orden que se deshace): ancla nueva
      if (!a || a.uri !== fresh.uri || a.playing !== fresh.playing || fresh.at < a.at) anchor.current = fresh;
      else anchor.current = correct(a, fresh.pos, fresh.at);
    } else {
      anchor.current = null;
    }
  }

  const now = useCallback(() => {
    let a = anchor.current;
    if (!a) return 0;
    // Sondeo más reciente que no ha vuelto a dibujar la app
    const p = poll?.latest;
    if (p && p.fetchedAt !== polled.current && p.item?.uri === a.uri && p.is_playing === a.playing) {
      polled.current = p.fetchedAt;
      a = anchor.current = correct(a, p.progress_ms, p.fetchedAt);
    }
    // Reproductor de este navegador: su posición es la del audio que suena (salvo justo tras buscar,
    // hasta que el reproductor confirma la nueva posición)
    const s = sdk?.read();
    if (s && sameTrack(s, a) && s.playing === a.playing && Date.now() - s.at < 30_000 && !(a.jumped && s.at < a.jumped)) {
      return Math.max(0, Math.min(a.dur, s.pos + (s.playing ? Date.now() - s.at : 0)));
    }
    return Math.max(0, Math.min(a.dur, a.pos + (a.playing ? Date.now() - a.at : 0)));
  }, [sdk, poll]);

  /** Mueve el reloj al instante (al buscar) sin esperar a Spotify */
  const jump = useCallback((ms) => {
    if (anchor.current) anchor.current = { ...anchor.current, pos: ms, at: Date.now(), jumped: Date.now() };
  }, []);

  // El mismo objeto mientras no cambien las funciones: las barras de progreso no se reinician
  return useMemo(() => ({ now, jump }), [now, jump]);
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
