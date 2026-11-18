import { useEffect, useState } from 'react';
import { useApp } from '../store.jsx';
import { Cover, Icon, fmt, imgOf } from './ui.jsx';

export function Seek({ progress, duration, onSeek }) {
  const [drag, setDrag] = useState(null);
  const shown = drag ?? progress;
  const commit = () => {
    if (drag === null) return;
    onSeek(drag);
    setDrag(null);
  };
  return (
    <div className="seek">
      <span>{fmt(shown)}</span>
      <input
        type="range"
        min="0"
        max={duration || 1}
        value={Math.min(shown, duration || 1)}
        style={{ '--p': `${duration ? (shown / duration) * 100 : 0}%` }}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        aria-label="Posición"
      />
      <span>-{fmt(Math.max(0, duration - shown))}</span>
    </div>
  );
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

export function Volume() {
  const { playback, actions } = useApp();
  const [vol, setVol] = useState(null);
  const [last, setLast] = useState(60);
  const volume = vol ?? playback?.device?.volume_percent ?? 60;
  useEffect(() => {
    // Cuando Spotify confirma el volumen, deja de usar el valor local
    if (vol !== null && playback?.device?.volume_percent === vol) setVol(null);
  }, [playback?.device?.volume_percent, vol]);
  const toggleMute = () => {
    const v = volume > 0 ? 0 : last;
    if (volume > 0) setLast(volume);
    setVol(v);
    actions.volume(v);
  };
  return (
    <div className="volume">
      <button className="icon-btn" onClick={toggleMute} title={volume > 0 ? 'Silenciar' : 'Activar sonido'}>
        <Icon name={volume > 0 ? 'volume' : 'mute'} size={18} />
      </button>
      <input
        type="range"
        min="0"
        max="100"
        value={volume}
        style={{ '--p': `${volume}%` }}
        onChange={(e) => setVol(Number(e.target.value))}
        onPointerUp={() => vol !== null && actions.volume(vol)}
        onKeyUp={() => vol !== null && actions.volume(vol)}
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
