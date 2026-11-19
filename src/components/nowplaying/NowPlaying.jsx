import { useCallback, useEffect, useRef, useState } from 'react';
import { useArtColor, useArtPalette, useCanvas } from '../../art.js';
import { useLiquidGlass } from '../../glass.js';
import { useSongOffset } from '../../lyrics.js';
import { readSettings } from '../../settings.js';
import { comboOf, isTyping } from '../../shortcuts.js';
import { sp } from '../../spotify.js';
import { go, useApp } from '../../store.jsx';
import { DeviceList, ProgressLine, QueueList, Seek, Transport, Volume } from '../controls.jsx';
import { Artists, Icon, fmt, imgOf } from '../ui.jsx';
import Credits from './Credits.jsx';
import Lyrics from './Lyrics.jsx';
import { FONTS, LYRIC_WEIGHTS, usePrefs } from './prefs.js';
import Settings from './Settings.jsx';

/** Mantiene la capa anterior unos instantes para hacer un fundido al cambiar de canción */
function useLayers(key, ms = 800) {
  const [layers, setLayers] = useState(key ? [key] : []);
  useEffect(() => {
    setLayers((l) => (l[l.length - 1] === key ? l : [...l.slice(-1), key].filter(Boolean)));
    const t = setTimeout(() => setLayers((l) => l.slice(-1)), ms);
    return () => clearTimeout(t);
  }, [key, ms]);
  return layers;
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

// Foto del artista para el fondo (una petición por artista y sesión)
const artistImages = new Map();
function useArtistImage(id) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!id || artistImages.has(id)) return;
    artistImages.set(id, null);
    sp.artist(id)
      .then((a) => {
        artistImages.set(id, imgOf(a) || null);
        force((n) => n + 1);
      })
      .catch(() => artistImages.delete(id));
  }, [id]);
  return id ? artistImages.get(id) || null : null;
}

/** Modo reloj: la hora en grande, para dejar Sonora puesto en una pantalla */
function ClockFace({ item }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="np-clock" aria-hidden="true">
      <time>{now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</time>
      <span className="np-clock-date">{now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      {item && (
        <span className="np-clock-song">
          {item.name} · {item.artists?.map((a) => a.name).join(', ') || item.show?.name}
        </span>
      )}
    </div>
  );
}

/** Diseño «Estudio»: datos de la canción */
function Info({ item }) {
  const { queue } = useApp();
  const album = item.album;
  const next = queue[0];
  const rows = [
    album?.name && ['Álbum', album.id ? <a href={`#/album/${album.id}`}>{album.name}</a> : album.name],
    album?.release_date && ['Año', album.release_date.slice(0, 4)],
    item.track_number && ['Pista', album?.total_tracks ? `${item.track_number} de ${album.total_tracks}` : item.track_number],
    ['Duración', fmt(item.duration_ms)],
    item.explicit && ['Contenido', 'Explícito'],
    Number.isFinite(item.popularity) && ['Popularidad', `${item.popularity} / 100`],
    next && ['A continuación', `${next.name} · ${next.artists?.map((a) => a.name).join(', ') || ''}`],
  ].filter(Boolean);
  return (
    <dl className="np-info">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ======================= VISTA =======================
export default function NowPlaying({ onClose, clock, viaTransition }) {
  const { playback, actions, saved, toggleSaved, openAddToPlaylist } = useApp();
  const [prefs, set] = usePrefs();
  const item = playback?.item;
  const isTrack = item?.type === 'track';
  const art = imgOf(item?.album || item);
  const color = useArtColor(art);
  // Los colores de la portada sirven para el fondo que respira y para el fondo degradado
  const palette = useArtPalette(prefs.breathe || prefs.bg === 'gradient' ? art : null);
  const breathing = prefs.breathe && !!palette;
  const [karaoke, setKaraoke] = useState(false);
  const canvasState = useCanvas(prefs.canvas !== 'none' && isTrack ? item.id : null);
  const canvas = canvasState.url;
  const [canvasNoticeHidden, setCanvasNoticeHidden] = useState(false);
  useEffect(() => setCanvasNoticeHidden(false), [item?.id]);
  const root = useRef(null);
  const tabsRef = useRef(null);
  useLiquidGlass(tabsRef, { bezel: 14, scale: 28 });
  // En karaoke las barras siempre se esconden en reposo; fuera, solo si el usuario lo activa
  const idle = useIdle((prefs.autoHide || karaoke) && !!playback?.is_playing && (karaoke || prefs.panel !== 'settings'));
  // Modo reloj: tras los minutos elegidos sin tocar nada (no en karaoke ni con los ajustes abiertos)
  const clockOn = useIdle(prefs.clockAfter > 0 && !karaoke && prefs.panel !== 'settings', prefs.clockAfter * 60_000);
  // Reloj de la letra: ajuste general de sincronía + el fino de esta canción
  const offset = prefs.lyricOffset + useSongOffset(item?.id);
  const clockNow = clock.now;
  const lyricNow = useCallback(() => clockNow() + offset, [clockNow, offset]);

  const closeBtn = useRef(null);
  const firstArt = useRef(art); // portada con la que se abrió la vista
  const seek = (ms) => {
    const dur = item?.duration_ms || 0;
    const to = Math.max(0, Math.min(dur ? dur - 500 : ms, ms));
    clock.jump(to);
    actions.seek(to);
  };
  // Versiones estables (no cambian entre renders) para la letra y las barras de progreso
  const seekRef = useRef(seek);
  seekRef.current = seek;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const stableSeek = useCallback((ms) => seekRef.current(ms), []);
  const lyricSeek = useCallback((t) => seekRef.current(Math.max(0, t - offsetRef.current)), []);

  // Foco dentro de la vista al abrir (en la propia vista, no en el botón de cerrar: así Espacio pausa
  // en vez de cerrarla) y vuelta al elemento anterior al cerrar
  useEffect(() => {
    const prev = document.activeElement;
    root.current?.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      if (prev instanceof HTMLElement) prev.focus({ preventScroll: true });
    };
  }, []);

  // Teclado: Esc cierra (o sale del karaoke) y la tecla de pantalla completa de Ajustes (F) la alterna.
  // El resto de atajos (avanzar, retroceder, volumen…) son los de toda la app (PlayerBar)
  useEffect(() => {
    const k = (e) => {
      if (isTyping(e.target)) return;
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey && !document.fullscreenElement) {
        if (karaoke) setKaraoke(false);
        else onClose();
      } else if (comboOf(e) === readSettings().keys.fullscreen) {
        e.preventDefault();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else root.current?.requestFullscreen?.()?.catch(() => {});
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, karaoke]);

  // Si se sale de la pantalla completa (Esc del navegador, F11…), el karaoke también se cierra
  useEffect(() => {
    if (!karaoke) return;
    const onFs = () => !document.fullscreenElement && setKaraoke(false);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [karaoke]);

  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen?.());
  const toggleKaraoke = () => {
    const on = !karaoke;
    setKaraoke(on);
    // El karaoke va a pantalla completa de verdad; al salir se vuelve a la ventana
    if (on && !document.fullscreenElement) root.current?.requestFullscreen?.()?.catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  const album = isTrack ? item.album : null;
  const mainArtist = item?.artists?.find((a) => a.id);
  const artistImg = useArtistImage(prefs.bg === 'artist' ? mainArtist?.id : null);

  const layout = prefs.layout;
  const canvasCover = canvas && ['cover', 'both', 'portrait'].includes(prefs.canvas);
  const canvasBg = canvas && ['background', 'both'].includes(prefs.canvas);
  // Fondo: el Canvas manda si se ha pedido de fondo; si no, lo elegido en Ajustes
  const bgKey = canvasBg
    ? `v:${canvas}`
    : prefs.bg === 'artist' && artistImg
      ? `a:${artistImg}`
      : prefs.bg === 'gradient' && art
        ? `g:${art}`
        : prefs.bg === 'solid' && art
          ? `s:${art}`
          : art
            ? `i:${art}`
            : null;
  const bgLayers = useLayers(bgKey);
  const portrait = canvas && prefs.canvas === 'portrait' && layout !== 'lyrics';
  const accent = prefs.accent === 'auto' ? (color ? `rgb(${color})` : '#fff') : prefs.accent;
  // En «Solo letra» la letra ya es lo principal: el panel solo se abre para lo demás
  const panel = layout === 'lyrics' && prefs.panel === 'lyrics' ? 'none' : prefs.panel;
  const showSide = panel !== 'none' && !(portrait && prefs.portraitPos === 'center');
  const sideIsLyrics = panel === 'lyrics';
  const lyricFont = prefs.lyricFont !== 'same' ? FONTS[prefs.lyricFont]?.css : null;
  const lyricProps = { fill: prefs.lyricFill, lines: prefs.coverLines };

  const cls = [
    'nowplaying',
    viaTransition ? 'np-vt' : '',
    `layout-${layout}`,
    `theme-${prefs.theme}`,
    `shape-${prefs.shape}`,
    `filter-${prefs.filter}`,
    `lyr-${prefs.lyricSize}`,
    `lyr-align-${prefs.lyricAlign}`,
    `lyr-fill-${prefs.lyricFill}`,
    `lyr-color-${prefs.lyricColor}`,
    lyricFont ? 'lyr-font-custom' : '',
    prefs.lyricWeight !== 'auto' ? 'lyr-weight-custom' : '',
    `font-${prefs.font}`,
    `breathe-${prefs.breatheSpeed}`,
    idle ? 'is-idle' : '',
    clockOn ? 'is-clock' : '',
    karaoke ? 'is-karaoke' : '',
    breathing ? 'breathe' : '',
    ...prefs.hidden.map((k) => `hide-${k}`),
    playback?.is_playing ? 'is-playing' : 'is-paused',
    portrait ? `portrait pos-${prefs.portraitPos}` : '',
    showSide ? '' : 'no-side',
  ].join(' ');

  const side = showSide && (
    <section className={`np-side ${sideIsLyrics ? 'is-lyrics' : ''}`}>
      {panel === 'lyrics' &&
        (prefs.lyrics === 'side' || layout === 'stage' ? (
          <Lyrics item={item} now={lyricNow} onSeek={lyricSeek} variant="side" {...lyricProps} />
        ) : (
          <p className="lyrics-msg">La letra se muestra sobre la portada. Cámbialo en Ajustes.</p>
        ))}
      {panel === 'queue' && <QueueList />}
      {panel === 'devices' && <DeviceList />}
      {panel === 'credits' && <Credits item={item} />}
      {panel === 'settings' && (
        <Settings prefs={prefs} set={set} canvas={canvas} canvasError={canvasState.error} onRetryCanvas={canvasState.retry} isTrack={isTrack} />
      )}
    </section>
  );

  const metaActions = (
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
  );

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
        ...(lyricFont && { '--lyr-font': lyricFont }),
        ...(prefs.lyricWeight !== 'auto' && { '--lyr-weight': LYRIC_WEIGHTS[prefs.lyricWeight] }),
        ...(palette && { '--c1': palette[0], '--c2': palette[1], '--c3': palette[2] }),
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Sonando ahora"
      tabIndex={-1}
    >
      <div className="np-bg" aria-hidden="true">
        {bgLayers.map((k) => (
          <div key={k} className={`np-bg-layer is-${k[0]}`}>
            {k.startsWith('v:') ? (
              <video src={k.slice(2)} autoPlay loop muted playsInline />
            ) : k.startsWith('g:') || k.startsWith('s:') ? (
              <div className="np-bg-fill" />
            ) : (
              <img src={k.slice(2)} alt="" />
            )}
          </div>
        ))}
        {breathing && <div className="np-breath" />}
      </div>

      <header className="np-top">
        <button ref={closeBtn} className="icon-btn round" onClick={onClose} title="Cerrar (Esc)">
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
          <Lyrics item={item} now={lyricNow} onSeek={lyricSeek} variant="karaoke" {...lyricProps} />
          <footer className="karaoke-foot">
            <button className="play-btn" onClick={actions.toggle} title={playback?.is_playing ? 'Pausar' : 'Reproducir'}>
              <Icon name={playback?.is_playing ? 'pause' : 'play'} size={22} />
            </button>
            <div className="karaoke-info">
              <strong>{item.name}</strong>
              <span>{item.artists?.map((a) => a.name).join(', ')}</span>
            </div>
            <ProgressLine className="karaoke-progress" clock={clock} playing={!!playback?.is_playing} duration={item.duration_ms} />
          </footer>
        </div>
      )}

      {canvasState.error && !canvasNoticeHidden && (
        <div className="np-notice" role="status">
          <Icon name="alert" size={16} />
          <span>El servicio de Canvas no responde: se muestra la portada.</span>
          <button type="button" onClick={canvasState.retry}>
            Reintentar
          </button>
          <button type="button" className="np-notice-close" onClick={() => setCanvasNoticeHidden(true)} aria-label="Cerrar aviso">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {layout === 'lyrics' ? (
        // ---- Solo letra: la letra a toda la pantalla y una barra de controles compacta ----
        <div className="np-body np-body-lyrics">
          <div className="np-lyrics-main">
            {isTrack ? (
              <Lyrics item={item} now={lyricNow} onSeek={lyricSeek} variant="karaoke" {...lyricProps} />
            ) : (
              <p className="lyrics-msg">{item ? 'Los podcasts no tienen letra.' : 'Pon algo a sonar desde Spotify o desde Sonora.'}</p>
            )}
            {item && (
              <footer className="np-mini">
                {art ? <img className="np-mini-art" src={art} alt="" /> : <span className="np-mini-art" />}
                <div className="np-titles">
                  <h2 title={item.name}>{item.name}</h2>
                  <p>{item.artists ? <Artists artists={item.artists} /> : item.show?.name}</p>
                </div>
                <Transport />
                <Seek clock={clock} playing={!!playback?.is_playing} duration={item.duration_ms} onSeek={stableSeek} />
                {metaActions}
              </footer>
            )}
          </div>
          {side}
        </div>
      ) : (
        <div className="np-body">
          <section className="np-main">
            <div className="np-stage">
              <div className={`np-artwork ${canvasCover ? 'has-canvas' : ''}`}>
                <div className="np-artwork-inner">
                  {canvasCover ? (
                    <video key={canvas} className="np-fade" src={canvas} autoPlay loop muted playsInline poster={art} />
                  ) : art ? (
                    // Al abrir con transición, la portada ya llega creciendo desde la barra: el fundido es solo al cambiar de canción
                    <img key={art} className={viaTransition && art === firstArt.current ? '' : 'np-fade'} src={art} alt={item?.album?.name || item?.name || ''} />
                  ) : (
                    <div className="cover placeholder">
                      <Icon name="music" size={64} />
                    </div>
                  )}
                  {/* Dentro del marco: el recorte de la portada (redondeada, cuadrada o circular) se aplica también a la letra */}
                  {isTrack && (prefs.lyrics === 'cover' || prefs.lyrics === 'line') && (
                    <Lyrics item={item} now={lyricNow} onSeek={stableSeek} variant={prefs.lyrics} {...lyricProps} />
                  )}
                </div>
              </div>
            </div>

            {item ? (
              <div className="np-controls">
                <div className="np-meta">
                  <div className="np-titles">
                    <h2 title={item.name}>{item.name}</h2>
                    <p>{item.artists ? <Artists artists={item.artists} /> : item.show?.name}</p>
                  </div>
                  {metaActions}
                </div>
                {layout === 'studio' && <Info item={item} />}
                <Seek clock={clock} playing={!!playback?.is_playing} duration={item.duration_ms} onSeek={stableSeek} />
                <Transport large />
                <Volume />
              </div>
            ) : (
              <p className="np-empty">Pon algo a sonar desde Spotify o desde Sonora.</p>
            )}
          </section>

          {side}
        </div>
      )}

      {clockOn && <ClockFace item={item} />}

      <nav ref={tabsRef} className="np-tabs lg-track" aria-label="Panel lateral">
        {[
          ['lyrics', layout === 'lyrics' ? 'Solo letra' : 'Letra', 'lyrics'],
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
