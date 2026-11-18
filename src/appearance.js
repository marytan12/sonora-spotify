// Apariencia del cristal líquido, para toda la app:
// - auto: sigue al sistema (con "Reducir transparencia" / transparencia de Windows desactivada, se ve opaco)
// - always: siempre cristal líquido, aunque el sistema pida reducir la transparencia
// - reduced: siempre opaco
import { useEffect, useState } from 'react';

const KEY = 'sonora_glass';
export const GLASS_MODES = ['auto', 'always', 'reduced'];
const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-transparency: reduce)') : null;
const listeners = new Set();

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return GLASS_MODES.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

let mode = read();

/** true si el sistema pide reducir la transparencia */
export const systemReduced = () => !!mq?.matches;

/** true si ahora mismo el cristal debe verse opaco */
export const glassReduced = () => mode === 'reduced' || (mode === 'auto' && systemReduced());

function apply() {
  document.documentElement.classList.toggle('glass-reduced', glassReduced());
  listeners.forEach((f) => f());
}

export function setGlassMode(next) {
  if (!GLASS_MODES.includes(next)) return;
  mode = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* sin almacenamiento: se aplica solo en esta sesión */
  }
  apply();
}

if (typeof window !== 'undefined') {
  mq?.addEventListener?.('change', apply);
  apply();
}

/** Modo actual y si el cristal está reducido; se vuelve a pintar al cambiar el modo o el sistema */
export function useGlassMode() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => listeners.delete(f);
  }, []);
  return { mode, reduced: glassReduced(), systemReduced: systemReduced(), setMode: setGlassMode };
}

export const GLASS_OPTIONS = [
  ['auto', 'Automático'],
  ['always', 'Siempre cristal'],
  ['reduced', 'Opaco'],
];
