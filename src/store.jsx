import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { prefetchQueue, prefetchTrack } from './prefetch.js';
import { readSettings } from './settings.js';
import { getToken, sp } from './spotify.js';

const POLL_MS = 3000; // sondeo del estado de reproducción con la pestaña visible
const POLL_HIDDEN_MS = 15000; // con la pestaña en segundo plano (gasta menos red y batería)
const RESTART_MS = 3000; // "Anterior" con más de 3 s reproducidos vuelve al principio de la canción
const EXPECT_MS = 3500; // tiempo que se respeta un cambio optimista mientras Spotify lo confirma

/**
 * Ajusta cola e historial locales a la canción que suena de verdad. Si no es la que se esperaba,
 * se quita de la cabeza de la cola (si está ahí) y la esperada pasa al historial.
 * `shownUri`: canción que se ve ahora en pantalla (para que el recorte automático no se repita).
 */
function reconcile(local, realItem, shownUri) {
  if (!realItem || local.last?.uri === realItem.uri) return local;
  return {
    ...local,
    queue: local.queue[0]?.uri === realItem.uri ? local.queue.slice(1) : local.queue,
    history: local.last
      ? [local.last, ...local.history.filter((x) => x.uri !== local.last.uri && x.uri !== realItem.uri)].slice(0, 20)
      : local.history,
    last: realItem,
    consumed: shownUri !== realItem.uri ? realItem.uri : null,
  };
}

/** Aplica una operación; si ya se conoce la cola real de Spotify tras ella, esa sustituye a la calculada */
const applyOp = (acc, op) => {
  const next = op.apply(acc);
  return op.queueAfter ? { ...next, queue: op.queueAfter } : next;
};

/** Posición estimada ahora mismo a partir del último estado conocido */
const positionOf = (pb) =>
  pb ? Math.min(pb.item?.duration_ms || 0, pb.progress_ms + (pb.is_playing ? Date.now() - pb.fetchedAt : 0)) : 0;

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// ---------- Router mínimo basado en hash: #/album/ID ----------
function parseHash() {
  // Sin ruta (al abrir la app), se va a la sección de inicio elegida en Ajustes
  const raw = window.location.hash.replace(/^#\/?/, '') || readSettings().startPage;
  const [name = 'home', id = null, extra = null] = raw.split('/');
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
  // Volumen pedido que Spotify aún no ha confirmado (para que la barra responda al instante)
  const [pendingVolume, setPendingVolume] = useState(null);
  const fadeRef = useRef(0); // subida suave de volumen en curso (se cancela al cambiar el volumen a mano)
  const sdkStateRef = useRef(null); // { uri, name, dur, pos, at, playing } del reproductor de este navegador
  const startVolumeRef = useRef(false); // el volumen al abrir la app ya se ha aplicado
  const playerRef = useRef(null);
  const sdkIdRef = useRef(null);
  const playbackRef = useRef(null);
  const queueRef = useRef([]);
  const historyRef = useRef([]);
  const retryRef = useRef(null);
  // Las consultas del estado se numeran: una respuesta que llega después de que ya se haya aplicado
  // otra más nueva (las respuestas pueden llegar desordenadas) se descarta
  const pollSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);
  const lastItemRef = useRef(null); // última canción vista (para el historial)
  // ---- Interfaz optimista: lo que se ve = estado base confirmado + operaciones pendientes ----
  // Cada orden (siguiente, pausa, buscar…) es una operación que se aplica encima del estado base.
  // Si una falla, se quita solo esa y se recalcula el resto: el orden en que fallen da igual.
  const baseRef = useRef(null); // { playback, queue, history, last, consumed } antes de la 1.ª operación
  const opsRef = useRef([]); // [{ tx, apply, expect, auto, fromUri, accepted, timer }]
  const removeOpRef = useRef(() => {});
  const rolledBackRef = useRef(null); // canción cuyo paso automático a la siguiente se deshizo
  const consumedRef = useRef(null); // canción que «Siguiente» ya sacó de la cola local
  const txRef = useRef(0); // identificador de cada operación
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
            ? `Spotify ha rechazado esta acción (${e.message}).`
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

  /** Estado local completo que se ve ahora mismo */
  const currentLocal = () => ({
    playback: playbackRef.current,
    queue: queueRef.current,
    history: historyRef.current,
    last: lastItemRef.current,
    consumed: consumedRef.current,
  });

  /** Muestra un estado local completo (y actualiza las refs al momento para la siguiente orden) */
  const commit = useCallback((st) => {
    playbackRef.current = st.playback;
    queueRef.current = st.queue;
    historyRef.current = st.history;
    lastItemRef.current = st.last;
    consumedRef.current = st.consumed;
    setPlayback(st.playback);
    setQueue(st.queue);
    setHistory(st.history);
  }, []);

  /** Vuelve a calcular lo que se ve: estado base + operaciones que siguen vivas */
  const recompute = useCallback(() => {
    const base = baseRef.current;
    if (!base) return;
    commit(opsRef.current.reduce(applyOp, base));
    if (!opsRef.current.length) baseRef.current = null;
  }, [commit]);

  const clearOps = () => {
    opsRef.current.forEach((o) => clearTimeout(o.timer));
    opsRef.current = [];
    baseRef.current = null;
  };

  const refreshQueueRef = useRef(() => {});

  const refreshPlayback = useCallback(async () => {
    const seq = ++pollSeqRef.current;
    try {
      const sent = Date.now();
      const st = await sp.playback();
      // La posición que da Spotify es la del momento en que la calculó (a mitad del viaje de ida y
      // vuelta), no la de cuando llega la respuesta: sin esto, la letra iba siempre algo retrasada
      const fetchedAt = Date.now() - Math.min((Date.now() - sent) / 2, 400);
      if (seq < appliedSeqRef.current) return; // respuesta atrasada: ya se aplicó una más reciente
      const ops = opsRef.current;
      if (ops.length) {
        // Mientras la última orden no se refleje, se ignoran respuestas antiguas para no "rebotar"
        const e = ops[ops.length - 1].expect;
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
        const last = ops[ops.length - 1];
        // El sondeo confirma solo la última orden, no las anteriores que aún no han respondido
        if (matches) {
          last.accepted = true;
          rolledBackRef.current = null;
        } else {
          for (const o of ops) if (!o.accepted && o.auto) rolledBackRef.current = o.fromUri;
        }
        // La reproducción pasa a ser la real. La cola y el historial se recalculan solo con los
        // cambios de canción aceptados y se contrastan con la canción que suena de verdad: un
        // «Siguiente» sin respuesta (o rechazado más tarde) no se queda comido en la cola
        const kept = ops.filter((o) => !o.track || o.accepted);
        const candidate = kept.reduce(applyOp, baseRef.current);
        const real = st ? { ...st, fetchedAt } : null;
        const local = reconcile(candidate, real?.item, playbackRef.current?.item?.uri);
        clearOps();
        appliedSeqRef.current = seq;
        commit({ ...local, playback: real });
        setTimeout(() => refreshQueueRef.current(), 0);
        return;
      }
      const real = st ? { ...st, fetchedAt } : null;
      appliedSeqRef.current = seq;
      playbackRef.current = real;
      setPlayback(real);
    } catch {
      /* silencioso */
    }
  }, [recompute]);

  /** Añade una operación optimista. `apply(estado) -> estado` debe poder reaplicarse sobre otra base.
   *  Devuelve su identificador; se quita si su orden falla o si vence el plazo sin ser aceptada. */
  const addOp = useCallback(
    (apply, expect, { auto = false, track = false } = {}) => {
      if (!opsRef.current.length) baseRef.current = currentLocal();
      const tx = ++txRef.current;
      const op = {
        tx,
        apply,
        auto,
        track, // cambia de canción (afecta a la cola y al historial)
        fromUri: playbackRef.current?.item?.uri ?? null,
        accepted: false, // Spotify respondió OK a la orden
        expect: { ...expect, until: Date.now() + EXPECT_MS },
      };
      // Plazo propio: si Spotify no ha aceptado la orden a tiempo, se quita (aunque no lleguen consultas)
      op.timer = setTimeout(() => !op.accepted && removeOpRef.current(tx), EXPECT_MS + 250);
      opsRef.current = [...opsRef.current, op];
      commit(apply(currentLocal()));
      return tx;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit]
  );

  /** Pasa a la siguiente canción de la cola sin esperar al sondeo */
  const advance = useCallback(
    ({ auto = false } = {}) => {
      const next = queueRef.current[0];
      if (!next || !playbackRef.current?.item) return null;
      const at = Date.now();
      return addOp(
        (st) => {
          const cur = st.playback?.item;
          const nx = st.queue[0];
          if (!cur || !nx) return st;
          return {
            ...st,
            playback: { ...st.playback, item: nx, progress_ms: 0, is_playing: true, fetchedAt: at },
            queue: st.queue.slice(1),
            history: [cur, ...st.history.filter((x) => x.uri !== cur.uri && x.uri !== nx.uri)].slice(0, 20),
            last: nx,
            consumed: nx.uri, // ya salió de la cola: el recorte automático no debe repetirlo
          };
        },
        { uri: next.uri },
        { auto, track: true }
      );
    },
    [addOp]
  );

  // ---------- Cola: se pide al cambiar de canción y se precargan las siguientes ----------
  const itemUri = playback?.item?.uri;
  // Solo un cambio de canción aún sin respuesta impide actualizar la cola (pausa o buscar no la tocan)
  const trackPending = () => opsRef.current.some((o) => o.track && !o.accepted);
  const refreshQueue = useCallback(async () => {
    if (trackPending()) return;
    try {
      const q = await sp.queue();
      if (trackPending()) return;
      const list = (q?.queue || []).filter(Boolean);
      if (opsRef.current.length && baseRef.current) {
        // Las órdenes siguen pendientes (protegen de sondeos atrasados); la cola real se guarda en el
        // último cambio de canción aceptado, o en la base si solo hay pausas o búsquedas
        const tracks = opsRef.current.filter((o) => o.track);
        if (tracks.length) tracks[tracks.length - 1].queueAfter = list;
        else baseRef.current = { ...baseRef.current, queue: list };
      }
      queueRef.current = list;
      setQueue(list);
    } catch {
      /* no crítico: se mantiene la cola local */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  refreshQueueRef.current = refreshQueue;
  useEffect(() => {
    if (!itemUri) return;
    // Pequeña espera: justo tras un cambio, Spotify a veces devuelve aún la cola anterior
    const t = setTimeout(refreshQueue, 900);
    return () => clearTimeout(t);
  }, [itemUri, refreshQueue]);
  useEffect(() => prefetchQueue(queue), [queue]);
  // Si empieza a sonar justo la primera canción de la cola local (p. ej. se avanzó desde otro
  // dispositivo), se quita de la cola: así sigue coherente aunque falle la consulta de la cola.
  // Solo la primera posición: una misma canción puede estar más veces en la cola.
  useEffect(() => {
    if (!itemUri) return;
    if (consumedRef.current === itemUri) {
      consumedRef.current = null; // «Siguiente» ya la sacó de la cola
      return;
    }
    consumedRef.current = null;
    setQueue((q) => (q[0]?.uri === itemUri ? q.slice(1) : q));
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

  // ---------- Reloj fino del reproductor de este navegador ----------
  // Cuando suena aquí, la posición sale del propio reproductor (sin la latencia de la API): la
  // letra va mucho más pegada a la voz. `polled`: si viene de getCurrentState, solo vale con marca de tiempo.
  const captureSdk = (s, polled) => {
    const t = s?.track_window?.current_track;
    if (!t) {
      if (!polled) sdkStateRef.current = null;
      return;
    }
    const stamped = Number.isFinite(s.timestamp) && Math.abs(Date.now() - s.timestamp) < 60_000;
    if (polled && !stamped) return;
    sdkStateRef.current = {
      uri: t.uri,
      linked: t.linked_from?.uri || null,
      name: t.name,
      dur: s.duration || t.duration_ms || 0,
      pos: s.position || 0,
      at: stamped ? s.timestamp : Date.now(),
      playing: !s.paused,
    };
  };
  useEffect(() => {
    const t = setInterval(() => {
      const pb = playbackRef.current;
      if (!pb?.is_playing || !playerRef.current || pb.device?.id !== sdkIdRef.current || document.hidden) return;
      playerRef.current.getCurrentState().then((s) => captureSdk(s, true)).catch(() => {});
    }, 2000);
    return () => clearInterval(t);
  }, []);
  /** Estado del reproductor local, solo si es el dispositivo que suena ahora */
  const sdkClock = useRef({
    read: () => (playbackRef.current?.device?.id && playbackRef.current.device.id === sdkIdRef.current ? sdkStateRef.current : null),
  }).current;

  // ---------- Web Playback SDK: convierte el navegador en un dispositivo de Spotify ----------
  useEffect(() => {
    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: 'Sonora Web Player',
        getOAuthToken: (cb) => getToken().then(cb),
        volume: readSettings().startVolume >= 0 ? readSettings().startVolume / 100 : 0.6,
      });
      player.addListener('ready', ({ device_id }) => {
        sdkIdRef.current = device_id;
        setSdkDeviceId(device_id);
      });
      player.addListener('not_ready', () => setSdkDeviceId(null));
      player.addListener('player_state_changed', (s) => {
        captureSdk(s, false);
        setTimeout(refreshPlayback, 300);
      });
      player.addListener('account_error', () => setSdkError('No se ha podido activar el reproductor de este navegador con esta cuenta.'));
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

  // Una operación ha fallado (Spotify rechazó su orden o no la aceptó a tiempo): se quita solo esa
  // y lo que se ve se recalcula con las demás. Si no queda ninguna, se vuelve al estado base.
  removeOpRef.current = (tx) => {
    const op = opsRef.current.find((o) => o.tx === tx);
    if (!op) return;
    clearTimeout(op.timer);
    opsRef.current = opsRef.current.filter((o) => o !== op);
    // Si lo que falló es el paso automático de fin de canción, no se repite en bucle para esa canción
    if (op.auto) rolledBackRef.current = op.fromUri;
    recompute();
    // Si ya no queda nada pendiente, se intenta sincronizar la cola con Spotify
    refreshQueue();
  };

  /** Ejecuta una orden. `tx`: identificador del cambio optimista que la acompaña (si lo hay) */
  const run = useCallback(
    (fn, okMsg, tx = null) =>
      withDevice(fn)
        .then(() => {
          const op = tx != null && opsRef.current.find((o) => o.tx === tx);
          if (op) op.accepted = true;
          if (okMsg) toast(okMsg);
        })
        .catch((e) => {
          // Si falla, se quita solo la operación optimista de esta misma orden
          if (tx != null) removeOpRef.current(tx);
          refreshPlayback();
          fail(e);
        }),
    [withDevice, toast, fail, refreshPlayback]
  );

  // ---------- Volumen: el que se ve, la subida suave al dar play y el volumen al abrir la app ----------
  const volumeNow = pendingVolume?.v ?? playback?.device?.volume_percent ?? null;
  const volumeNowRef = useRef(null);
  volumeNowRef.current = volumeNow;
  useEffect(() => {
    if (!pendingVolume) return;
    if (playback?.device?.volume_percent === pendingVolume.v) {
      setPendingVolume(null);
      return;
    }
    const t = setTimeout(() => setPendingVolume(null), Math.max(0, 4000 - (Date.now() - pendingVolume.at)));
    return () => clearTimeout(t);
  }, [pendingVolume, playback?.device?.volume_percent]);

  /** true si suena en el reproductor de este navegador (ahí el volumen se cambia al instante, sin pedírselo a Spotify) */
  const isLocalDevice = () => !!(playerRef.current && sdkIdRef.current && playbackRef.current?.device?.id === sdkIdRef.current);
  const setVolumeQuiet = (v) => Promise.resolve(isLocalDevice() ? playerRef.current.setVolume(v / 100) : sp.volume(v)).catch(() => {});
  /** Subida suave: si está activada y no está sonando nada, devuelve los pasos para envolver la orden de reproducir */
  const fadeIn = () => {
    const target = volumeNowRef.current;
    if (!readSettings().fadeIn || playbackRef.current?.is_playing || target == null || target < 10) return null;
    const id = ++fadeRef.current;
    return {
      before: () => setVolumeQuiet(4),
      restore: () => fadeRef.current === id && setVolumeQuiet(target),
      start: async () => {
        // En este navegador va muy fina; en otros dispositivos, pocas órdenes espaciadas
        const steps = isLocalDevice() ? 24 : 6;
        for (let i = 1; i <= steps; i++) {
          await new Promise((r) => setTimeout(r, 2800 / steps));
          if (fadeRef.current !== id) return;
          await setVolumeQuiet(Math.round(4 + ((target - 4) * i) / steps));
        }
      },
    };
  };
  const fadePlay = (f, play) =>
    f
      ? async (d) => {
          await f.before();
          try {
            const r = await play(d);
            f.start();
            return r;
          } catch (e) {
            f.restore();
            throw e;
          }
        }
      : play;

  const actions = {
    playContext: (context_uri, offsetUri) =>
      run(fadePlay(fadeIn(), (d) => sp.play({ context_uri, offset: offsetUri ? { uri: offsetUri } : undefined }, d))),
    playUris: (uris, index = 0) => run(fadePlay(fadeIn(), (d) => sp.play({ uris, offset: { position: index } }, d))),
    toggle: () => {
      const pb = playbackRef.current;
      if (!pb?.item) return run(fadePlay(fadeIn(), (d) => sp.play({}, d)));
      const playing = !pb.is_playing;
      const at = Date.now();
      // La posición se calcula sobre la canción que haya debajo en ese momento (por si cambia la base)
      const tx = addOp(
        (st) =>
          st.playback
            ? {
                ...st,
                playback: {
                  ...st.playback,
                  is_playing: playing,
                  progress_ms: Math.min(
                    st.playback.item?.duration_ms || 0,
                    st.playback.progress_ms + (st.playback.is_playing ? at - st.playback.fetchedAt : 0)
                  ),
                  fetchedAt: at,
                },
              }
            : st,
        { playing }
      );
      return run(playing ? fadePlay(fadeIn(), (d) => sp.play({}, d)) : (d) => sp.pause(d), null, tx);
    },
    next: () => {
      const tx = playbackRef.current?.repeat_state !== 'track' ? advance() : null;
      return run(() => sp.next(), null, tx);
    },
    previous: () => {
      const pb = playbackRef.current;
      // Con más de 3 s reproducidos, "Anterior" vuelve al principio de la canción (como Spotify)
      if (pb?.item && positionOf(pb) > RESTART_MS) return actions.seek(0);
      const prev = pb?.item && historyRef.current.find((t) => t.uri !== pb.item.uri);
      let tx = null;
      if (prev) {
        const at = Date.now();
        tx = addOp(
          (st) => {
            const cur = st.playback?.item;
            const pv = cur && st.history.find((t) => t.uri !== cur.uri);
            if (!pv) return st;
            return {
              ...st,
              playback: { ...st.playback, item: pv, progress_ms: 0, is_playing: true, fetchedAt: at },
              queue: [cur, ...st.queue],
              history: st.history.filter((t) => t.uri !== pv.uri),
              last: pv,
            };
          },
          { uri: prev.uri },
          { track: true }
        );
      }
      return run(() => sp.previous(), null, tx);
    },
    seek: (ms) => {
      const pos = Math.round(ms);
      const at = Date.now();
      // El estado global también se mueve: si no, el aviso de fin de canción saltaría a destiempo
      const tx = playbackRef.current?.item
        ? addOp((st) => (st.playback ? { ...st, playback: { ...st.playback, progress_ms: pos, fetchedAt: at } } : st), {
            uri: playbackRef.current.item.uri,
            pos,
            at,
          })
        : null;
      return run(() => sp.seek(pos), null, tx);
    },
    volume: (v) => {
      const val = Math.max(0, Math.min(100, Math.round(v)));
      fadeRef.current++; // un cambio a mano cancela la subida suave en curso
      setPendingVolume({ v: val, at: Date.now() });
      return run(() => sp.volume(val));
    },
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
  // Volumen al abrir la app: una sola vez, en cuanto se conoce el dispositivo que suena
  const device = playback?.device;
  useEffect(() => {
    if (startVolumeRef.current || !device) return;
    startVolumeRef.current = true;
    const v = readSettings().startVolume;
    if (v >= 0 && device.supports_volume !== false && device.volume_percent !== v) actionsRef.current.volume(v);
  }, [device]);
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
    sdkClock,
    volumeNow,
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
