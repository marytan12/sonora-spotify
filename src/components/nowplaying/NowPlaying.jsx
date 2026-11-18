import { useCallback, useEffect, useRef, useState } from 'react';
import { useArtColor, useArtPalette, useCanvas } from '../../art.js';
import { useLiquidGlass } from '../../glass.js';
import { useTick } from '../../clock.js';
import { go, useApp } from '../../store.jsx';
import { DeviceList, QueueList, Seek, Transport, Volume } from '../controls.jsx';
import { Artists, Icon, imgOf } from '../ui.jsx';
import Credits from './Credits.jsx';
import Lyrics from './Lyrics.jsx';
import { FONTS, usePrefs } from './prefs.js';
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

const isTyping = (el) => /^(input|textarea|select)$/i.test(el?.tagName) || el?.isContentEditable;

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
  const canvasState = useCanvas(prefs.canvas !== 'none' && isTrack ? item.id : null);
  const canvas = canvasState.url;
  const [canvasNoticeHidden, setCanvasNoticeHidden] = useState(false);
  useEffect(() => setCanvasNoticeHidden(false), [item?.id]);
  const progress = useTick(clock.now, playback?.is_playing, 150);
  const root = useRef(null);
  const tabsRef = useRef(null);
  useLiquidGlass(tabsRef, { bezel: 14, scale: 28 });
  // En karaoke las barras siempre se esconden en reposo; fuera, solo si el usuario lo activa
  const idle = useIdle((prefs.autoHide || karaoke) && !!playback?.is_playing && (karaoke || prefs.panel !== 'settings'));
  // Reloj de la letra con el ajuste de sincronía del usuario
  const offset = prefs.lyricOffset;
  const clockNow = clock.now;
  const lyricNow = useCallback(() => clockNow() + offset, [clockNow, offset]);

  const closeBtn = useRef(null);
  const seekRef = useRef(null);
  const seek = (ms) => {
    const dur = item?.duration_ms || 0;
    const to = Math.max(0, Math.min(dur ? dur - 500 : ms, ms));
    clock.jump(to);
    actions.seek(to);
  };
  seekRef.current = seek;

  // Foco dentro de la vista al abrir y vuelta al elemento anterior al cerrar
  useEffect(() => {
    const prev = document.activeElement;
    closeBtn.current?.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      if (prev instanceof HTMLElement) prev.focus({ preventScroll: true });
    };
  }, []);

  // Teclado: Esc cierra (o sale del karaoke), ←/→ retroceden o avanzan 10 s, F pantalla completa
  useEffect(() => {
    const k = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === 'Escape' && !document.fullscreenElement) {
        if (karaoke) setKaraoke(false);
        else onClose();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        seekRef.current(clock.now() + (e.key === 'ArrowRight' ? 10_000 : -10_000));
      } else if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else root.current?.requestFullscreen?.()?.catch(() => {});
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, karaoke, clock]);

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
  const lyricSeek = (t) => seek(Math.max(0, t - offset));
  const album = isTrack ? item.album : null;
  const mainArtist = item?.artists?.find((a) => a.id);

  const canvasCover = canvas && ['cover', 'both', 'portrait'].includes(prefs.canvas);
  const canvasBg = canvas && ['background', 'both'].includes(prefs.canvas);
  const bgLayers = useLayers(canvasBg ? `v:${canvas}` : art ? `i:${art}` : null);
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
      aria-modal="true"
      aria-label="Sonando ahora"
    >
      <div className="np-bg" aria-hidden="true">
        {bgLayers.map((k) => (
          <div key={k} className="np-bg-layer">
            {k.startsWith('v:') ? <video src={k.slice(2)} autoPlay loop muted playsInline /> : <img src={k.slice(2)} alt="" />}
          </div>
        ))}
        {palette && <div className="np-breath" />}
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

      <div className="np-body">
        <section className="np-main">
          <div className="np-stage">
            <div className={`np-artwork ${canvasCover ? 'has-canvas' : ''}`}>
              <div className="np-artwork-inner">
                {canvasCover ? (
                  <video key={canvas} className="np-fade" src={canvas} autoPlay loop muted playsInline poster={art} />
                ) : art ? (
                  <img key={art} className="np-fade" src={art} alt={item?.album?.name || item?.name || ''} />
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
            {prefs.panel === 'settings' && (
              <Settings prefs={prefs} set={set} canvas={canvas} canvasError={canvasState.error} onRetryCanvas={canvasState.retry} isTrack={isTrack} />
            )}
          </section>
        )}
      </div>

      <nav ref={tabsRef} className="np-tabs lg-track" aria-label="Panel lateral">
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
