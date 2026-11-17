import { useEffect, useRef, useState } from 'react';
import { useArtColor, useCanvas } from '../art.js';
import { useFrame, useTick } from '../clock.js';
import { useLyrics } from '../lyrics.js';
import { useApp } from '../store.jsx';
import { DeviceList, QueueList, Seek, Transport, Volume } from './controls.jsx';
import { Artists, Icon, Loading, imgOf } from './ui.jsx';

// ---------- Preferencias (modos de diseño de spotify-now-playing) ----------
const PREFS_KEY = 'sonora_np_prefs_v2';
export const DEFAULTS = {
  theme: 'liquid', // liquid | glass | minimal | aod | xp
  font: 'inter', // inter | poppins | dot | mono | montserrat
  shape: 'rounded', // rounded | square | circle | vinyl
  filter: 'none', // none | grayscale | sepia | vintage | vivid
  anim: 'none', // none | spin | pulse | tilt
  accent: 'auto', // auto | #hex
  canvas: 'cover', // none | background | cover | both | portrait
  portraitPos: 'left', // left | center
  blur: 60, // desenfoque del fondo con portada
  canvasBlur: 12, // desenfoque del fondo con Canvas
  lyrics: 'side', // side | cover | line | none
  panel: 'lyrics', // lyrics | queue | devices | settings | none
};
const FONTS = {
  inter: { label: 'Inter', css: "'Inter', sans-serif" },
  poppins: { label: 'Poppins', css: "'Poppins', sans-serif", g: 'Poppins:wght@400;600;700' },
  dot: { label: 'Matriz de puntos', css: "'DotGothic16', sans-serif", g: 'DotGothic16' },
  mono: { label: 'Space Mono', css: "'Space Mono', monospace", g: 'Space+Mono:wght@400;700' },
  montserrat: { label: 'Montserrat', css: "'Montserrat', sans-serif", g: 'Montserrat:wght@400;600;800' },
};
const ACCENTS = ['auto', '#30D158', '#FF453A', '#0A84FF', '#BF5AF2', '#FF9F0A'];

function loadFont(key) {
  const f = FONTS[key];
  if (!f?.g || document.getElementById(`font-${key}`)) return;
  const l = document.createElement('link');
  l.id = `font-${key}`;
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${f.g}&display=swap`;
  document.head.appendChild(l);
}

function usePrefs() {
  const [prefs, setPrefs] = useState(() => {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY)) };
    } catch {
      return DEFAULTS;
    }
  });
  useEffect(() => loadFont(prefs.font), [prefs.font]);
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

function Clock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 10_000);
    return () => clearInterval(i);
  }, []);
  return <span className="aod-clock">{t.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>;
}

// ======================= VISTA =======================
export default function NowPlaying({ onClose, clock }) {
  const { playback, actions, saved, toggleSaved, openAddToPlaylist } = useApp();
  const [prefs, set] = usePrefs();
  const item = playback?.item;
  const isTrack = item?.type === 'track';
  const art = imgOf(item?.album || item);
  const color = useArtColor(art);
  const canvas = useCanvas(prefs.canvas !== 'none' && isTrack ? item.id : null);
  const progress = useTick(clock.now, playback?.is_playing, 150);
  const root = useRef(null);
  const artRef = useRef(null);

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && !document.fullscreenElement && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const seek = (ms) => {
    clock.jump(ms);
    actions.seek(ms);
  };

  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen?.());

  // Animación "inclinación": sigue al ratón
  const onMove = (e) => {
    if (prefs.anim !== 'tilt' || !artRef.current) return;
    const r = artRef.current.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) / r.width;
    const y = (e.clientY - (r.top + r.height / 2)) / r.height;
    artRef.current.style.setProperty('--rx', `${(-y * 14).toFixed(2)}deg`);
    artRef.current.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
  };

  const canvasCover = canvas && ['cover', 'both', 'portrait'].includes(prefs.canvas);
  const canvasBg = canvas && ['background', 'both'].includes(prefs.canvas);
  const portrait = canvas && prefs.canvas === 'portrait';
  const accent = prefs.accent === 'auto' ? (color ? `rgb(${color})` : '#fff') : prefs.accent;
  const showSide = prefs.panel !== 'none' && !(portrait && prefs.portraitPos === 'center');
  const sideIsLyrics = prefs.panel === 'lyrics';

  const cls = [
    'nowplaying',
    `theme-${prefs.theme}`,
    `shape-${prefs.shape}`,
    `filter-${prefs.filter}`,
    `anim-${prefs.anim}`,
    playback?.is_playing ? 'is-playing' : 'is-paused',
    portrait ? `portrait pos-${prefs.portraitPos}` : '',
    showSide ? '' : 'no-side',
  ].join(' ');

  return (
    <div
      ref={root}
      className={cls}
      onMouseMove={onMove}
      style={{
        '--art': color || '120 110 160',
        '--accent': accent,
        '--blur': `${canvasBg ? prefs.canvasBlur : prefs.blur}px`,
        '--np-font': FONTS[prefs.font]?.css,
      }}
      role="dialog"
      aria-label="Sonando ahora"
    >
      <div className="np-bg" aria-hidden="true">
        {canvasBg ? <video key={canvas} src={canvas} autoPlay loop muted playsInline /> : art && <img src={art} alt="" />}
      </div>

      <header className="np-top">
        <button className="icon-btn round" onClick={onClose} title="Cerrar (Esc)">
          <Icon name="chevronDown" size={24} />
        </button>
        <div className="np-source">
          {prefs.theme === 'aod' ? <Clock /> : playback?.device && <span>Sonando en {playback.device.name}</span>}
        </div>
        <button className="icon-btn round" onClick={fullscreen} title="Pantalla completa">
          <Icon name="fullscreen" size={20} />
        </button>
      </header>

      <div className="np-body">
        <section className="np-main">
          <div className="np-stage">
            <div ref={artRef} className={`np-artwork ${canvasCover ? 'has-canvas' : ''}`}>
              <div className="np-artwork-inner">
                {canvasCover ? (
                  <video key={canvas} src={canvas} autoPlay loop muted playsInline poster={art} />
                ) : art ? (
                  <img src={art} alt={item?.album?.name || item?.name || ''} />
                ) : (
                  <div className="cover placeholder">
                    <Icon name="music" size={64} />
                  </div>
                )}
              </div>
              {isTrack && (prefs.lyrics === 'cover' || prefs.lyrics === 'line') && (
                <Lyrics item={item} now={clock.now} onSeek={seek} variant={prefs.lyrics} />
              )}
            </div>
          </div>

          {item ? (
            <div className="np-controls">
              <div className="np-meta">
                <div className="np-titles">
                  <h2 title={item.name}>{item.name}</h2>
                  <p>{item.artists ? <Artists artists={item.artists} /> : item.show?.name}</p>
                </div>
                <div className="np-meta-actions">
                  {isTrack && (
                    <button className={`icon-btn heart ${saved[item.uri] ? 'on' : ''}`} onClick={() => toggleSaved(item.uri)} title="Me gusta">
                      <Icon name={saved[item.uri] ? 'heart' : 'heartOutline'} size={20} />
                    </button>
                  )}
                  <button className="icon-btn" onClick={() => openAddToPlaylist([item.uri])} title="Añadir a una playlist">
                    <Icon name="plus" size={20} />
                  </button>
                </div>
              </div>
              <Seek progress={progress} duration={item.duration_ms} onSeek={seek} />
              <Transport large />
              <Volume />
            </div>
          ) : (
            <p className="np-empty">Pon algo a sonar desde Spotify o desde Sonora.</p>
          )}
        </section>

        {showSide && (
          <section className={`np-side ${sideIsLyrics ? 'is-lyrics' : ''}`}>
            {prefs.panel === 'lyrics' &&
              (prefs.lyrics === 'side' ? (
                <Lyrics item={item} now={clock.now} onSeek={seek} variant="side" />
              ) : (
                <p className="lyrics-msg">La letra se muestra sobre la portada. Cámbialo en Ajustes.</p>
              ))}
            {prefs.panel === 'queue' && <QueueList />}
            {prefs.panel === 'devices' && <DeviceList />}
            {prefs.panel === 'settings' && <Settings prefs={prefs} set={set} canvas={canvas} isTrack={isTrack} />}
          </section>
        )}
      </div>

      <nav className="np-tabs" aria-label="Panel lateral">
        {[
          ['lyrics', 'Letra', 'lyrics'],
          ['queue', 'Cola', 'queue'],
          ['devices', 'Dispositivos', 'devices'],
          ['settings', 'Ajustes', 'settings'],
          ['none', 'Ocultar panel', 'image'],
        ].map(([v, l, icon]) => (
          <button key={v} className={prefs.panel === v ? 'on' : ''} onClick={() => set({ panel: v })} title={l}>
            <Icon name={icon} size={18} />
            <span>{l}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// ======================= LETRA =======================
function Lyrics({ item, now, onSeek, variant }) {
  const lyr = useLyrics(item, true);
  const [active, setActive] = useState(-1);
  const box = useRef(null);
  const synced = lyr.status === 'synced';
  const lines = synced ? lyr.lines : null;

  // Cada fotograma: línea activa y relleno progresivo (sin re-renderizar la lista)
  useFrame(() => {
    if (!lines) return;
    const t = now() + 200;
    let i = -1;
    for (let k = 0; k < lines.length && lines[k].t <= t; k++) i = k;
    setActive((prev) => (prev === i ? prev : i));
    const el = box.current?.querySelector('.line.now');
    if (el && i >= 0) {
      const end = lines[i + 1]?.t ?? item?.duration_ms ?? lines[i].t + 4000;
      const span = Math.max(300, Math.min(end - lines[i].t, 7000));
      el.style.setProperty('--fill', `${(Math.min(1, Math.max(0, (t - lines[i].t) / span)) * 100).toFixed(1)}%`);
    }
  }, [lines, now, item?.duration_ms]);

  // Desplazamiento suave para centrar la línea activa
  useEffect(() => {
    if (variant !== 'side' || active < 0) return;
    const c = box.current;
    const el = c?.querySelector(`[data-i="${active}"]`);
    if (!c || !el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    c.scrollTo({ top: el.offsetTop - c.clientHeight * 0.38, behavior: reduce ? 'auto' : 'smooth' });
  }, [active, variant]);

  if (!item) return null;
  const msg =
    lyr.status === 'loading' || lyr.status === 'idle' ? null
    : lyr.status === 'episode' ? 'Los podcasts no tienen letra.'
    : lyr.status === 'instrumental' ? 'Canción instrumental.'
    : lyr.status !== 'synced' && lyr.status !== 'plain' ? 'No hay letra para esta canción en LRCLIB.'
    : null;

  if (variant !== 'side') {
    // Letra sobre la portada: línea anterior, actual y siguiente (o solo la actual)
    if (!synced) return null;
    const from = variant === 'line' ? active : Math.max(0, active - 1);
    const to = variant === 'line' ? active : active + 1;
    return (
      <div className={`lyrics-overlay ${variant}`} ref={box} aria-live="polite">
        {active < 0 ? (
          <p className="line">♪</p>
        ) : (
          lines.slice(from, to + 1).map((l, k) => (
            <p key={from + k} className={`line ${from + k === active ? 'now' : ''}`}>
              {l.text || '♪'}
            </p>
          ))
        )}
      </div>
    );
  }

  if (lyr.status === 'loading' || lyr.status === 'idle') return <Loading />;
  if (msg) return <p className="lyrics-msg">{msg}</p>;

  return (
    <div className={`lyrics ${synced ? 'synced' : ''}`} ref={box}>
      {lyr.lines.map((l, i) =>
        synced ? (
          <button
            key={i}
            data-i={i}
            className={`line ${i === active ? 'now' : i < active ? 'past' : ''}`}
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

// ======================= AJUSTES =======================
function Options({ label, value, options, onChange }) {
  return (
    <fieldset className="opt">
      <legend>{label}</legend>
      <div className="opt-row">
        {options.map(([v, l]) => (
          <button key={v} type="button" className={value === v ? 'on' : ''} onClick={() => onChange(v)} aria-pressed={value === v}>
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Slider({ label, value, max, onChange }) {
  return (
    <label className="opt">
      <span className="opt-label">
        {label} <output>{value}</output>
      </span>
      <input type="range" min="0" max={max} value={value} style={{ '--p': `${(value / max) * 100}%` }} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Settings({ prefs, set, canvas, isTrack }) {
  return (
    <div className="np-settings">
      <h3>Ajustes de la vista</h3>
      <Options
        label="Tema"
        value={prefs.theme}
        onChange={(theme) => set({ theme })}
        options={[
          ['liquid', 'Cristal líquido'],
          ['glass', 'Cristal'],
          ['minimal', 'Minimal'],
          ['aod', 'Pantalla siempre activa'],
          ['xp', 'Retro XP'],
        ]}
      />
      <Options label="Fuente" value={prefs.font} onChange={(font) => set({ font })} options={Object.entries(FONTS).map(([k, f]) => [k, f.label])} />
      <Options
        label="Forma de la portada"
        value={prefs.shape}
        onChange={(shape) => set({ shape })}
        options={[
          ['rounded', 'Redondeada'],
          ['square', 'Cuadrada'],
          ['circle', 'Circular'],
          ['vinyl', 'Vinilo'],
        ]}
      />
      <Options
        label="Filtro de imagen"
        value={prefs.filter}
        onChange={(filter) => set({ filter })}
        options={[
          ['none', 'Ninguno'],
          ['grayscale', 'Blanco y negro'],
          ['sepia', 'Sepia'],
          ['vintage', 'Vintage'],
          ['vivid', 'Vívido'],
        ]}
      />
      <Options
        label="Animación de la portada"
        value={prefs.anim}
        onChange={(anim) => set({ anim })}
        options={[
          ['none', 'Ninguna'],
          ['spin', 'Giro'],
          ['pulse', 'Pulso'],
          ['tilt', 'Inclinación con el ratón'],
        ]}
      />
      <fieldset className="opt">
        <legend>Color de acento</legend>
        <div className="swatches">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch ${prefs.accent === c ? 'on' : ''} ${c === 'auto' ? 'auto' : ''}`}
              style={c === 'auto' ? undefined : { background: c }}
              onClick={() => set({ accent: c })}
              aria-pressed={prefs.accent === c}
              title={c === 'auto' ? 'Automático (de la portada)' : c}
            >
              {c === 'auto' && 'Auto'}
            </button>
          ))}
        </div>
      </fieldset>
      <Options
        label="Letra"
        value={prefs.lyrics}
        onChange={(lyrics) => set({ lyrics, panel: lyrics === 'side' ? 'lyrics' : prefs.panel })}
        options={[
          ['side', 'En el panel'],
          ['cover', 'Sobre la portada'],
          ['line', 'Una línea en la portada'],
          ['none', 'Ocultar'],
        ]}
      />
      <Options
        label="Canvas"
        value={prefs.canvas}
        onChange={(c) => set({ canvas: c })}
        options={[
          ['none', 'Desactivado'],
          ['background', 'Fondo'],
          ['cover', 'Portada'],
          ['both', 'Ambos'],
          ['portrait', 'Retrato 9:16'],
        ]}
      />
      <p className="opt-hint">
        {prefs.canvas === 'none' ? 'Canvas desactivado: se muestra la portada.' : !isTrack ? 'Solo las canciones tienen Canvas.' : canvas ? 'Esta canción tiene Canvas.' : 'Esta canción no tiene Canvas: se usa la portada.'}
      </p>
      {prefs.canvas === 'portrait' && (
        <Options
          label="Posición en modo retrato"
          value={prefs.portraitPos}
          onChange={(portraitPos) => set({ portraitPos })}
          options={[
            ['left', 'Izquierda'],
            ['center', 'Centro'],
          ]}
        />
      )}
      <Slider label="Desenfoque del fondo (portada)" value={prefs.blur} max={120} onChange={(blur) => set({ blur })} />
      <Slider label="Desenfoque del fondo (Canvas)" value={prefs.canvasBlur} max={60} onChange={(canvasBlur) => set({ canvasBlur })} />
      <button className="btn" type="button" onClick={() => set({ ...DEFAULTS, panel: 'settings' })}>
        Restablecer ajustes
      </button>
    </div>
  );
}
