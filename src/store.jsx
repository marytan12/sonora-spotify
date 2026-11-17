import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getToken, sp } from './spotify.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// ---------- Router mínimo basado en hash: #/album/ID ----------
function parseHash() {
  const [name = 'home', id = null, extra = null] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'home', id: id && decodeURIComponent(id), extra: extra && decodeURIComponent(extra) };
}
export const go = (name, id, extra) => {
  window.location.hash = '/' + [name, id, extra].filter(Boolean).map(encodeURIComponent).join('/');
};

export function AppProvider({ children }) {
  const [route, setRoute] = useState(parseHash);
  const [user, setUser] = useState(null);
  const [playback, setPlayback] = useState(null);
  const [devices, setDevices] = useState([]);
  const [sdkDeviceId, setSdkDeviceId] = useState(null);
  const [sdkError, setSdkError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [saved, setSaved] = useState({}); // uri -> boolean
  const [addTarget, setAddTarget] = useState(null); // uris para el modal "Añadir a playlist"
  const playerRef = useRef(null);
  const sdkIdRef = useRef(null);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const toast = useCallback((msg, type = 'info') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  const fail = useCallback(
    (e) => {
      const msg =
        e?.status === 404 && /device/i.test(e.message)
          ? 'No hay ningún dispositivo activo. Abre Spotify o activa el reproductor web.'
          : e?.status === 403
            ? `Spotify no permite esta acción (${e.message}). Puede requerir Premium.`
            : e?.message || String(e);
      toast(msg, 'error');
    },
    [toast]
  );

  const refreshPlaylists = useCallback(async () => {
    try {
      let all = [];
      let offset = 0;
      for (;;) {
        const page = await sp.myPlaylists(offset);
        all = all.concat(page.items.filter(Boolean));
        if (!page.next || all.length >= 500) break;
        offset += 50;
      }
      setPlaylists(all);
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const refreshPlayback = useCallback(async () => {
    try {
      const st = await sp.playback();
      setPlayback(st ? { ...st, fetchedAt: Date.now() } : null);
    } catch {
      /* silencioso */
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const d = await sp.devices();
      setDevices(d?.devices || []);
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  useEffect(() => {
    sp.me().then(setUser).catch(fail);
    refreshPlaylists();
    refreshPlayback();
    const t = setInterval(refreshPlayback, 4000);
    return () => clearInterval(t);
  }, [fail, refreshPlaylists, refreshPlayback]);

  // ---------- Web Playback SDK: convierte el navegador en un dispositivo (requiere Premium) ----------
  useEffect(() => {
    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: 'Sonora Web Player',
        getOAuthToken: (cb) => getToken().then(cb),
        volume: 0.6,
      });
      player.addListener('ready', ({ device_id }) => {
        sdkIdRef.current = device_id;
        setSdkDeviceId(device_id);
      });
      player.addListener('not_ready', () => setSdkDeviceId(null));
      player.addListener('player_state_changed', () => setTimeout(refreshPlayback, 300));
      player.addListener('account_error', () => setSdkError('El reproductor web requiere Spotify Premium.'));
      player.addListener('initialization_error', ({ message }) => setSdkError(message));
      player.addListener('authentication_error', ({ message }) => setSdkError(message));
      player.connect();
      playerRef.current = player;
    };
    if (!document.getElementById('spotify-sdk')) {
      const s = document.createElement('script');
      s.id = 'spotify-sdk';
      s.src = 'https://sdk.scdn.co/spotify-player.js';
      document.body.appendChild(s);
    }
    return () => playerRef.current?.disconnect();
  }, [refreshPlayback]);

  // Ejecuta una orden; si no hay dispositivo activo intenta usar el reproductor web
  const withDevice = useCallback(
    async (fn) => {
      try {
        await fn(undefined);
      } catch (e) {
        if (e.status === 404 && sdkIdRef.current) {
          playerRef.current?.activateElement?.();
          await fn(sdkIdRef.current);
        } else throw e;
      }
      setTimeout(refreshPlayback, 400);
    },
    [refreshPlayback]
  );

  const run = useCallback(
    (fn, okMsg) =>
      withDevice(fn)
        .then(() => okMsg && toast(okMsg))
        .catch(fail),
    [withDevice, toast, fail]
  );

  const actions = {
    playContext: (context_uri, offsetUri) =>
      run((d) => sp.play({ context_uri, offset: offsetUri ? { uri: offsetUri } : undefined }, d)),
    playUris: (uris, index = 0) => run((d) => sp.play({ uris, offset: { position: index } }, d)),
    toggle: () => run((d) => (playback?.is_playing ? sp.pause(d) : sp.play({}, d))),
    next: () => run(() => sp.next()),
    previous: () => run(() => sp.previous()),
    seek: (ms) => run(() => sp.seek(Math.round(ms))),
    volume: (v) => run(() => sp.volume(Math.round(v))),
    shuffle: () => run(() => sp.shuffle(!playback?.shuffle_state)),
    repeat: () => {
      const order = ['off', 'context', 'track'];
      const nextState = order[(order.indexOf(playback?.repeat_state || 'off') + 1) % 3];
      return run(() => sp.repeat(nextState));
    },
    transfer: (id) => run(() => sp.transfer(id, true), 'Reproducción transferida'),
    addToQueue: (uri) => run((d) => sp.addToQueue(uri, d), 'Añadido a la cola'),
  };

  // ---------- Guardados ("Me gusta") ----------
  const checkSaved = useCallback(async (uris) => {
    const missing = [...new Set(uris.filter(Boolean))];
    if (!missing.length) return;
    try {
      const res = await sp.libraryContains(missing);
      setSaved((s) => {
        const n = { ...s };
        missing.forEach((u, i) => (n[u] = !!res[i]));
        return n;
      });
    } catch {
      /* no crítico */
    }
  }, []);

  const toggleSaved = useCallback(
    async (uri) => {
      const isSaved = !!saved[uri];
      setSaved((s) => ({ ...s, [uri]: !isSaved }));
      try {
        await (isSaved ? sp.libraryRemove([uri]) : sp.librarySave([uri]));
        toast(isSaved ? 'Eliminado de tu biblioteca' : 'Guardado en tu biblioteca');
      } catch (e) {
        setSaved((s) => ({ ...s, [uri]: isSaved }));
        fail(e);
      }
    },
    [saved, toast, fail]
  );

  const value = {
    route,
    user,
    playback,
    setPlayback,
    devices,
    refreshDevices,
    refreshPlayback,
    sdkDeviceId,
    sdkError,
    actions,
    toast,
    fail,
    playlists,
    refreshPlaylists,
    saved,
    checkSaved,
    toggleSaved,
    addTarget,
    openAddToPlaylist: setAddTarget,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
