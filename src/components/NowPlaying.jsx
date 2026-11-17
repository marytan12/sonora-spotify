import { useCallback, useEffect, useRef, useState } from 'react';
import { useArtColor, useArtPalette, useCanvas } from '../art.js';
import { useFrame, useTick } from '../clock.js';
import { useCredits } from '../credits.js';
import { lyricsCandidates, pickLyrics, useLyrics } from '../lyrics.js';
import { sp } from '../spotify.js';
import { go, useApp } from '../store.jsx';
import { DeviceList, QueueList, Seek, Transport, Volume } from './controls.jsx';
import { Artists, Icon, Loading, fmt, imgOf, useAsync } from './ui.jsx';

// ---------- Preferencias ----------
const PREFS_KEY = 'sonora_np_prefs_v2';
export const DEFAULTS = {
  theme: 'liquid', // liquid | minimal
  font: 'inter', // inter | montserrat | dot
  shape: 'rounded', // rounded | square | circle
  filter: 'none', // none | grayscale | sepia | vintage | vivid
  accent: 'auto', // auto | #hex
  canvas: 'cover', // none | background | cover | both | portrait
  portraitPos: 'left', // left | center
  blur: 60, // desenfoque del fondo con portada
  canvasBlur: 12, // desenfoque del fondo con Canvas
  dim: 30, // oscurecer el fondo (0-80 %)
  lyrics: 'side', // side | cover | line | none
  lyricSize: 'm', // s | m | l
  lyricAlign: 'left', // left | center
  lyricOffset: 0, // ms: positivo adelanta la letra
  autoHide: false, // ocultar barras tras unos segundos sin mover el ratón
  breathe: true, // fondo que cambia despacio entre los colores de la portada
  hidden: [], // elementos ocultos (ver ELEMENTS)
  panel: 'lyrics', // lyrics | queue | devices | credits | settings | none
};
// Elementos que se pueden ocultar desde Ajustes
const ELEMENTS = [
  ['device', 'Sonando en…'],
  ['actions', 'Me gusta y botones'],
  ['times', 'Tiempos'],
  ['modes', 'Aleatorio y repetir'],
  ['volume', 'Volumen'],
  ['tablabels', 'Nombres de pestañas'],
];
// Valores permitidos: cualquier preferencia antigua (vinilo, temas retirados…) vuelve al valor por defecto
const ALLOWED = {
  theme: ['liquid', 'minimal'],
  font: ['inter', 'montserrat', 'dot'],
  shape: ['rounded', 'square', 'circle'],
  filter: ['none', 'grayscale', 'sepia', 'vintage', 'vivid'],
  canvas: ['none', 'background', 'cover', 'both', 'portrait'],
  portraitPos: ['left', 'center'],
  lyrics: ['side', 'cover', 'line', 'none'],
  lyricSize: ['s', 'm', 'l'],
  lyricAlign: ['left', 'center'],
  panel: ['lyrics', 'queue', 'devices', 'credits', 'settings', 'none'],
};
const FONTS = {
  inter: { label: 'Inter', css: "'Inter', sans-serif" },
  montserrat: { label: 'Montserrat', css: "'Montserrat', sans-serif", g: 'Montserrat:wght@400;500;600;700;800' },
  dot: { label: 'Matriz de puntos', css: "'DotGothic16', sans-serif", g: 'DotGothic16' },
};
const ACCENTS = ['auto', '#FFFFFF', '#30D158', '#FF453A', '#0A84FF', '#BF5AF2', '#FF9F0A', '#64D2FF'];

function sanitize(p) {
  const n = { ...DEFAULTS, ...p };
  for (const [k, list] of Object.entries(ALLOWED)) if (!list.includes(n[k])) n[k] = DEFAULTS[k];
  for (const [k, lo, hi] of [['blur', 0, 120], ['canvasBlur', 0, 60], ['dim', 0, 80], ['lyricOffset', -2000, 2000]]) {
    n[k] = Number.isFinite(n[k]) ? Math.min(hi, Math.max(lo, n[k])) : DEFAULTS[k];
  }
  if (typeof n.accent !== 'string' || !(n.accent === 'auto' || /^#[0-9a-f]{6}$/i.test(n.accent))) n.accent = 'auto';
  n.autoHide = n.autoHide === true;
  n.breathe = n.breathe !== false;
  n.hidden = Array.isArray(n.hidden) ? n.hidden.filter((k) => ELEMENTS.some(([e]) => e === k)) : [];
  delete n.anim;
  delete n.glassPanel;
  return n;
}

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
      return sanitize(JSON.parse(localStorage.getItem(PREFS_KEY)));
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

/** true tras `ms` sin mover el ratón ni pulsar teclas (solo si `enabled`) */
function useIdle(enabled, ms = 3000) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!enabled) return setIdle(false);
    let t;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), ms);
    };
    wake();
    const evs = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'];
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [enabled, ms]);
  return idle;
}

// ======================= VISTA =======================
export default function NowPlaying({ onClose, clock }) {
  const { playback, actions, saved, toggleSaved, openAddToPlaylist } = useApp();
  const [prefs, set] = usePrefs();
  const item = playback?.item;
  const isTrack = item?.type === 'track';
  const art = imgOf(item?.album || item);
  const color = useArtColor(art);
  const palette = useArtPalette(prefs.breathe ? art : null);
  const [karaoke, setKaraoke] = useState(false);
  const canvas = useCanvas(prefs.canvas !== 'none' && isTrack ? item.id : null);
  const progress = useTick(clock.now, playback?.is_playing, 150);
  const root = useRef(null);
  // En karaoke las barras siempre se esconden en reposo; fuera, solo si el usuario lo activa
  const idle = useIdle((prefs.autoHide || karaoke) && !!playback?.is_playing && (karaoke || prefs.panel !== 'settings'));
  // Reloj de la letra con el ajuste de sincronía del usuario
  const offset = prefs.lyricOffset;
  const clockNow = clock.now;
  const lyricNow = useCallback(() => clockNow() + offset, [clockNow, offset]);

  useEffect(() => {
    const k = (e) => {
      if (e.key !== 'Escape' || document.fullscreenElement) return;
      if (karaoke) setKaraoke(false);
      else onClose();
    };
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = '';
    };
  }, [onClose, karaoke]);

  const seek = (ms) => {
    clock.jump(ms);
    actions.seek(ms);
  };

  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen?.());
  const toggleKaraoke = () => {
    const on = !karaoke;
    setKaraoke(on);
    // El karaoke va a pantalla completa de verdad; al salir se vuelve a la ventana
    if (on && !document.fullscreenElement) root.current?.requestFullscreen?.()?.catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  const lyricSeek = (t) => seek(Math.max(0, t - offset));
  const album = isTrack ? item.album : null;
  const mainArtist = item?.artists?.find((a) => a.id);

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
    `lyr-${prefs.lyricSize}`,
    `lyr-align-${prefs.lyricAlign}`,
    `font-${prefs.font}`,
    idle ? 'is-idle' : '',
    karaoke ? 'is-karaoke' : '',
    palette ? 'breathe' : '',
    ...prefs.hidden.map((k) => `hide-${k}`),
    playback?.is_playing ? 'is-playing' : 'is-paused',
    portrait ? `portrait pos-${prefs.portraitPos}` : '',
    showSide ? '' : 'no-side',
  ].join(' ');

  return (
    <div
      ref={root}
      className={cls}
      style={{
        '--art': color || '120 110 160',
        '--accent': accent,
        '--blur': `${canvasBg ? prefs.canvasBlur : prefs.blur}px`,
        '--dim': prefs.dim / 100,
        '--np-font': FONTS[prefs.font]?.css,
        ...(palette && { '--c1': palette[0], '--c2': palette[1], '--c3': palette[2] }),
      }}
      role="dialog"
      aria-label="Sonando ahora"
    >
      <div className="np-bg" aria-hidden="true">
        {canvasBg ? <video key={canvas} src={canvas} autoPlay loop muted playsInline /> : art && <img src={art} alt="" />}
        {palette && <div className="np-breath" />}
      </div>

      <header className="np-top">
        <button className="icon-btn round" onClick={onClose} title="Cerrar (Esc)">
          <Icon name="chevronDown" size={24} />
        </button>
        <div className="np-source">
          {playback?.device && <span>Sonando en {playback.device.name}</span>}
        </div>
        <div className="np-top-actions">
          {isTrack && (
            <button className={`icon-btn round ${karaoke ? 'on' : ''}`} onClick={toggleKaraoke} title={karaoke ? 'Salir del karaoke (Esc)' : 'Modo karaoke'}>
              <Icon name={karaoke ? 'contract' : 'mic'} size={20} />
            </button>
          )}
          {!karaoke && (
            <button className="icon-btn round" onClick={fullscreen} title="Pantalla completa">
              <Icon name="fullscreen" size={20} />
            </button>
          )}
        </div>
      </header>

      {karaoke && isTrack && (
        <div className="np-karaoke">
          <Lyrics item={item} now={lyricNow} onSeek={lyricSeek} variant="karaoke" />
          <footer className="karaoke-foot">
            <button className="play-btn" onClick={actions.toggle} title={playback?.is_playing ? 'Pausar' : 'Reproducir'}>
              <Icon name={playback?.is_playing ? 'pause' : 'play'} size={22} />
            </button>
            <div className="karaoke-info">
              <strong>{item.name}</strong>
              <span>{item.artists?.map((a) => a.name).join(', ')}</span>
            </div>
            <div className="karaoke-progress" style={{ '--p': `${item.duration_ms ? (progress / item.duration_ms) * 100 : 0}%` }} />
          </footer>
        </div>
      )}

      <div className="np-body">
        <section className="np-main">
          <div className="np-stage">
            <div className={`np-artwork ${canvasCover ? 'has-canvas' : ''}`}>
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
                <Lyrics item={item} now={lyricNow} onSeek={seek} variant={prefs.lyrics} />
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
                  {album?.id && (
                    <button className="icon-btn" onClick={() => go('album', album.id)} title={`Ir al álbum: ${album.name}`}>
                      <Icon name="album" size={20} />
                    </button>
                  )}
                  {mainArtist && (
                    <button className="icon-btn" onClick={() => go('artist', mainArtist.id)} title={`Ir al artista: ${mainArtist.name}`}>
                      <Icon name="artist" size={20} />
                    </button>
                  )}
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
                <Lyrics item={item} now={lyricNow} onSeek={lyricSeek} variant="side" />
              ) : (
                <p className="lyrics-msg">La letra se muestra sobre la portada. Cámbialo en Ajustes.</p>
              ))}
            {prefs.panel === 'queue' && <QueueList />}
            {prefs.panel === 'devices' && <DeviceList />}
            {prefs.panel === 'credits' && <Credits item={item} />}
            {prefs.panel === 'settings' && <Settings prefs={prefs} set={set} canvas={canvas} isTrack={isTrack} />}
          </section>
        )}
      </div>

      <nav className="np-tabs" aria-label="Panel lateral">
        {[
          ['lyrics', 'Letra', 'lyrics'],
          ['queue', 'Cola', 'queue'],
          ['devices', 'Dispositivos', 'devices'],
          ['credits', 'Créditos', 'info'],
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
/** Parte una línea en palabras para rellenarlas una a una: un degradado sobre la línea
 *  entera se veía mal cuando la línea ocupa varias filas (todas se rellenaban a la vez). */
function Words({ text }) {
  if (!text) return '♪';
  return text.split(' ').map((w, i) => (
    <span key={i} className="w">
      {w}
      {' '}
    </span>
  ));
}

function fillWords(el, f) {
  const words = el.querySelectorAll('.w');
  if (!words.length) return;
  let total = 0;
  for (const w of words) total += w.textContent.length;
  let acc = 0;
  for (const w of words) {
    const len = w.textContent.length;
    const p = Math.min(1, Math.max(0, (f * total - acc) / len));
    acc += len;
    const v = `${(p * 100).toFixed(1)}%`;
    if (w.style.getPropertyValue('--wf') !== v) w.style.setProperty('--wf', v);
  }
}

function Lyrics({ item, now, onSeek, variant }) {
  const lyr = useLyrics(item, true);
  const [active, setActive] = useState(-1);
  const box = useRef(null);
  const userScroll = useRef(0);
  const synced = lyr.status === 'synced';
  const lines = synced ? lyr.lines : null;

  // La línea activa de la canción anterior no debe arrastrarse a la nueva
  useEffect(() => setActive(-1), [lines]);

  // Cada fotograma: línea activa y relleno progresivo palabra a palabra (sin re-renderizar la lista)
  useFrame(() => {
    if (!lines) return;
    const t = now() + 150;
    let i = -1;
    for (let k = 0; k < lines.length && lines[k].t <= t; k++) i = k;
    setActive((prev) => (prev === i ? prev : i));
    const el = box.current?.querySelector('.line.now');
    if (el && i >= 0) {
      const end = lines[i + 1]?.t ?? item?.duration_ms ?? lines[i].t + 4000;
      // El relleno termina un poco antes del cambio de línea para que se lea completo
      const span = Math.max(300, Math.min((end - lines[i].t) * 0.92, 7000));
      fillWords(el, Math.min(1, Math.max(0, (t - lines[i].t) / span)));
    }
  }, [lines, now, item?.duration_ms]);

  const isList = variant === 'side' || variant === 'karaoke';
  const [fixing, setFixing] = useState(false);
  useEffect(() => setFixing(false), [item?.id]);

  // Si el usuario desplaza la letra a mano, se respeta durante unos segundos
  useEffect(() => {
    const c = box.current;
    if (!c || !isList) return;
    const mark = () => (userScroll.current = Date.now());
    c.addEventListener('wheel', mark, { passive: true });
    c.addEventListener('touchmove', mark, { passive: true });
    return () => {
      c.removeEventListener('wheel', mark);
      c.removeEventListener('touchmove', mark);
    };
  }, [isList, lyr.status, fixing]);

  // Desplazamiento suave para centrar la línea activa
  useEffect(() => {
    if (!isList || active < 0 || Date.now() - userScroll.current < 3500) return;
    const c = box.current;
    const el = c?.querySelector(`[data-i="${active}"]`);
    if (!c || !el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    c.scrollTo({ top: el.offsetTop - c.clientHeight * (variant === 'karaoke' ? 0.42 : 0.38), behavior: reduce ? 'auto' : 'smooth' });
  }, [active, isList, variant, fixing]);

  if (!item) return null;
  const msg =
    lyr.status === 'loading' || lyr.status === 'idle' ? null
    : lyr.status === 'episode' ? 'Los podcasts no tienen letra.'
    : lyr.status === 'instrumental' ? 'Canción instrumental.'
    : lyr.status !== 'synced' && lyr.status !== 'plain' ? 'No hay letra para esta canción en LRCLIB.'
    : null;

  if (!isList) {
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
              {from + k === active ? <Words text={l.text} /> : l.text || '♪'}
            </p>
          ))
        )}
      </div>
    );
  }

  if (lyr.status === 'loading' || lyr.status === 'idle') return <Loading />;
  if (fixing) return <LyricsPicker item={item} current={lyr.meta} onDone={() => setFixing(false)} />;
  const canFix = lyr.status !== 'episode';
  if (msg)
    return (
      <div className="lyrics-msg">
        <p>{msg}</p>
        {canFix && (
          <button className="lyrics-fix" onClick={() => setFixing(true)}>
            Buscar otra letra
          </button>
        )}
      </div>
    );

  return (
    <div className={`lyrics-box ${variant}`}>
      {lyr.meta?.suspicious && (
        <button className="lyrics-warn" onClick={() => setFixing(true)} title="Elegir otra letra">
          <Icon name="alert" size={16} />
          Puede que esta letra no sea de esta versión
        </button>
      )}
      <div className={`lyrics ${synced ? 'synced' : ''}`} ref={box}>
        {lyr.lines.map((l, i) =>
          synced ? (
            <button
              key={i}
              data-i={i}
              className={`line ${i === active ? 'now' : i < active ? 'past' : ''}`}
              onClick={() => onSeek(l.t)}
            >
              {i === active ? <Words text={l.text} /> : l.text || '♪'}
            </button>
          ) : (
            <p key={i} className="line">
              {l.text || ' '}
            </p>
          )
        )}
        <p className="lyrics-src">
          Letra de LRCLIB
          {lyr.meta?.source === 'manual' && ' · elegida a mano'} ·{' '}
          <button className="lyrics-fix" onClick={() => setFixing(true)}>
            ¿No cuadra? Elegir otra
          </button>
        </p>
      </div>
    </div>
  );
}

// Lista de letras alternativas de LRCLIB para cuando la automática no es la buena
function LyricsPicker({ item, current, onDone }) {
  const { data, loading, error } = useAsync(() => lyricsCandidates(item), [item.id]);
  const secs = Math.round((item.duration_ms || 0) / 1000);
  const choose = (id) => {
    pickLyrics(item.id, id);
    onDone();
  };
  return (
    <div className="lyrics-picker">
      <div className="picker-head">
        <h3>Elegir letra</h3>
        <button className="icon-btn" onClick={onDone} aria-label="Cerrar">
          <Icon name="close" size={18} />
        </button>
      </div>
      <p className="muted">
        {item.name} · {item.artists?.[0]?.name} · {fmt(item.duration_ms)}
      </p>
      {current?.source === 'manual' && (
        <button className="picker-reset" onClick={() => choose(null)}>
          <Icon name="refresh" size={16} /> Volver a la letra automática
        </button>
      )}
      {loading ? (
        <Loading />
      ) : error || !data?.length ? (
        <p className="lyrics-msg">No hay otras letras en LRCLIB para esta canción.</p>
      ) : (
        <ul>
          {data.map((c) => {
            const diff = c.duration ? Math.round(c.duration - secs) : null;
            return (
              <li key={c.id}>
                <button className={current?.id === c.id ? 'on' : ''} onClick={() => choose(c.id)}>
                  <span className="pk-main">
                    <strong>{c.trackName}</strong>
                    <span>
                      {c.artistName}
                      {c.albumName ? ` · ${c.albumName}` : ''}
                    </span>
                  </span>
                  <span className="pk-tags">
                    {c.instrumental ? <em>Instrumental</em> : c.syncedLyrics ? <em className="ok">Sincronizada</em> : <em>Sin sincronizar</em>}
                    {diff !== null && (
                      <em className={Math.abs(diff) <= 2 ? 'ok' : Math.abs(diff) > 8 ? 'bad' : ''}>
                        {Math.abs(diff) <= 2 ? 'Misma duración' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} s`}
                      </em>
                    )}
                    {current?.id === c.id && <Icon name="check" size={16} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ======================= CRÉDITOS =======================
const fmtDate = (d) => {
  if (!d) return null;
  const [y, m, day] = d.split('-').map(Number);
  if (!m) return String(y);
  return new Date(y, m - 1, day || 1).toLocaleDateString('es-ES', day ? { day: 'numeric', month: 'long', year: 'numeric' } : { month: 'long', year: 'numeric' });
};

function Credits({ item }) {
  const isTrack = item?.type === 'track';
  const credits = useCredits(item);
  const albumId = isTrack ? item.album?.id : null;
  // Sello y copyright vienen del álbum (si la API los devuelve)
  const { data: albumFull } = useAsync(() => (albumId ? sp.album(albumId).catch(() => null) : Promise.resolve(null)), [albumId]);
  if (!item) return null;
  if (!isTrack) return <p className="lyrics-msg">Los créditos solo están disponibles para canciones.</p>;
  const album = { ...item.album, ...albumFull };
  const facts = [
    ['Álbum', album.name],
    ['Publicado', fmtDate(album.release_date)],
    ['Pista', item.track_number ? `${item.track_number}${album.total_tracks ? ` de ${album.total_tracks}` : ''}${item.disc_number > 1 ? ` (disco ${item.disc_number})` : ''}` : null],
    ['Duración', fmt(item.duration_ms)],
    ['Contenido explícito', item.explicit ? 'Sí' : null],
    ['Popularidad', Number.isFinite(item.popularity) ? `${item.popularity} / 100` : null],
    ['Sello', album.label],
    ['ISRC', item.external_ids?.isrc],
  ].filter(([, v]) => v);
  const copyright = album.copyrights?.find((c) => c.type === 'P') || album.copyrights?.[0];
  const mainArtist = item.artists?.find((a) => a.id);

  return (
    <div className="np-credits">
      <h3>Créditos</h3>
      <div className="credit-links">
        {album.id && (
          <button className="chip-btn" onClick={() => go('album', album.id)}>
            <Icon name="album" size={16} /> Ir al álbum
          </button>
        )}
        {mainArtist && (
          <button className="chip-btn" onClick={() => go('artist', mainArtist.id)}>
            <Icon name="artist" size={16} /> Ir a {mainArtist.name}
          </button>
        )}
      </div>

      <section>
        <h4>Artistas</h4>
        <ul className="credit-people">
          {item.artists?.map((a) => (
            <li key={a.id || a.name}>
              {a.id ? <button onClick={() => go('artist', a.id)}>{a.name}</button> : a.name}
            </li>
          ))}
        </ul>
      </section>

      {credits.status === 'loading' ? (
        <Loading />
      ) : credits.status === 'ok' && credits.roles.length ? (
        credits.roles.map((r) => (
          <section key={r.label}>
            <h4>{r.label}</h4>
            <ul className="credit-people">
              {r.people.map((p) => (
                <li key={p.id || p.name}>
                  {p.name}
                  {p.extra && <span className="muted"> · {p.extra}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="muted credit-none">
          {credits.status === 'error' ? 'No se han podido cargar los créditos ahora mismo.' : 'MusicBrainz aún no tiene compositores ni productores de esta canción.'}
        </p>
      )}

      <dl className="credit-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {copyright && <p className="muted credit-copy">{copyright.text}</p>}
      <p className="lyrics-src">
        Créditos de{' '}
        {credits.url ? (
          <a href={credits.url} target="_blank" rel="noreferrer">
            MusicBrainz
          </a>
        ) : (
          'MusicBrainz'
        )}{' '}
        y Spotify
      </p>
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

function Slider({ label, value, min = 0, max, step = 1, format = (v) => v, onChange }) {
  return (
    <label className="opt">
      <span className="opt-label">
        {label} <output>{format(value)}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--p': `${((value - min) / (max - min)) * 100}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <Options
      label={label}
      value={value ? 'on' : 'off'}
      onChange={(v) => onChange(v === 'on')}
      options={[
        ['on', 'Sí'],
        ['off', 'No'],
      ]}
    />
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
          ['minimal', 'Minimal'],
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
      {prefs.lyrics !== 'none' && (
        <>
          <Options
            label="Tamaño de la letra"
            value={prefs.lyricSize}
            onChange={(lyricSize) => set({ lyricSize })}
            options={[
              ['s', 'Pequeña'],
              ['m', 'Mediana'],
              ['l', 'Grande'],
            ]}
          />
          {prefs.lyrics === 'side' && (
            <Options
              label="Alineación de la letra"
              value={prefs.lyricAlign}
              onChange={(lyricAlign) => set({ lyricAlign })}
              options={[
                ['left', 'Izquierda'],
                ['center', 'Centrada'],
              ]}
            />
          )}
          <Slider
            label="Sincronía de la letra"
            value={prefs.lyricOffset}
            min={-2000}
            max={2000}
            step={100}
            format={(v) => (v === 0 ? 'exacta' : `${v > 0 ? '+' : '−'}${(Math.abs(v) / 1000).toFixed(1)} s ${v > 0 ? 'antes' : 'después'}`)}
            onChange={(lyricOffset) => set({ lyricOffset })}
          />
        </>
      )}
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
      <Slider label="Oscurecer el fondo" value={prefs.dim} max={80} format={(v) => `${v} %`} onChange={(dim) => set({ dim })} />
      <Toggle label="Fondo que respira (colores de la portada)" value={prefs.breathe} onChange={(breathe) => set({ breathe })} />
      <Toggle label="Ocultar barras sin mover el ratón (3 s)" value={prefs.autoHide} onChange={(autoHide) => set({ autoHide })} />
      <fieldset className="opt">
        <legend>Elementos visibles</legend>
        <div className="opt-row">
          {ELEMENTS.map(([k, l]) => {
            const shown = !prefs.hidden.includes(k);
            return (
              <button
                key={k}
                type="button"
                className={shown ? 'on' : ''}
                aria-pressed={shown}
                onClick={() => set({ hidden: shown ? [...prefs.hidden, k] : prefs.hidden.filter((x) => x !== k) })}
              >
                {l}
              </button>
            );
          })}
        </div>
      </fieldset>
      <button className="btn" type="button" onClick={() => set({ ...DEFAULTS, panel: 'settings' })}>
        Restablecer ajustes
      </button>
    </div>
  );
}
