import { useEffect, useState } from 'react';
import { sp } from '../spotify.js';
import { useApp } from '../store.jsx';
import { Artists, Cover, Icon, Loading, fmt, imgOf } from './ui.jsx';

export default function PlayerBar() {
  const { playback, actions, saved, checkSaved, toggleSaved } = useApp();
  const [panel, setPanel] = useState(null); // 'queue' | 'devices'
  const [now, setNow] = useState(Date.now());
  const [drag, setDrag] = useState(null);
  const [vol, setVol] = useState(null);
  const [lastVol, setLastVol] = useState(60);

  const item = playback?.item;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (item?.uri && item.type === 'track') checkSaved([item.uri]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.uri]);

  const duration = item?.duration_ms || 0;
  const progress = playback
    ? Math.min(duration, playback.progress_ms + (playback.is_playing ? now - playback.fetchedAt : 0))
    : 0;
  const shown = drag ?? progress;
  const volume = vol ?? playback?.device?.volume_percent ?? 60;
  const repeat = playback?.repeat_state || 'off';

  return (
    <>
      <footer className="player">
        <div className="np">
          {item ? (
            <>
              <Cover src={imgOf(item.album || item, 'sm')} size={56} />
              <div className="np-text">
                <div className="np-name">{item.name}</div>
                <div className="np-artist">
                  {item.artists ? <Artists artists={item.artists} /> : item.show?.name}
                </div>
              </div>
              {item.type === 'track' && (
                <button className={`icon-btn heart ${saved[item.uri] ? 'on' : ''}`} onClick={() => toggleSaved(item.uri)} title="Me gusta">
                  <Icon name="heart" size={18} />
                </button>
              )}
            </>
          ) : (
            <div className="muted small">Nada sonando. Elige algo para reproducir.</div>
          )}
        </div>

        <div className="controls">
          <div className="buttons">
            <button className={`icon-btn ${playback?.shuffle_state ? 'active' : ''}`} onClick={actions.shuffle} title="Aleatorio">
              <Icon name="shuffle" size={18} />
            </button>
            <button className="icon-btn" onClick={actions.previous} title="Anterior">
              <Icon name="prev" />
            </button>
            <button className="play-btn" onClick={actions.toggle} title={playback?.is_playing ? 'Pausar' : 'Reproducir'}>
              <Icon name={playback?.is_playing ? 'pause' : 'play'} size={22} />
            </button>
            <button className="icon-btn" onClick={actions.next} title="Siguiente">
              <Icon name="next" />
            </button>
            <button
              className={`icon-btn repeat ${repeat !== 'off' ? 'active' : ''}`}
              onClick={actions.repeat}
              title={`Repetir: ${{ off: 'no', context: 'todo', track: 'canción' }[repeat]}`}
            >
              <Icon name="repeat" size={18} />
              {repeat === 'track' && <span className="badge">1</span>}
            </button>
          </div>
          <div className="progress">
            <span className="small muted">{fmt(shown)}</span>
            <input
              type="range"
              min="0"
              max={duration || 1}
              value={shown}
              style={{ '--p': `${duration ? (shown / duration) * 100 : 0}%` }}
              onChange={(e) => setDrag(Number(e.target.value))}
              onMouseUp={() => drag !== null && (actions.seek(drag), setTimeout(() => setDrag(null), 600))}
              onTouchEnd={() => drag !== null && (actions.seek(drag), setTimeout(() => setDrag(null), 600))}
              onKeyUp={() => drag !== null && (actions.seek(drag), setDrag(null))}
              aria-label="Progreso"
            />
            <span className="small muted">{fmt(duration)}</span>
          </div>
        </div>

        <div className="extras">
          <button className={`icon-btn ${panel === 'queue' ? 'active' : ''}`} onClick={() => setPanel(panel === 'queue' ? null : 'queue')} title="Cola">
            <Icon name="queue" size={18} />
          </button>
          <button
            className={`icon-btn ${panel === 'devices' ? 'active' : ''}`}
            onClick={() => setPanel(panel === 'devices' ? null : 'devices')}
            title={playback?.device ? `Reproduciendo en ${playback.device.name}` : 'Dispositivos'}
          >
            <Icon name="devices" size={18} />
          </button>
          <button
            className="icon-btn hide-sm"
            onClick={() => {
              if (volume > 0) {
                setLastVol(volume);
                setVol(0);
                actions.volume(0);
              } else {
                setVol(lastVol);
                actions.volume(lastVol);
              }
            }}
            title="Silenciar"
          >
            <Icon name={volume > 0 ? 'volume' : 'mute'} size={18} />
          </button>
          <input
            className="volume hide-sm"
            type="range"
            min="0"
            max="100"
            value={volume}
            style={{ '--p': `${volume}%` }}
            onChange={(e) => setVol(Number(e.target.value))}
            onMouseUp={() => vol !== null && actions.volume(vol)}
            onTouchEnd={() => vol !== null && actions.volume(vol)}
            aria-label="Volumen"
          />
        </div>
      </footer>
      {panel === 'queue' && <QueuePanel onClose={() => setPanel(null)} />}
      {panel === 'devices' && <DevicesPanel onClose={() => setPanel(null)} />}
    </>
  );
}

function QueuePanel({ onClose }) {
  const { playback, actions } = useApp();
  const [q, setQ] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    sp.queue().then(setQ).catch(setErr);
  }, [playback?.item?.uri]);
  return (
    <aside className="side-panel">
      <div className="panel-head">
        <h3>Cola</h3>
        <button className="icon-btn" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {err && <p className="muted">{err.message}</p>}
      {!q && !err && <Loading />}
      {q && (
        <>
          <h4>Sonando ahora</h4>
          {q.currently_playing ? <QItem t={q.currently_playing} current /> : <p className="muted small">Nada</p>}
          <h4>A continuación</h4>
          {q.queue?.length ? (
            q.queue.map((t, i) => <QItem key={t.uri + i} t={t} onClick={() => actions.playUris([t.uri])} />)
          ) : (
            <p className="muted small">La cola está vacía.</p>
          )}
        </>
      )}
    </aside>
  );
}

function QItem({ t, current, onClick }) {
  return (
    <div className={`q-item ${current ? 'current' : ''}`} onDoubleClick={onClick}>
      <Cover src={imgOf(t.album || t, 'sm')} size={40} />
      <div className="tl-text">
        <span className="tl-name">{t.name}</span>
        <span className="tl-artist">{t.artists?.map((a) => a.name).join(', ') || t.show?.name}</span>
      </div>
    </div>
  );
}

function DevicesPanel({ onClose }) {
  const { devices, refreshDevices, actions, sdkDeviceId, sdkError } = useApp();
  useEffect(() => {
    refreshDevices();
    const t = setInterval(refreshDevices, 5000);
    return () => clearInterval(t);
  }, [refreshDevices]);
  return (
    <aside className="side-panel">
      <div className="panel-head">
        <h3>Dispositivos</h3>
        <button className="icon-btn" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {sdkError && <p className="warn small">{sdkError}</p>}
      {!sdkDeviceId && !sdkError && <p className="muted small">Iniciando el reproductor web…</p>}
      {devices.length === 0 && <p className="muted small">No hay dispositivos. Abre Spotify en tu móvil u ordenador.</p>}
      {devices.map((d) => (
        <button key={d.id} className={`device ${d.is_active ? 'active' : ''}`} onClick={() => actions.transfer(d.id)} disabled={d.is_restricted}>
          <Icon name="devices" />
          <span>
            <strong>{d.name}</strong>
            <span className="small muted">
              {d.type}
              {d.id === sdkDeviceId ? ' · este navegador' : ''}
              {d.is_active ? ' · activo' : ''}
            </span>
          </span>
        </button>
      ))}
    </aside>
  );
}
