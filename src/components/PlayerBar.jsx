import { useEffect, useRef, useState } from 'react';
import { useClock, useTick } from '../clock.js';
import { useLiquidGlass } from '../glass.js';
import { useApp } from '../store.jsx';
import { DeviceList, QueueList, Seek, Transport, Volume } from './controls.jsx';
import NowPlaying from './nowplaying/NowPlaying.jsx';
import { Artists, Cover, Icon, imgOf } from './ui.jsx';

export default function PlayerBar() {
  const { playback, actions, saved, checkSaved, toggleSaved, route } = useApp();
  const [panel, setPanel] = useState(null); // 'queue' | 'devices'
  const [open, setOpen] = useState(false);
  const item = playback?.item;
  const clock = useClock(playback);
  const barRef = useRef(null);
  const popRef = useRef(null);
  useLiquidGlass(barRef);
  useLiquidGlass(popRef, { enabled: !!panel, bezel: 18 });
  const progress = useTick(clock.now, playback?.is_playing && !open, 250);

  // Al navegar (p. ej. pulsando un artista) se cierran la vista y los paneles
  useEffect(() => {
    setOpen(false);
    setPanel(null);
  }, [route.name, route.id]);

  useEffect(() => {
    if (item?.uri && item.type === 'track') checkSaved([item.uri]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.uri]);

  // Espacio = play/pausa (si no se está escribiendo)
  useEffect(() => {
    const k = (e) => {
      if (e.code !== 'Space' || /input|textarea|select|button/i.test(e.target.tagName) || e.target.isContentEditable) return;
      e.preventDefault();
      actions.toggle();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const seek = (ms) => {
    clock.jump(ms);
    actions.seek(ms);
  };

  return (
    <>
      <footer ref={barRef} className="player lg-track">
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
          <Seek progress={progress} duration={item?.duration_ms || 0} onSeek={seek} />
        </div>

        <div className="extras">
          <button className="play-btn mini show-sm" onClick={actions.toggle} title={playback?.is_playing ? 'Pausar' : 'Reproducir'}>
            <Icon name={playback?.is_playing ? 'pause' : 'play'} size={18} />
          </button>
          <button className="icon-btn hide-md" onClick={() => setOpen(true)} title="Letra y Sonando ahora">
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
      {open && <NowPlaying onClose={() => setOpen(false)} clock={clock} />}
    </>
  );
}
