// Cristal líquido al estilo Apple: el contenido de detrás se refracta solo en el borde (como una
// lente), con el centro nítido. Se genera un mapa de desplazamiento a la medida y el radio exactos
// de cada pieza y se aplica con un filtro SVG en backdrop-filter.
// Solo Chromium (Chrome, Edge…) aplica filtros SVG en backdrop-filter; el resto ve el desenfoque del CSS.
import { useEffect } from 'react';

const isChromium = typeof window !== 'undefined' && !!window.chrome && /Chrome\//.test(navigator.userAgent);
const reduceTransparency = () => window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches;
let counter = 0;

function defs() {
  let svg = document.getElementById('lg-defs');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'lg-defs';
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    document.body.appendChild(svg);
  }
  return svg;
}

/**
 * Mapa de desplazamiento de un rectángulo redondeado: neutro (gris) en el centro y, en la franja
 * del borde (`bezel` px), un desplazamiento hacia fuera que crece al acercarse al borde.
 * R = desplazamiento horizontal, G = vertical (128 = sin desplazamiento).
 */
function makeMap(w, h, r, bezel) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const hw = w / 2;
  const hh = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hw;
      const py = y + 0.5 - hh;
      const qx = Math.abs(px) - (hw - r);
      const qy = Math.abs(py) - (hh - r);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      // Distancia al borde (positiva dentro)
      const inside = -(Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy) - r);
      let dx = 0;
      let dy = 0;
      if (inside >= 0 && inside < bezel) {
        let nx;
        let ny;
        if (qx > 0 && qy > 0) {
          const l = Math.hypot(ox, oy) || 1;
          nx = ox / l;
          ny = oy / l;
        } else if (qx > qy) {
          nx = 1;
          ny = 0;
        } else {
          nx = 0;
          ny = 1;
        }
        nx *= Math.sign(px) || 1;
        ny *= Math.sign(py) || 1;
        // Perfil convexo: casi nada en el interior de la franja, máximo en el borde
        const t = 1 - inside / bezel;
        const mag = t * t * (3 - 2 * t);
        dx = nx * mag;
        dy = ny * mag;
      }
      const i = (y * w + x) * 4;
      d[i] = 128 + dx * 127;
      d[i + 1] = 128 + dy * 127;
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

/**
 * Aplica la refracción de borde a `ref`. Se recalcula al cambiar de tamaño.
 * @param {{ bezel?: number, scale?: number, blur?: number, saturate?: number, enabled?: boolean }} opts
 */
export function useLiquidGlass(ref, { bezel = 16, scale = 34, blur = 5, saturate = 175, enabled = true } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || !isChromium || reduceTransparency()) return;
    const id = `lg-${++counter}`;
    const ns = 'http://www.w3.org/2000/svg';
    const filter = document.createElementNS(ns, 'filter');
    filter.id = id;
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', '100%');
    filter.setAttribute('height', '100%');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const image = document.createElementNS(ns, 'feImage');
    image.setAttribute('x', '0');
    image.setAttribute('y', '0');
    image.setAttribute('result', 'map');
    image.setAttribute('preserveAspectRatio', 'none');
    const disp = document.createElementNS(ns, 'feDisplacementMap');
    disp.setAttribute('in', 'SourceGraphic');
    disp.setAttribute('in2', 'map');
    disp.setAttribute('scale', String(scale));
    disp.setAttribute('xChannelSelector', 'R');
    disp.setAttribute('yChannelSelector', 'G');
    filter.append(image, disp);
    defs().appendChild(filter);

    let last = '';
    let timer;
    const build = () => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
      const key = `${w}x${h}x${r}`;
      if (key === last) return;
      last = key;
      image.setAttribute('width', String(w));
      image.setAttribute('height', String(h));
      image.setAttribute('href', makeMap(w, h, r, Math.min(bezel, h / 2, w / 2)));
      const value = `url(#${id}) blur(${blur}px) saturate(${saturate}%) brightness(1.06)`;
      el.style.backdropFilter = value;
      el.style.webkitBackdropFilter = value;
      el.classList.add('lg-refract');
    };
    build();
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(build, 120);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      clearTimeout(timer);
      filter.remove();
      el.style.backdropFilter = '';
      el.style.webkitBackdropFilter = '';
      el.classList.remove('lg-refract');
    };
  }, [ref, bezel, scale, blur, saturate, enabled]);
}

/** Reflejo especular que sigue al puntero sobre las piezas de cristal (.lg-track) */
export function useGlassHighlight() {
  useEffect(() => {
    let raf = 0;
    let ev = null;
    const apply = () => {
      raf = 0;
      const el = ev?.target?.closest?.('.lg-track');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${(((ev.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(((ev.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    };
    const onMove = (e) => {
      ev = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
}
