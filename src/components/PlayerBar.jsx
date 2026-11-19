import { useCallback, useEffect, useRef, useState } from 'react';
import { useClock } from '../clock.js';
import { useLiquidGlass } from '../glass.js';
import { useShortcuts } from '../shortcuts.js';
import { go, useApp } from '../store.jsx';
import { canTransition, transition } from '../transitions.js';
import { DeviceList, QueueList, Seek, Transport, Volume, toggleMute } from './controls.jsx';
import NowPlaying from './nowplaying/NowPlaying.jsx';
import { Artists, Cover, Icon, imgOf } from './ui.jsx';

export default function PlayerBar() {
  const { playback, actions, saved, checkSaved, toggleSaved, route, volumeNow, sdkClock, pollClock } = useApp();
  const [panel, setPanel] = useState(null); // 'queue' | 'devices'
  const [open, setOpen] = useState(false);
  const item = playback?.item;
  const clock = useClock(playback, sdkClock, pollClock);
  const barRef = useRef(null);
  const popRef = useRef(null);
  useLiquidGlass(barRef);
  useLiquidGlass(popRef, { enabled: !!panel, bezel: 18 });

  // Al navegar (p. ej. pulsando un artista) se cierran la vista y los paneles
  useEffect(() => {
    setOpen(false);
    setPanel(null);
  }, [route.name, route.id]);

  useEffect(() => {
    if (item?.uri && item.type === 'track') checkSaved([item.uri]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.uri]);

  const openNp = () => transition(() => setOpen(true), 'np');
  const closeNp = useCallback(() => transition(() => setOpen(false), 'np'), []);

  const seek = (ms) => {
    const dur = item?.duration_ms || 0;
    const to = Math.max(0, Math.min(dur ? dur - 500 : ms, ms));
    clock.jump(to);
    actions.seek(to);
  };

  // Atajos de teclado (se cambian en Ajustes)
  useShortcuts({
    toggle: actions.toggle,
    next: actions.next,
    previous: actions.previous,
    forward: () => item && seek(clock.now() + 10_000),
    back: () => item && seek(clock.now() - 10_000),
    volUp: () => volumeNow != null && actions.volume(Math.min(100, volumeNow + 10)),
    volDown: () => volumeNow != null && actions.volume(Math.max(0, volumeNow - 10)),
    mute: () => volumeNow != null && toggleMute(volumeNow, actions),
    like: () => item?.type === 'track' && toggleSaved(item.uri),
    shuffle: actions.shuffle,
    repeat: actions.repeat,
    nowPlaying: () => {
      if (!item) return;
      const next = !open;
      transition(() => setOpen(next), 'np');
    },
    search: () => {
      setOpen(false);
      go('search');
      setTimeout(() => document.querySelector('.search-bar input')?.focus(), 80);
    },
  });

  return (
    <>
      <footer ref={barRef} className="player lg-track">
        <div className="np">
          {item ? (
            <>
              {/* Mientras la vista está cerrada, esta portada es la que crece hasta la grande al abrirla */}
              <button className="np-art" onClick={openNp} title="Abrir Sonando ahora" style={open ? undefined : { viewTransitionName: 'np-art' }}>
                <Cover src={imgOf(item.album || item, 'sm')} size={52} />
                <span className="np-expand">
                  <Icon name="up" size={18} />
                </span>
              </button>
              <div className="np-text">
                <button className="np-name" onClick={openNp}>
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
          <Seek clock={clock} playing={!!playback?.is_playing && !open} duration={item?.duration_ms || 0} onSeek={seek} />
        </div>

        <div className="extras">
          <button className="play-btn mini show-sm" onClick={actions.toggle} title={playback?.is_playing ? 'Pausar' : 'Reproducir'}>
            <Icon name={playback?.is_playing ? 'pause' : 'play'} size={18} />
          </button>
          <button className="icon-btn hide-md" onClick={openNp} title="Letra y Sonando ahora">
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
          <div className="hide-sm bar-volume">
            <Volume />
          </div>
        </div>
      </footer>

      {panel && (
        <aside ref={popRef} className="popover-panel glass lg-track">
          <div className="panel-head">
            <h3>{panel === 'queue' ? 'A continuación' : 'Dispositivos'}</h3>
            <button className="icon-btn" onClick={() => setPanel(null)} aria-label="Cerrar">
              <Icon name="close" />
            </button>
          </div>
          {panel === 'queue' ? <QueueList /> : <DeviceList />}
        </aside>
      )}
      {open && <NowPlaying onClose={closeNp} clock={clock} viaTransition={canTransition()} />}
    </>
  );
}
