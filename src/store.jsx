import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { prefetchQueue, prefetchTrack } from './prefetch.js';
import { getToken, sp } from './spotify.js';

const POLL_MS = 3000; // sondeo del estado de reproducción con la pestaña visible
const POLL_HIDDEN_MS = 15000; // con la pestaña en segundo plano (gasta menos red y batería)
const RESTART_MS = 3000; // "Anterior" con más de 3 s reproducidos vuelve al principio de la canción
const EXPECT_MS = 3500; // tiempo que se respeta un cambio optimista mientras Spotify lo confirma

/** Posición estimada ahora mismo a partir del último estado conocido */
const positionOf = (pb) =>
  pb ? Math.min(pb.item?.duration_ms || 0, pb.progress_ms + (pb.is_playing ? Date.now() - pb.fetchedAt : 0)) : 0;

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
  const [queue, setQueue] = useState([]); // próximas canciones (de Spotify)
  const [history, setHistory] = useState([]); // canciones ya escuchadas en esta sesión (la última primero)
  const playerRef = useRef(null);
  const sdkIdRef = useRef(null);
  const playbackRef = useRef(null);
  const queueRef = useRef([]);
  const historyRef = useRef([]);
  const expectRef = useRef(null); // { uri, playing, until }: cambio optimista pendiente de confirmar
  const retryRef = useRef(null);
  const lastItemRef = useRef(null); // última canción vista (para el historial)
  // Estado completo (reproducción, cola, historial) antes del primer cambio optimista sin confirmar:
  // permite deshacerlo en local aunque Spotify no responda
  const snapRef = useRef(null);
  const rollbackRef = useRef(() => {});
  const expireRef = useRef(null); // temporizador que deshace el cambio si no se confirma a tiempo
  const rolledBackRef = useRef(null); // canción cuyo paso automático a la siguiente se deshizo
  const txRef = useRef(0); // identificador de cada cambio optimista
  playbackRef.current = playback;
  queueRef.current = queue;
  historyRef.current = history;

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
      // Si hay un cambio optimista (siguiente, pausa…) se ignoran las respuestas que aún no lo
      // reflejan: así la interfaz no "rebota" a la canción o estado anteriores
      const e = expectRef.current;
      if (e) {
        const matches =
          (!e.uri || st?.item?.uri === e.uri) &&
          (e.playing === undefined || st?.is_playing === e.playing) &&
          // Tras buscar, la posición que devuelve Spotify debe estar cerca de la pedida
          (e.pos === undefined || (st && Math.abs(st.progress_ms - (e.pos + (st.is_playing ? Date.now() - e.at : 0))) < 2500));
        if (!matches && Date.now() < e.until) {
          clearTimeout(retryRef.current);
          retryRef.current = setTimeout(refreshPlayback, 700);
          return;
        }
        // Confirmado: el cambio se da por bueno. Sin confirmar a tiempo: se deshace
        if (matches) {
          snapRef.current = null;
          rolledBackRef.current = null;
        } else rollbackRef.current(e.tx);
      }
      expectRef.current = null;
      clearTimeout(expireRef.current);
      setPlayback(st ? { ...st, fetchedAt: Date.now() } : null);
    } catch {
      /* silencioso */
    }
  }, []);

  /** Aplica un cambio en la interfaz antes de que Spotify lo confirme */
  /** Aplica un cambio en la interfaz antes de que Spotify lo confirme. Devuelve su identificador:
   *  solo un fallo de esa misma orden (o su plazo vencido) puede deshacerlo. */
  const optimistic = useCallback((patch, expect, { auto = false } = {}) => {
    const tx = ++txRef.current;
    if (!snapRef.current) {
      snapRef.current = {
        playback: playbackRef.current,
        queue: queueRef.current,
        history: historyRef.current,
        last: lastItemRef.current,
        txs: new Set(),
        auto: false,
      };
    }
    snapRef.current.txs.add(tx);
    if (auto) snapRef.current.auto = true;
    setPlayback((pb) => (pb ? { ...pb, ...patch, fetchedAt: Date.now() } : pb));
    const e = { ...expect, tx, until: Date.now() + EXPECT_MS };
    expectRef.current = e;
    // Si en el plazo no llega la confirmación (o fallan las consultas), se deshace igualmente
    clearTimeout(expireRef.current);
    expireRef.current = setTimeout(() => {
      if (expectRef.current !== e) return;
      expectRef.current = null;
      rollbackRef.current(tx);
    }, EXPECT_MS + 250);
    return tx;
  }, []);

  /** Pasa a la siguiente canción de la cola sin esperar al sondeo */
  const advance = useCallback(
    ({ auto = false } = {}) => {
      const next = queueRef.current[0];
      if (!next) return null;
      const tx = optimistic({ item: next, progress_ms: 0, is_playing: true }, { uri: next.uri }, { auto });
      setQueue((q) => q.slice(1));
      return tx;
    },
    [optimistic]
  );

  // ---------- Cola: se pide al cambiar de canción y se precargan las siguientes ----------
  const itemUri = playback?.item?.uri;
  const refreshQueue = useCallback(async () => {
    try {
      const q = await sp.queue();
      setQueue((q?.queue || []).filter(Boolean));
    } catch {
      /* no crítico */
    }
  }, []);
  useEffect(() => {
    if (!itemUri) return;
    // Pequeña espera: justo tras un cambio, Spotify a veces devuelve aún la cola anterior
    const t = setTimeout(refreshQueue, 900);
    return () => clearTimeout(t);
  }, [itemUri, refreshQueue]);
  useEffect(() => prefetchQueue(queue), [queue]);
  // Si la canción que suena figura al principio de la cola local, se quita (y lo anterior a ella):
  // mantiene la cola coherente aunque falle la consulta de la cola
  useEffect(() => {
    if (!itemUri) return;
    setQueue((q) => {
      const i = q.slice(0, 5).findIndex((t) => t.uri === itemUri);
      return i >= 0 ? q.slice(i + 1) : q;
    });
  }, [itemUri]);

  // ---------- Historial: la canción anterior también queda precargada ----------
  useEffect(() => {
    const it = playback?.item;
    const last = lastItemRef.current;
    if (it && last && last.uri !== it.uri) {
      setHistory((h) => [last, ...h.filter((x) => x.uri !== last.uri && x.uri !== it.uri)].slice(0, 20));
    }
    if (it) lastItemRef.current = it;
    // Al sonar otra canción, deja de bloquearse el paso automático de la que se deshizo
    if (it && it.uri !== rolledBackRef.current) rolledBackRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemUri]);
  // Al entrar, el historial empieza con lo último que se escuchó en Spotify
  useEffect(() => {
    sp.recentlyPlayed()
      .then((r) => {
        const tracks = (r?.items || []).map((x) => x.track).filter(Boolean);
        setHistory((h) => (h.length ? h : tracks.filter((t, i) => tracks.findIndex((x) => x.uri === t.uri) === i).slice(0, 20)));
      })
      .catch(() => {});
  }, []);
  const previousItem = history.find((t) => t.uri !== itemUri) || null;
  useEffect(() => {
    if (previousItem) prefetchTrack(previousItem, 0);
  }, [previousItem]);

  // ---------- Fin de canción: se adelanta el cambio en vez de esperar al siguiente sondeo ----------
  useEffect(() => {
    if (!playback?.is_playing || !playback.item) return;
    const uri = playback.item.uri;
    const remaining = playback.item.duration_ms - positionOf(playback);
    const t = setTimeout(() => {
      const pb = playbackRef.current;
      if (!pb?.is_playing || pb.item?.uri !== uri) return;
      // Si ya se deshizo el paso automático de esta canción (p. ej. sin conexión), no se repite en bucle
      if (pb.repeat_state !== 'track' && rolledBackRef.current !== uri) advance({ auto: true });
      setTimeout(refreshPlayback, 600);
      setTimeout(refreshPlayback, 1800);
    }, Math.max(0, remaining + 120));
    return () => clearTimeout(t);
  }, [playback, advance, refreshPlayback]);

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
  }, [fail, refreshPlaylists]);

  // Sondeo: cada 3 s con la pestaña visible y cada 15 s en segundo plano; al volver, al instante
  useEffect(() => {
    let t;
    const schedule = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        await refreshPlayback();
        schedule();
      }, document.hidden ? POLL_HIDDEN_MS : POLL_MS);
    };
    const onVisible = () => {
      if (document.hidden) return schedule();
      refreshPlayback();
      refreshQueue();
      schedule();
    };
    refreshPlayback();
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshPlayback, refreshQueue]);

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

  // Deshace un cambio de canción optimista que no llegó a ocurrir
  rollbackRef.current = (tx) => {
    const snap = snapRef.current;
    // Solo se deshace si la copia cubre esa transacción (una orden ajena que falle no toca nada)
    if (!snap || !snap.txs.has(tx)) return;
    snapRef.current = null;
    if (expectRef.current?.tx && snap.txs.has(expectRef.current.tx)) expectRef.current = null;
    clearTimeout(expireRef.current);
    setPlayback(snap.playback);
    setQueue(snap.queue);
    setHistory(snap.history);
    lastItemRef.current = snap.last;
    // Solo si lo deshecho incluía el paso automático de fin de canción, no se repite para esta canción
    if (snap.auto) rolledBackRef.current = snap.playback?.item?.uri ?? null;
    // Después se intenta sincronizar con Spotify; si falla, se queda la copia restaurada
    refreshQueue();
  };

  /** Ejecuta una orden. `tx`: identificador del cambio optimista que la acompaña (si lo hay) */
  const run = useCallback(
    (fn, okMsg, tx = null) =>
      withDevice(fn)
        .then(() => okMsg && toast(okMsg))
        .catch((e) => {
          // Si falla, se deshace solo el cambio optimista de esta misma orden
          if (tx != null) rollbackRef.current(tx);
          refreshPlayback();
          fail(e);
        }),
    [withDevice, toast, fail, refreshPlayback]
  );

  const actions = {
    playContext: (context_uri, offsetUri) =>
      run((d) => sp.play({ context_uri, offset: offsetUri ? { uri: offsetUri } : undefined }, d)),
    playUris: (uris, index = 0) => run((d) => sp.play({ uris, offset: { position: index } }, d)),
    toggle: () => {
      const pb = playbackRef.current;
      if (!pb?.item) return run((d) => sp.play({}, d));
      const playing = !pb.is_playing;
      const tx = optimistic({ is_playing: playing, progress_ms: positionOf(pb) }, { uri: pb.item.uri, playing });
      return run((d) => (playing ? sp.play({}, d) : sp.pause(d)), null, tx);
    },
    next: () => {
      const tx = playbackRef.current?.repeat_state !== 'track' ? advance() : null;
      return run(() => sp.next(), null, tx);
    },
    previous: () => {
      const pb = playbackRef.current;
      // Con más de 3 s reproducidos, "Anterior" vuelve al principio de la canción (como Spotify)
      if (pb?.item && positionOf(pb) > RESTART_MS) {
        const tx = optimistic({ progress_ms: 0 }, { uri: pb.item.uri, pos: 0, at: Date.now() });
        return run(() => sp.seek(0), null, tx);
      }
      const prev = pb?.item && historyRef.current.find((t) => t.uri !== pb.item.uri);
      let tx = null;
      if (prev) {
        // Si Spotify lo rechaza o no lo confirma, rollbackRef restaura reproducción, historial y cola
        tx = optimistic({ item: prev, progress_ms: 0, is_playing: true }, { uri: prev.uri });
        setQueue((q) => [pb.item, ...q]);
        setHistory((h) => h.filter((t) => t.uri !== prev.uri));
        lastItemRef.current = prev;
      }
      return run(() => sp.previous(), null, tx);
    },
    seek: (ms) => {
      const pb = playbackRef.current;
      const pos = Math.round(ms);
      // El estado global también se mueve: si no, el aviso de fin de canción saltaría a destiempo
      const tx = pb?.item ? optimistic({ progress_ms: pos }, { uri: pb.item.uri, pos, at: Date.now() }) : null;
      return run(() => sp.seek(pos), null, tx);
    },
    volume: (v) => run(() => sp.volume(Math.round(v))),
    shuffle: () => run(() => sp.shuffle(!playback?.shuffle_state)),
    repeat: () => {
      const order = ['off', 'context', 'track'];
      const nextState = order[(order.indexOf(playback?.repeat_state || 'off') + 1) % 3];
      return run(() => sp.repeat(nextState));
    },
    transfer: (id) => run(() => sp.transfer(id, true), 'Reproducción transferida'),
    addToQueue: (uri) => run((d) => sp.addToQueue(uri, d), 'Añadido a la cola').then(() => setTimeout(refreshQueue, 500)),
  };

  // ---------- Título de la pestaña y controles multimedia del sistema ----------
  const item = playback?.item;
  useEffect(() => {
    const who = item?.artists?.map((a) => a.name).join(', ') || item?.show?.name || '';
    document.title = item ? `${item.name} – ${who}` : 'Sonora';
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = item
      ? new window.MediaMetadata({
          title: item.name,
          artist: who,
          album: item.album?.name || item.show?.name || '',
          artwork: (item.album?.images || item.images || []).map((i) => ({
            src: i.url,
            sizes: i.width ? `${i.width}x${i.height || i.width}` : undefined,
            type: 'image/jpeg',
          })),
        })
      : null;
  }, [item]);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const handlers = {
      play: () => !playbackRef.current?.is_playing && actionsRef.current.toggle(),
      pause: () => playbackRef.current?.is_playing && actionsRef.current.toggle(),
      nexttrack: () => actionsRef.current.next(),
      previoustrack: () => actionsRef.current.previous(),
      seekto: (d) => d.seekTime != null && actionsRef.current.seek(d.seekTime * 1000),
    };
    for (const [k, f] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(k, f);
      } catch {
        /* acción no admitida por el navegador */
      }
    }
  }, []);
  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playback?.is_playing ? 'playing' : 'paused';
  }, [playback?.is_playing]);

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
    queue,
    refreshQueue,
    previousItem,
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
