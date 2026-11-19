// Transiciones suaves con la View Transitions API (Chrome, Edge y Safari 18): al cambiar de página
// y al abrir o cerrar «Sonando ahora», donde la portada crece desde la barra de abajo. En los
// navegadores que no la tienen, o con «Reducir movimiento», el cambio es instantáneo, como antes.
import { flushSync } from 'react-dom';

const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const canTransition = () => typeof document !== 'undefined' && !!document.startViewTransition && !reduced();

/**
 * Aplica `update` (un cambio de estado de React) dentro de una transición de vista.
 * `kind`: 'page' (cambio de sección) o 'np' (abrir o cerrar Sonando ahora); el CSS anima cada una.
 */
export function transition(update, kind = 'page') {
  if (!canTransition() || document.hidden) return update();
  const root = document.documentElement;
  // El cambio se aplica una sola vez: dentro de la transición o, si el navegador no llega a pintar
  // (ventana en segundo plano, equipo muy cargado), directamente a los 400 ms sin transición
  let done = false;
  const apply = () => {
    if (done) return;
    done = true;
    flushSync(update);
  };
  root.dataset.vt = kind;
  const t = document.startViewTransition(apply);
  // Una transición saltada (por el plan B o porque empieza otra) rechaza estas promesas: no es un error
  t.ready?.catch(() => {});
  t.updateCallbackDone?.catch(() => {});
  const fallback = setTimeout(() => {
    if (done) return;
    t.skipTransition?.();
    apply();
  }, 400);
  t.finished
    .catch(() => {})
    .finally(() => {
      clearTimeout(fallback);
      if (root.dataset.vt === kind) delete root.dataset.vt;
    });
}

/** Lleva la página a `y` en cuanto el contenido es lo bastante alto (las listas llegan después) */
export function restoreScroll(y) {
  window.scrollTo(0, y);
  if (!y) return;
  let tries = 0;
  const tick = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max >= y - 2) return window.scrollTo(0, y);
    if (++tries < 90) requestAnimationFrame(tick);
    else window.scrollTo(0, max);
  };
  requestAnimationFrame(tick);
  // Si el usuario se desplaza antes, se deja de intentar
  const stop = () => (tries = 999);
  window.addEventListener('wheel', stop, { once: true, passive: true });
  window.addEventListener('touchstart', stop, { once: true, passive: true });
}
