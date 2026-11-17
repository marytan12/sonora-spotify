// Autenticación (Authorization Code + PKCE) y cliente de la Spotify Web API.
// PKCE no necesita client secret, así que es seguro ejecutarlo 100% en el navegador.

export const CLIENT_ID =
  import.meta.env.VITE_SPOTIFY_CLIENT_ID || '45b12091ff35490ab9a698fb4ca55fad';
export const REDIRECT_URI = `${window.location.origin}/callback`;

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
  'user-library-read',
  'user-library-modify',
  'user-follow-read',
  'user-follow-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-top-read',
  'user-read-recently-played',
  'ugc-image-upload',
].join(' ');

const TOKEN_KEY = 'sonora_tokens';
const API = 'https://api.spotify.com/v1';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const randomString = (n) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => CHARS[x % CHARS.length]).join('');

async function challengeFrom(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function loadTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY));
  } catch {
    return null;
  }
}

function saveTokens(t) {
  const old = loadTokens() || {};
  localStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({
      access_token: t.access_token,
      refresh_token: t.refresh_token || old.refresh_token,
      expires_at: Date.now() + t.expires_in * 1000,
    })
  );
}

export const isLoggedIn = () => !!loadTokens()?.refresh_token;

export async function login() {
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem('pkce_verifier', verifier);
  sessionStorage.setItem('pkce_state', state);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: await challengeFrom(verifier),
    state,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = '/';
}

async function tokenRequest(body) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || 'Error de autenticación');
  saveTokens(json);
  return json.access_token;
}

/** Procesa la vuelta de Spotify en /callback. Devuelve true si se ha iniciado sesión. */
export async function handleCallback() {
  if (window.location.pathname !== '/callback') return false;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  const state = params.get('state');
  window.history.replaceState({}, '', '/');
  if (error) throw new Error(`Spotify ha rechazado el acceso: ${error}`);
  if (!code) return false;
  if (state !== sessionStorage.getItem('pkce_state')) throw new Error('El estado OAuth no coincide');
  await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: sessionStorage.getItem('pkce_verifier'),
  });
  sessionStorage.removeItem('pkce_verifier');
  sessionStorage.removeItem('pkce_state');
  return true;
}

let refreshing = null;
export async function getToken() {
  const t = loadTokens();
  if (!t) return null;
  if (Date.now() < t.expires_at - 60_000) return t.access_token;
  if (!refreshing) {
    refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token })
      .catch((e) => {
        localStorage.removeItem(TOKEN_KEY);
        throw e;
      })
      .finally(() => (refreshing = null));
  }
  return refreshing;
}

export async function api(path, { method = 'GET', query, body, raw, contentType } = {}) {
  const token = await getToken();
  if (!token) throw new Error('Sesión no iniciada');
  const url = new URL(path.startsWith('http') ? path : API + path);
  if (query)
    Object.entries(query).forEach(([k, v]) => v !== undefined && v !== null && url.searchParams.set(k, v));
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (raw !== undefined) {
    payload = raw;
    headers['Content-Type'] = contentType || 'text/plain';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { method, headers, body: payload });
  if (res.status === 429) {
    const wait = Number(res.headers.get('Retry-After') || 1);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return api(path, { method, query, body, raw, contentType });
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// ---- Endpoints (adaptados a los cambios de febrero de 2026 del modo desarrollo) ----
export const sp = {
  me: () => api('/me'),

  // Búsqueda: máximo 10 resultados por petición
  search: (q, types, offset = 0) =>
    api('/search', { query: { q, type: types.join(','), limit: 10, offset } }),

  top: (type, time_range = 'medium_term', limit = 20) =>
    api(`/me/top/${type}`, { query: { time_range, limit } }),
  recentlyPlayed: () => api('/me/player/recently-played', { query: { limit: 30 } }),

  // Biblioteca
  myPlaylists: (offset = 0) => api('/me/playlists', { query: { limit: 50, offset } }),
  savedTracks: (offset = 0) => api('/me/tracks', { query: { limit: 50, offset } }),
  savedAlbums: (offset = 0) => api('/me/albums', { query: { limit: 50, offset } }),
  savedShows: (offset = 0) => api('/me/shows', { query: { limit: 50, offset } }),
  savedEpisodes: (offset = 0) => api('/me/episodes', { query: { limit: 50, offset } }),
  followedArtists: (after) => api('/me/following', { query: { type: 'artist', limit: 50, after } }),
  librarySave: (uris) => api('/me/library', { method: 'PUT', query: { uris: uris.join(',') } }),
  libraryRemove: (uris) => api('/me/library', { method: 'DELETE', query: { uris: uris.join(',') } }),
  async libraryContains(uris) {
    const out = [];
    for (const part of chunk(uris, 40)) {
      out.push(...(await api('/me/library/contains', { query: { uris: part.join(',') } })));
    }
    return out;
  },

  // Playlists
  playlist: (id) => api(`/playlists/${id}`),
  playlistItems: (id, offset = 0) => api(`/playlists/${id}/items`, { query: { limit: 50, offset } }),
  createPlaylist: (name, description, isPublic) =>
    api('/me/playlists', { method: 'POST', body: { name, description, public: isPublic } }),
  updatePlaylist: (id, data) => api(`/playlists/${id}`, { method: 'PUT', body: data }),
  addToPlaylist: (id, uris) => api(`/playlists/${id}/items`, { method: 'POST', body: { uris } }),
  removeFromPlaylist: (id, uris) =>
    api(`/playlists/${id}/items`, { method: 'DELETE', body: { items: uris.map((uri) => ({ uri })) } }),
  reorderPlaylist: (id, range_start, insert_before) =>
    api(`/playlists/${id}/items`, { method: 'PUT', body: { range_start, insert_before, range_length: 1 } }),
  uploadCover: (id, base64Jpeg) =>
    api(`/playlists/${id}/images`, { method: 'PUT', raw: base64Jpeg, contentType: 'image/jpeg' }),

  // Catálogo
  album: (id) => api(`/albums/${id}`),
  albumTracks: (id, offset = 0) => api(`/albums/${id}/tracks`, { query: { limit: 50, offset } }),
  artist: (id) => api(`/artists/${id}`),
  artistAlbums: (id, include_groups = 'album,single', offset = 0) =>
    api(`/artists/${id}/albums`, { query: { include_groups, limit: 10, offset } }),
  show: (id) => api(`/shows/${id}`),
  showEpisodes: (id, offset = 0) => api(`/shows/${id}/episodes`, { query: { limit: 50, offset } }),

  // Reproductor
  playback: () => api('/me/player', { query: { additional_types: 'track,episode' } }),
  devices: () => api('/me/player/devices'),
  play: (opts = {}, device_id) => {
    const { context_uri, uris, offset, position_ms } = opts;
    const body = {};
    if (context_uri) body.context_uri = context_uri;
    if (uris) body.uris = uris;
    if (offset !== undefined) body.offset = offset;
    if (position_ms !== undefined) body.position_ms = position_ms;
    return api('/me/player/play', {
      method: 'PUT',
      query: { device_id },
      body: Object.keys(body).length ? body : undefined,
    });
  },
  pause: (device_id) => api('/me/player/pause', { method: 'PUT', query: { device_id } }),
  next: () => api('/me/player/next', { method: 'POST' }),
  previous: () => api('/me/player/previous', { method: 'POST' }),
  seek: (position_ms) => api('/me/player/seek', { method: 'PUT', query: { position_ms } }),
  volume: (volume_percent) => api('/me/player/volume', { method: 'PUT', query: { volume_percent } }),
  shuffle: (state) => api('/me/player/shuffle', { method: 'PUT', query: { state } }),
  repeat: (state) => api('/me/player/repeat', { method: 'PUT', query: { state } }),
  transfer: (device_id, play = true) =>
    api('/me/player', { method: 'PUT', body: { device_ids: [device_id], play } }),
  queue: () => api('/me/player/queue'),
  addToQueue: (uri, device_id) => api('/me/player/queue', { method: 'POST', query: { uri, device_id } }),
};
