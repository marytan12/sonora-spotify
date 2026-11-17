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
