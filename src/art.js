// Utilidades para que el arte (portadas, fotos de artista, Canvas) mande en la interfaz.
import { useEffect, useState } from 'react';

// ---------- Color dominante de una imagen ----------
const colorCache = new Map();

function extract(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const n = 32;
        const c = document.createElement('canvas');
        c.width = c.height = n;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, n, n);
        const d = ctx.getImageData(0, 0, n, n).data;
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2];
          const max = Math.max(R, G, B), min = Math.min(R, G, B);
          const sat = max === 0 ? 0 : (max - min) / max;
          const lum = (max + min) / 510;
          // Prioriza píxeles con color; casi ignora negros y blancos puros
          const weight = (0.08 + sat * sat) * (lum < 0.08 || lum > 0.94 ? 0.1 : 1);
          r += R * weight; g += G * weight; b += B * weight; w += weight;
        }
        let rgb = [r / w, g / w, b / w];
        // Normaliza el brillo para que funcione como tinte sobre fondo oscuro
        const l = (Math.max(...rgb) + Math.min(...rgb)) / 2;
        const target = 120;
        if (l < target) rgb = rgb.map((v) => Math.min(255, v + (target - l) * 0.8));
        resolve(rgb.map(Math.round).join(' '));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Devuelve el color dominante como "r g b" (para usar en rgb(var(--art))) */
export function useArtColor(url) {
  const [color, setColor] = useState(() => (url ? colorCache.get(url) ?? null : null));
  useEffect(() => {
    if (!url) return setColor(null);
    if (colorCache.has(url)) return setColor(colorCache.get(url));
    let alive = true;
    extract(url).then((c) => {
      colorCache.set(url, c);
      if (alive) setColor(c);
    });
    return () => {
      alive = false;
    };
  }, [url]);
  return color;
}

// ---------- Paleta (3 colores) para el fondo que respira ----------
const paletteCache = new Map();

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function extractPalette(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const n = 40;
        const c = document.createElement('canvas');
        c.width = c.height = n;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, n, n);
        const d = ctx.getImageData(0, 0, n, n).data;
        // Agrupa los píxeles por tono (12 sectores) y se queda con los 3 más presentes y distintos
        const bins = Array.from({ length: 12 }, () => ({ r: 0, g: 0, b: 0, w: 0 }));
        for (let i = 0; i < d.length; i += 4) {
          const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
          if (l < 0.08 || l > 0.95) continue;
          const w = 0.05 + s * s;
          const bin = bins[Math.floor(h / 30) % 12];
          bin.r += d[i] * w; bin.g += d[i + 1] * w; bin.b += d[i + 2] * w; bin.w += w;
        }
        const top = bins
          .map((b, i) => ({ ...b, i }))
          .filter((b) => b.w > 0)
          .sort((a, b) => b.w - a.w);
        const picked = [];
        for (const b of top) {
          if (picked.every((p) => Math.min(Math.abs(p.i - b.i), 12 - Math.abs(p.i - b.i)) >= 2)) picked.push(b);
          if (picked.length === 3) break;
        }
        for (const b of top) if (picked.length < 3 && !picked.includes(b)) picked.push(b);
        const colors = picked.map((b) => {
          let rgb = [b.r / b.w, b.g / b.w, b.b / b.w];
          const l = (Math.max(...rgb) + Math.min(...rgb)) / 2;
          if (l < 110) rgb = rgb.map((v) => Math.min(255, v + (110 - l) * 0.8));
          return `rgb(${rgb.map(Math.round).join(' ')})`;
        });
        while (colors.length && colors.length < 3) colors.push(colors[colors.length - 1]);
        resolve(colors.length ? colors : null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Devuelve 3 colores de la imagen como "rgb(r g b)", o null */
export function useArtPalette(url) {
  const [palette, setPalette] = useState(() => (url ? paletteCache.get(url) ?? null : null));
  useEffect(() => {
    if (!url) return setPalette(null);
    if (paletteCache.has(url)) return setPalette(paletteCache.get(url));
    let alive = true;
    extractPalette(url).then((p) => {
      paletteCache.set(url, p);
      if (alive) setPalette(p);
    });
    return () => {
      alive = false;
    };
  }, [url]);
  return palette;
}

// ---------- Spotify Canvas (vídeos en bucle) ----------
// La Web API oficial no ofrece Canvas: se piden a /api/canvas (función serverless en api/canvas.js).
// Se puede apuntar a otro servicio con VITE_CANVAS_API (respuesta: { canvasesList: [{ canvasUrl }] }).
const CANVAS_API = import.meta.env.VITE_CANVAS_API ?? '/api/canvas';
const canvasCache = new Map();

export const canvasEnabled = !!CANVAS_API;

export async function getCanvasUrl(trackId) {
  if (!CANVAS_API || !trackId) return null;
  if (canvasCache.has(trackId)) return canvasCache.get(trackId);
  try {
    const res = await fetch(`${CANVAS_API}?trackId=${encodeURIComponent(trackId)}`);
    const data = res.ok ? await res.json() : null;
    const url = data?.canvasesList?.[0]?.canvasUrl || data?.canvasUrl || null;
    canvasCache.set(trackId, url);
    return url;
  } catch {
    canvasCache.set(trackId, null);
    return null;
  }
}

export function useCanvas(trackId) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    setUrl(canvasCache.get(trackId) ?? null);
    getCanvasUrl(trackId).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [trackId]);
  return url;
}
