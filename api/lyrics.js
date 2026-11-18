// Función serverless de Vercel: letra de NetEase Cloud Music para una canción (ver _netease.js).
// GET /api/lyrics?name=…&artist=…&duration=ms  o  /api/lyrics?id=ID_DE_NETEASE
import { lookupLyrics, parseQuery } from './_netease.js';

export default async function handler(req, res) {
  const q = parseQuery(req.query || {});
  if (!q) return res.status(400).json({ error: 'Faltan el nombre de la canción o el id' });
  try {
    const data = await lookupLyrics(q);
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(data);
  } catch {
    // Fallo temporal de NetEase: la app sigue con LRCLIB
    return res.status(502).json({ found: false, error: 'NetEase no responde' });
  }
}
