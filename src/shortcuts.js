// Atajos de teclado configurables (las teclas se guardan en los ajustes de la app)
import { useEffect, useRef } from 'react';
import { readSettings } from './settings.js';

const MODIFIERS = ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified', 'Process'];
// Acciones que se repiten si se mantiene la tecla pulsada
const REPEATABLE = new Set(['forward', 'back', 'volUp', 'volDown']);

export const isTyping = (el) => /^(input|textarea|select)$/i.test(el?.tagName) || !!el?.isContentEditable;

/** Combinación de una pulsación, p. ej. "Ctrl+ArrowRight", "M", "Space" o "/" */
export function comboOf(e) {
  const k = e.key;
  if (!k || MODIFIERS.includes(k)) return null;
  const printable = k.length === 1 && k !== ' ';
  const name = k === ' ' ? 'Space' : printable ? k.toUpperCase() : k;
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.metaKey) mods.push('Meta');
  // En las teclas de carácter, Mayús ya está en el propio carácter ("/" es Mayús+7 en un teclado español)
  if (e.shiftKey && !printable) mods.push('Shift');
  return [...mods, name].join('+');
}

const NAMES = { ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', Space: 'Espacio', Escape: 'Esc', Shift: 'Mayús' };
/** Partes de una combinación para mostrarlas como teclas */
export const keyParts = (combo) => (combo ? combo.split('+').map((p) => NAMES[p] || p) : []);

let capturing = false;
/** Mientras se está eligiendo una tecla nueva, los atajos no se disparan */
export const setCapturing = (v) => (capturing = v);

/** Escucha los atajos configurados y llama al manejador de cada acción */
export function useShortcuts(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (e) => {
      if (capturing || e.defaultPrevented || isTyping(e.target)) return;
      const combo = comboOf(e);
      if (!combo) return;
      const keys = readSettings().keys;
      const action = Object.keys(keys).find((a) => keys[a] === combo);
      const fn = action && ref.current[action];
      if (!fn) return;
      // Espacio o Intro sobre un botón o enlace sirven para pulsarlo, no son un atajo
      if ((combo === 'Space' || combo === 'Enter') && e.target.closest?.('button, a, [role="link"], [role="button"], summary')) return;
      // Con un diálogo abierto (crear playlist, compartir…) no se dispara nada
      if (document.querySelector('.modal-bg')) return;
      e.preventDefault();
      if (e.repeat && !REPEATABLE.has(action)) return;
      fn(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
