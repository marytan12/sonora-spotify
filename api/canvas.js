// Función serverless de Vercel: obtiene el Canvas (vídeo en bucle) de una canción.
// Spotify no ofrece Canvas en su API oficial; se usa un servicio comunitario (no oficial).
// Se puede cambiar el origen con la variable de entorno CANVAS_UPSTREAM.
export default async function handler(req, res) {
  const trackId = String(req.query.trackId || '');
  if (!/^[A-Za-z0-9]{22}$/.test(trackId)) {
    return res.status(400).json({ error: 'trackId no válido', canvasesList: [] });
  }
  const upstream = process.env.CANVAS_UPSTREAM || 'https://spotify-canva.vercel.app/api/canvas';
  try {
    const r = await fetch(`${upstream}?trackId=${trackId}`, { signal: AbortSignal.timeout(8000) });
    // Si el servicio falla, se responde 502 para que la app distinga el fallo de "sin Canvas"
    if (!r.ok) return res.status(502).json({ error: `Servicio de Canvas: ${r.status}`, canvasesList: [] });
    const data = await r.json();
    const canvasesList = (data.canvasesList || [])
      .filter((c) => typeof c.canvasUrl === 'string' && c.canvasUrl.startsWith('https://'))
      .map((c) => ({ canvasUrl: c.canvasUrl }));
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ canvasesList });
  } catch {
    return res.status(502).json({ canvasesList: [] });
  }
}
