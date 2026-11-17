import { useEffect, useRef, useState } from 'react';
import { useArtColor, useCanvas } from '../art.js';
import { useLyrics } from '../lyrics.js';
import { sp } from '../spotify.js';
import { useApp } from '../store.jsx';
import { Artists, Cover, Icon, Loading, fmt, imgOf } from './ui.jsx';

// ---------- Preferencias de la vista "Sonando ahora" (se guardan en el navegador) ----------
const PREFS_KEY = 'sonora_np_prefs';
const defaultPrefs = { canvas: 'cover', blur: 60, panel: 'lyrics' };
function loadPrefs() {
  try {
    return { ...defaultPrefs, ...JSON.parse(localStorage.getItem(PREFS_KEY)) };
  } catch {
    return defaultPrefs;
  }
}
function usePrefs() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const update = (patch) =>
    setPrefs((p) => {
      const n = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(n));
      } catch {
        /* sin almacenamiento */
      }
      return n;
    });
  return [prefs, update];
}

/** Posición de reproducción interpolada en tiempo real */
function useProgress(playback) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!playback?.is_playing) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [playback?.is_playing]);
  if (!playback) return 0;
  const d = playback.item?.duration_ms || 0;
  return Math.min(d, playback.progress_ms + (playback.is_playing ? Math.max(0, now - playback.fetchedAt) : 0));
}

function Seek({ progress, duration, onSeek }) {
  const [drag, setDrag] = useState(null);
  const shown = drag ?? progress;
  const commit = () => {
    if (drag === null) return;
    onSeek(drag);
    setTimeout(() => setDrag(null), 600);
  };
  return (
    <div className="seek">
      <span>{fmt(shown)}</span>
      <input
        type="range"
        min="0"
        max={duration || 1}
        value={shown}
        style={{ '--p': `${duration ? (shown / duration) * 100 : 0}%` }}
        onChange={(e) => setDrag(Number(e.target.value))}
        onMouseUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        aria-label="Posición de la canción"
      />
      <span>-{fmt(Math.max(0, duration - shown))}</span>
    </div>
  );
}

function Transport({ large }) {
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
        <Icon name={playback?.is_playing ? 'pause' : 'play'} size={large ? 34 : 22} />
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

function Volume() {
  const { playback, actions } = useApp();
  const [vol, setVol] = useState(null);
  const [last, setLast] = useState(60);
  const volume = vol ?? playback?.device?.volume_percent ?? 60;
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
        onMouseUp={() => vol !== null && actions.volume(vol)}
        onTouchEnd={() => vol !== null && actions.volume(vol)}
        aria-label="Volumen"
      />
    </div>
  );
}

// ======================= BARRA INFERIOR =======================
export default function PlayerBar() {
  const { playback, actions, saved, checkSaved, toggleSaved } = useApp();
  const [panel, setPanel] = useState(null); // 'queue' | 'devices'
  const [open, setOpen] = useState(false);
  const item = playback?.item;
  const progress = useProgress(playback);

  useEffect(() => {
    if (item?.uri && item.type === 'track') checkSaved([item.uri]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.uri]);

  // Atajos: espacio = play/pausa (si no se está escribiendo)
  useEffect(() => {
    const k = (e) => {
      if (e.code !== 'Space' || /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable) return;
      e.preventDefault();
      actions.toggle();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  return (
    <>
      <footer className="player" style={{ '--p': `${item?.duration_ms ? (progress / item.duration_ms) * 100 : 0}%` }}>
        <div className="np">
          {item ? (
            <>
              <button className="np-art" onClick={() => setOpen(true)} title="Abrir Sonando ahora">
                <Cover src={imgOf(item.album || item, 'sm')} size={52} />
                <span className="np-expand">
                  <Icon name="up" size={18} />
                </span>
              </button>
              <div className="np-text">
                <button className="np-name" onClick={() => setOpen(true)}>
                  {item.name}
                </button>
                <div className="np-artist">{item.artists ? <Artists artists={item.artists} /> : item.show?.name}</div>
              </div>
              {item.type === 'track' && (
                <button
                  className={`icon-btn heart ${saved[item.uri] ? 'on' : ''}`}
                  onClick={() => toggleSaved(item.uri)}
                  title={saved[item.uri] ? 'Quitar de Me gusta' : 'Añadir a Me gusta'}
                >
                  <Icon name={saved[item.uri] ? 'heart' : 'heartOutline'} size={20} />
                </button>
              )}
            </>
          ) : (
            <div className="np-empty">Elige algo para escuchar y aparecerá aquí.</div>
          )}
        </div>

        <div className="controls">
          <Transport />
          <Seek progress={progress} duration={item?.duration_ms || 0} onSeek={actions.seek} />
        </div>

        <div className="extras">
          <button className="icon-btn" onClick={() => setOpen(true)} title="Letra">
            <Icon name="lyrics" size={18} />
          </button>
          <button className={`icon-btn ${panel === 'queue' ? 'active' : ''}`} onClick={() => setPanel(panel === 'queue' ? null : 'queue')} title="Cola">
            <Icon name="queue" size={18} />
          </button>
          <button
            className={`icon-btn ${panel === 'devices' ? 'active' : ''}`}
            onClick={() => setPanel(panel === 'devices' ? null : 'devices')}
            title={playback?.device ? `Sonando en ${playback.device.name}` : 'Dispositivos'}
          >
            <Icon name="devices" size={18} />
          </button>
          <div className="hide-sm">
            <Volume />
          </div>
        </div>
      </footer>

      {panel && (
        <aside className="popover-panel glass">
          <div className="panel-head">
            <h3>{panel === 'queue' ? 'A continuación' : 'Dispositivos'}</h3>
            <button className="icon-btn" onClick={() => setPanel(null)} aria-label="Cerrar">
              <Icon name="close" />
            </button>
          </div>
          {panel === 'queue' ? <QueueList /> : <DeviceList />}
        </aside>
      )}
      {open && <NowPlaying onClose={() => setOpen(false)} />}
    </>
  );
}

// ======================= SONANDO AHORA (pantalla completa) =======================
function NowPlaying({ onClose }) {
  const { playback, actions, saved, toggleSaved, openAddToPlaylist } = useApp();
  const [prefs, setPrefs] = usePrefs();
  const [settings, setSettings] = useState(false);
  const item = playback?.item;
  const art = imgOf(item?.album || item);
  const color = useArtColor(art);
  const canvas = useCanvas(prefs.canvas !== 'off' && item?.type === 'track' ? item.id : null);
  const progress = useProgress(playback);
  const ref = useRef(null);

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && !document.fullscreenElement && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else ref.current?.requestFullscreen?.();
  };

  const canvasInCover = canvas && prefs.canvas === 'cover';
  const canvasInBg = canvas && prefs.canvas === 'background';

  return (
    <div className="nowplaying" ref={ref} style={{ '--art': color || '120 110 160', '--blur': `${prefs.blur}px` }} role="dialog" aria-label="Sonando ahora">
      <div className="np-bg" aria-hidden="true">
        {canvasInBg ? (
          <video key={canvas} src={canvas} autoPlay loop muted playsInline />
        ) : (
          art && <img src={art} alt="" />
        )}
      </div>

      <header className="np-top">
        <button className="icon-btn round" onClick={onClose} title="Cerrar (Esc)">
          <Icon name="chevronDown" size={24} />
        </button>
        <div className="np-source">
          {playback?.device && <span>Sonando en {playback.device.name}</span>}
        </div>
        <div className="np-top-actions">
          <button className="icon-btn round" onClick={() => setSettings((s) => !s)} title="Ajustes de la vista" aria-expanded={settings}>
            <Icon name="settings" size={20} />
          </button>
          <button className="icon-btn round hide-sm" onClick={toggleFullscreen} title="Pantalla completa">
            <Icon name="fullscreen" size={20} />
          </button>
        </div>
        {settings && (
          <div className="np-settings glass">
            <p className="set-title">Canvas</p>
            <div className="segmented">
              {[
                ['cover', 'En la portada'],
                ['background', 'De fondo'],
                ['off', 'Desactivado'],
              ].map(([v, l]) => (
                <button key={v} className={prefs.canvas === v ? 'on' : ''} onClick={() => setPrefs({ canvas: v })}>
                  {l}
                </button>
              ))}
            </div>
            <p className="set-hint">
              {item?.type !== 'track' ? 'Solo las canciones tienen Canvas.' : canvas ? 'Esta canción tiene Canvas.' : 'Esta canción no tiene Canvas; se muestra la portada.'}
            </p>
            <label className="set-title" htmlFor="np-blur">
              Difuminado del fondo
            </label>
            <input
              id="np-blur"
              type="range"
              min="0"
              max="120"
              value={prefs.blur}
              style={{ '--p': `${(prefs.blur / 120) * 100}%` }}
              onChange={(e) => setPrefs({ blur: Number(e.target.value) })}
            />
          </div>
        )}
      </header>

      <div className={`np-body ${prefs.panel === 'none' ? 'solo' : ''}`}>
        <section className="np-main">
          <div className={`np-artwork ${playback?.is_playing ? 'playing' : ''} ${canvasInCover ? 'is-canvas' : ''}`}>
            {canvasInCover ? (
              <video key={canvas} src={canvas} autoPlay loop muted playsInline poster={art} />
            ) : art ? (
              <img src={art} alt={item?.album?.name || item?.name || ''} />
            ) : (
              <div className="cover placeholder">
                <Icon name="music" size={64} />
              </div>
            )}
          </div>

          {item ? (
            <>
              <div className="np-meta">
                <div className="np-titles">
                  <h2>{item.name}</h2>
                  <p>{item.artists ? <Artists artists={item.artists} /> : item.show?.name}</p>
                </div>
                <div className="np-meta-actions">
                  {item.type === 'track' && (
                    <button className={`icon-btn heart ${saved[item.uri] ? 'on' : ''}`} onClick={() => toggleSaved(item.uri)} title="Me gusta">
                      <Icon name={saved[item.uri] ? 'heart' : 'heartOutline'} size={22} />
                    </button>
                  )}
                  <button className="icon-btn" onClick={() => openAddToPlaylist([item.uri])} title="Añadir a una playlist">
                    <Icon name="plus" size={22} />
                  </button>
                </div>
              </div>
              <Seek progress={progress} duration={item.duration_ms} onSeek={actions.seek} />
              <Transport large />
              <Volume />
            </>
          ) : (
            <p className="np-empty">Pon algo a sonar desde Spotify o desde Sonora.</p>
          )}
        </section>

        {prefs.panel !== 'none' && (
          <section className="np-side">
            {prefs.panel === 'lyrics' && <Lyrics item={item} progress={progress} onSeek={actions.seek} />}
            {prefs.panel === 'queue' && <QueueList />}
            {prefs.panel === 'devices' && <DeviceList />}
          </section>
        )}
      </div>

      <nav className="np-tabs glass" aria-label="Panel lateral">
        {[
          ['lyrics', 'Letra', 'lyrics'],
          ['queue', 'Cola', 'queue'],
          ['devices', 'Dispositivos', 'devices'],
          ['none', 'Solo portada', 'image'],
        ].map(([v, l, icon]) => (
          <button key={v} className={prefs.panel === v ? 'on' : ''} onClick={() => setPrefs({ panel: v })}>
            <Icon name={icon} size={18} />
            <span>{l}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Lyrics({ item, progress, onSeek }) {
  const lyr = useLyrics(item, true);
  const box = useRef(null);
  const synced = lyr.status === 'synced';
  // Adelanta 300 ms para compensar el retraso del sondeo
  const active = synced ? lyr.lines.findLastIndex((l) => l.t <= progress + 300) : -1;
  // Fracción recorrida de la línea activa (relleno progresivo tipo karaoke)
  const cur = synced ? lyr.lines[active] : null;
  const nextT = synced ? lyr.lines[active + 1]?.t ?? (item?.duration_ms || 0) : 0;
  const fill = cur ? Math.min(1, Math.max(0, (progress + 300 - cur.t) / Math.max(400, Math.min(nextT - cur.t, 8000)))) : 0;

  useEffect(() => {
    if (active < 0) return;
    const el = box.current?.querySelector(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [active]);

  if (!item) return null;
  if (lyr.status === 'loading' || lyr.status === 'idle') return <Loading />;
  if (lyr.status === 'instrumental') return <p className="lyrics-msg">Canción instrumental.</p>;
  if (lyr.status !== 'synced' && lyr.status !== 'plain')
    return <p className="lyrics-msg">No hay letra disponible para esta canción en LRCLIB.</p>;

  return (
    <div className={`lyrics ${synced ? 'synced' : ''}`} ref={box}>
      {lyr.lines.map((l, i) =>
        synced ? (
          <button
            key={i}
            data-i={i}
            className={`line ${i === active ? 'now' : i < active ? 'past' : ''}`}
            style={i === active ? { '--fill': `${Math.round(fill * 100)}%` } : undefined}
            onClick={() => onSeek(l.t)}
          >
            {l.text || '♪'}
          </button>
        ) : (
          <p key={i} className="line">
            {l.text || ' '}
          </p>
        )
      )}
      <p className="lyrics-src">Letra de LRCLIB</p>
    </div>
  );
}

function QueueList() {
  const { playback, actions } = useApp();
  const [q, setQ] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    sp.queue().then(setQ).catch(setErr);
  }, [playback?.item?.uri]);
  if (err) return <p className="muted">{err.message}</p>;
  if (!q) return <Loading />;
  return (
    <div className="queue">
      {q.queue?.length ? (
        q.queue.map((t, i) => (
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

function DeviceList() {
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
