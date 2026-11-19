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

export function QueueList() {
  const { queue, refreshQueue, actions } = useApp();
  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);
  return (
    <div className="queue">
      {queue.length ? (
        queue.map((t, i) => (
          <button key={t.uri + i} className="q-item" onClick={() => actions.playUris([t.uri])} title="Reproducir ahora">
            <Cover src={imgOf(t.album || t, 'sm')} size={44} />
            <span className="tl-text">
              <span className="tl-name">{t.name}</span>
              <span className="tl-artist">{t.artists?.map((a) => a.name).join(', ') || t.show?.name}</span>
            </span>
          </button>
        ))
      ) : (
        <p className="muted">La cola está vacía. Añade canciones desde el menú de cualquier canción.</p>
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
