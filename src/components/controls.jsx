import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../store.jsx';
import { Cover, Icon, fmt, imgOf } from './ui.jsx';

/**
 * Repinta `paint` en cada fotograma mientras suena (y una vez en cada render).
 * Las barras de progreso se actualizan así, directamente en la página: antes la vista entera se
 * volvía a dibujar varias veces por segundo solo para mover la barra.
 */
function useLivePaint(paint, playing) {
  useEffect(() => {
    paint();
  });
  useEffect(() => {
    if (!playing) return;
    let raf;
    const loop = () => {
      paint();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paint, playing]);
}

/** Barra de progreso con tiempos. `clock.now()` da la posición; avanza sola mientras suena */
export function Seek({ clock, playing, duration, onSeek }) {
  const input = useRef(null);
  const cur = useRef(null);
  const rest = useRef(null);
  const drag = useRef(null); // posición mientras se arrastra
  const last = useRef({ p: '', a: '', b: '' });
  const paint = useCallback(() => {
    const el = input.current;
    if (!el) return;
    const shown = Math.max(0, Math.min(duration || 0, drag.current ?? clock.now()));
    const L = last.current;
    if (drag.current === null && String(Math.round(shown)) !== el.value) el.value = String(Math.round(shown));
    const p = `${duration ? ((shown / duration) * 100).toFixed(2) : 0}%`;
    if (p !== L.p) el.style.setProperty('--p', (L.p = p));
    const a = fmt(shown);
    const b = `-${fmt(Math.max(0, duration - shown))}`;
    if (a !== L.a) cur.current.textContent = L.a = a;
    if (b !== L.b) rest.current.textContent = L.b = b;
  }, [clock, duration]);
  useLivePaint(paint, playing);
  const commit = () => {
    if (drag.current === null) return;
    onSeek(drag.current);
    drag.current = null;
  };
  return (
    <div className="seek">
      <span ref={cur} />
      <input
        ref={input}
        type="range"
        min="0"
        max={duration || 1}
        defaultValue={0}
        onChange={(e) => {
          drag.current = Number(e.target.value);
          paint();
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        aria-label="Posición"
      />
      <span ref={rest} />
    </div>
  );
}

/** Línea fina de progreso (karaoke), también sin volver a dibujar a quien la usa */
export function ProgressLine({ clock, playing, duration, className }) {
  const el = useRef(null);
  const last = useRef('');
  const paint = useCallback(() => {
    const p = `${duration ? Math.min(100, (clock.now() / duration) * 100).toFixed(2) : 0}%`;
    if (el.current && p !== last.current) el.current.style.setProperty('--p', (last.current = p));
  }, [clock, duration]);
  useLivePaint(paint, playing);
  return <div ref={el} className={className} />;
}

export function Transport({ large }) {
  const { playback, actions } = useApp();
  const repeat = playback?.repeat_state || 'off';
  const s = large ? 30 : 22;
  return (
    <div className={`transport ${large ? 'large' : ''}`}>
      <button className={`icon-btn ${playback?.shuffle_state ? 'active' : ''}`} onClick={actions.shuffle} title="Aleatorio">
        <Icon name="shuffle" size={large ? 22 : 18} />
      </button>
      <button className="icon-btn" onClick={actions.previous} title="Anterior">
        <Icon name="prev" size={s} />
      </button>
      <button className="play-btn" onClick={actions.toggle} title={playback?.is_playing ? 'Pausar' : 'Reproducir'}>
        <Icon name={playback?.is_playing ? 'pause' : 'play'} size={large ? 30 : 20} />
      </button>
      <button className="icon-btn" onClick={actions.next} title="Siguiente">
        <Icon name="next" size={s} />
      </button>
      <button
        className={`icon-btn ${repeat !== 'off' ? 'active' : ''}`}
        onClick={actions.repeat}
        title={`Repetir: ${{ off: 'desactivado', context: 'todo', track: 'esta canción' }[repeat]}`}
      >
        <Icon name="repeat" size={large ? 22 : 18} />
        {repeat === 'track' && <span className="badge">1</span>}
      </button>
    </div>
  );
}

// Último volumen audible, para volver a él al quitar el silencio (botón o atajo de teclado)
let lastAudible = 60;
export function toggleMute(volume, actions) {
  if (volume > 0) {
    lastAudible = volume;
    actions.volume(0);
  } else actions.volume(lastAudible || 60);
}

export function Volume() {
  const { playback, actions, volumeNow } = useApp();
  const [vol, setVol] = useState(null); // mientras se arrastra el control
  const volume = vol ?? volumeNow ?? 60;
  useEffect(() => {
    // Cuando Spotify confirma el volumen, deja de usar el valor local
    if (vol !== null && playback?.device?.volume_percent === vol) setVol(null);
  }, [playback?.device?.volume_percent, vol]);
  const release = () => {
    if (vol === null) return;
    actions.volume(vol);
    setVol(null);
  };
  return (
    <div className="volume">
      <button className="icon-btn" onClick={() => toggleMute(volume, actions)} title={volume > 0 ? 'Silenciar' : 'Activar sonido'}>
        <Icon name={volume > 0 ? 'volume' : 'mute'} size={18} />
      </button>
      <input
        type="range"
        min="0"
        max="100"
        value={volume}
        style={{ '--p': `${volume}%` }}
        onChange={(e) => setVol(Number(e.target.value))}
        onPointerUp={release}
        onKeyUp={release}
        aria-label="Volumen"
      />
    </div>
  );
}

/**
 * Cola: arrastra el asa para reordenar, desliza a la izquierda (o pulsa ×) para quitar.
 * Los cambios se preparan aquí y se aplican con «Aplicar», porque Spotify no deja editar su cola
 * y hay que volver a crearla (ver rebuildQueue en store.jsx).
 */
export function QueueList() {
  const { queue, refreshQueue, actions, playback } = useApp();
  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);
  const [draft, setDraft] = useState(null); // [{ k, t }] mientras se edita
  const [drag, setDrag] = useState(null); // { k, dy }
  const [swipe, setSwipe] = useState(null); // { k, dx }
  const dragRef = useRef(null);
  const swipeRef = useRef(null);
  const fromQueue = () => queue.map((t, i) => ({ k: `${t.uri}#${i}`, t }));
  const items = draft ?? fromQueue();
  const edit = (fn) => setDraft((d) => fn(d ?? fromQueue()));
  const remove = (k) => edit((d) => d.filter((x) => x.k !== k));
  const move = (from, to) =>
    edit((d) => {
      const n = [...d];
      const [x] = n.splice(from, 1);
      n.splice(Math.max(0, Math.min(n.length, to)), 0, x);
      return n;
    });

  // Arrastrar con el asa (ratón, dedo o lápiz)
  const startDrag = (e, k) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const row = e.currentTarget.closest('.q-row');
    dragRef.current = { k, y0: e.clientY, h: row?.offsetHeight || 56 };
    setDrag({ k, dy: 0 });
  };
  const moveDrag = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const list = draftRef.current ?? fromQueue();
    const i = list.findIndex((x) => x.k === d.k);
    const steps = Math.trunc((e.clientY - d.y0) / d.h);
    const to = Math.max(0, Math.min(list.length - 1, i + steps));
    if (steps && to !== i) {
      move(i, to);
      d.y0 += (to - i) * d.h; // la fila sigue bajo el puntero
    }
    setDrag({ k: d.k, dy: e.clientY - d.y0 });
  };
  const endDrag = () => {
    dragRef.current = null;
    setDrag(null);
  };
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Deslizar a la izquierda para quitar (pantallas táctiles)
  const startSwipe = (e, k) => {
    if (e.pointerType === 'mouse') return;
    swipeRef.current = { k, x0: e.clientX, y0: e.clientY, on: false };
  };
  const justSwiped = useRef(false); // el toque que termina un deslizamiento no reproduce la canción
  const moveSwipe = (e) => {
    const s = swipeRef.current;
    if (!s) return;
    const dx = e.clientX - s.x0;
    if (!s.on && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(e.clientY - s.y0)) {
      s.on = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (s.on) {
      s.dx = Math.min(0, dx);
      setSwipe({ k: s.k, dx: s.dx });
    }
  };
  const endSwipe = () => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (s?.on) {
      justSwiped.current = true;
      setTimeout(() => (justSwiped.current = false), 0);
      if (s.dx < -90) remove(s.k);
    }
    setSwipe(null);
  };

  const apply = () => {
    const tracks = draft.map((x) => x.t);
    setDraft(null);
    actions.rebuildQueue(tracks);
  };

  return (
    <div className="queue">
      {draft && (
        <div className="queue-apply" role="status">
          <p>
            Spotify no deja editar su cola: al aplicar, Sonora la vuelve a crear con este orden. La canción actual sigue
            donde va (puede haber un corte muy breve)
            {playback?.context ? ' y, al acabar estas canciones, la reproducción se para: se pierde la playlist o el álbum de origen' : ''}.
          </p>
          <div>
            <button type="button" className="btn primary" onClick={apply}>
              Aplicar
            </button>
            <button type="button" className="btn" onClick={() => setDraft(null)}>
              Descartar
            </button>
          </div>
        </div>
      )}
      {items.length ? (
        <ul className="q-list">
          {items.map(({ k, t }, i) => {
            const dragging = drag?.k === k;
            const swiping = swipe?.k === k;
            return (
              <li
                key={k}
                className={`q-row ${dragging ? 'is-dragging' : ''} ${swiping && swipe.dx < -90 ? 'will-remove' : ''}`}
                style={dragging ? { transform: `translateY(${drag.dy}px)` } : swiping ? { transform: `translateX(${swipe.dx}px)` } : undefined}
                onPointerDown={(e) => startSwipe(e, k)}
                onPointerMove={moveSwipe}
                onPointerUp={endSwipe}
                onPointerCancel={endSwipe}
              >
                <button
                  className="q-item"
                  onClick={() => !justSwiped.current && actions.playUris([t.uri])}
                  title="Reproducir ahora"
                >
                  <Cover src={imgOf(t.album || t, 'sm')} size={44} />
                  <span className="tl-text">
                    <span className="tl-name">{t.name}</span>
                    <span className="tl-artist">{t.artists?.map((a) => a.name).join(', ') || t.show?.name}</span>
                  </span>
                </button>
                <button type="button" className="icon-btn q-remove" onClick={() => remove(k)} aria-label={`Quitar ${t.name} de la cola`} title="Quitar de la cola">
                  <Icon name="close" size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn q-handle"
                  aria-label={`Mover ${t.name} (flechas arriba y abajo)`}
                  title="Arrastra para cambiar el orden"
                  onPointerDown={(e) => startDrag(e, k)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                    e.preventDefault();
                    move(i, i + (e.key === 'ArrowUp' ? -1 : 1));
                  }}
                >
                  <Icon name="reorder" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">{draft ? 'Has quitado todas las canciones de la cola.' : 'La cola está vacía. Añade canciones desde el menú de cualquier canción.'}</p>
      )}
    </div>
  );
}

export function DeviceList() {
  const { devices, refreshDevices, actions, sdkDeviceId, sdkError } = useApp();
  useEffect(() => {
    refreshDevices();
    const t = setInterval(refreshDevices, 5000);
    return () => clearInterval(t);
  }, [refreshDevices]);
  return (
    <div className="devices">
      {sdkError && <p className="warn small">{sdkError}</p>}
      {!sdkDeviceId && !sdkError && <p className="muted small">Preparando el reproductor de este navegador…</p>}
      {devices.length === 0 && <p className="muted small">No hay dispositivos. Abre Spotify en tu móvil u ordenador.</p>}
      {devices.map((d) => (
        <button key={d.id} className={`device ${d.is_active ? 'active' : ''}`} onClick={() => actions.transfer(d.id)} disabled={d.is_restricted}>
          <Icon name="devices" />
          <span>
            <strong>{d.id === sdkDeviceId ? 'Este navegador' : d.name}</strong>
            <span className="small muted">{d.is_active ? 'Sonando ahora' : d.type}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
