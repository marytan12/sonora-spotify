import { useEffect, useRef, useState } from 'react';
import { go, useApp } from '../store.jsx';
import { Artists, Cover, Icon, fmt, imgOf } from './ui.jsx';

/**
 * Lista de canciones/episodios.
 * - contextUri: si se da, al pulsar se reproduce dentro de ese contexto (álbum/playlist)
 * - si no, se reproduce la lista de URIs a partir de la canción pulsada
 */
export default function TrackList({ tracks, contextUri, showAlbum = true, showCover = true, onRemove, onMove, numbered = true }) {
  const { actions, playback, saved, checkSaved, toggleSaved, openAddToPlaylist } = useApp();
  const [menu, setMenu] = useState(null);
  const list = (tracks || []).filter((t) => t && t.uri);
  const currentUri = playback?.item?.uri;

  useEffect(() => {
    checkSaved(list.map((t) => t.uri).filter((u) => !(u in saved)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  const play = (t, i) => {
    if (contextUri && !t.is_local) actions.playContext(contextUri, t.uri);
    else actions.playUris(list.filter((x) => !x.is_local).map((x) => x.uri), i);
  };

  if (!list.length) return <p className="muted pad">No hay canciones aquí.</p>;

  return (
    <div className="tracklist">
      <div className={`tl-row tl-head ${showAlbum ? '' : 'no-album'}`}>
        <span>#</span>
        <span>Título</span>
        {showAlbum && <span className="hide-sm">Álbum</span>}
        <span />
        <span className="right">⏱</span>
        <span />
      </div>
      {list.map((t, i) => {
        const isCurrent = currentUri === t.uri;
        const album = t.album || (t.show ? { ...t.show, type: 'show' } : null);
        return (
          <div
            key={t.uri + i}
            className={`tl-row ${isCurrent ? 'current' : ''} ${showAlbum ? '' : 'no-album'}`}
            onDoubleClick={() => play(t, i)}
          >
            <span className="tl-num">
              <span className="n">{isCurrent && playback?.is_playing ? '♪' : numbered ? i + 1 : '•'}</span>
              <button className="tl-play" onClick={() => play(t, i)} aria-label="Reproducir">
                <Icon name="play" size={16} />
              </button>
            </span>
            <span className="tl-title">
              {showCover && <Cover src={imgOf(t.album || t, 'sm')} size={40} />}
              <span className="tl-text">
                <span className="tl-name">
                  {t.explicit && <span className="explicit">E</span>}
                  {t.name}
                </span>
                <span className="tl-artist">
                  {t.artists ? <Artists artists={t.artists} /> : t.show?.name || ''}
                </span>
              </span>
            </span>
            {showAlbum && (
              <span className="tl-album hide-sm">
                {album?.id && (
                  <a href={`#/${album.type === 'show' ? 'show' : 'album'}/${album.id}`}>{album.name}</a>
                )}
              </span>
            )}
            <span>
              {t.type === 'track' && !t.is_local && (
                <button
                  className={`icon-btn heart ${saved[t.uri] ? 'on' : ''}`}
                  title={saved[t.uri] ? 'Quitar de Me gusta' : 'Guardar en Me gusta'}
                  onClick={() => toggleSaved(t.uri)}
                >
                  <Icon name="heart" size={16} />
                </button>
              )}
            </span>
            <span className="right muted">{fmt(t.duration_ms)}</span>
            <span className="tl-menu">
              <button className="icon-btn" onClick={(e) => setMenu({ i, t, x: e.clientX, y: e.clientY })} aria-label="Más opciones">
                <Icon name="dots" size={16} />
              </button>
            </span>
          </div>
        );
      })}
      {menu && (
        <RowMenu
          {...menu}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Reproducir', fn: () => play(menu.t, menu.i) },
            { label: 'Añadir a la cola', fn: () => actions.addToQueue(menu.t.uri) },
            { label: 'Añadir a una playlist…', fn: () => openAddToPlaylist([menu.t.uri]) },
            menu.t.type === 'track' && {
              label: saved[menu.t.uri] ? 'Quitar de Me gusta' : 'Guardar en Me gusta',
              fn: () => toggleSaved(menu.t.uri),
            },
            menu.t.artists?.[0]?.id && { label: 'Ir al artista', fn: () => go('artist', menu.t.artists[0].id) },
            menu.t.album?.id && { label: 'Ir al álbum', fn: () => go('album', menu.t.album.id) },
            onMove && menu.i > 0 && { label: 'Subir', fn: () => onMove(menu.i, -1) },
            onMove && menu.i < list.length - 1 && { label: 'Bajar', fn: () => onMove(menu.i, 1) },
            onRemove && { label: 'Quitar de esta playlist', danger: true, fn: () => onRemove(menu.t, menu.i) },
            menu.t.external_urls?.spotify && {
              label: 'Copiar enlace',
              fn: () => navigator.clipboard?.writeText(menu.t.external_urls.spotify),
            },
          ].filter(Boolean)}
        />
      )}
    </div>
  );
}

export function RowMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    const r = ref.current.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x - r.width, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
    const close = () => onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('resize', close);
    document.querySelector('.main')?.addEventListener('scroll', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('resize', close);
      document.querySelector('.main')?.removeEventListener('scroll', close);
    };
  }, [x, y, onClose]);
  return (
    <div className="menu" ref={ref} style={pos} onMouseDown={(e) => e.stopPropagation()}>
      {items.map((it) => (
        <button
          key={it.label}
          className={it.danger ? 'danger' : ''}
          onClick={() => {
            onClose();
            it.fn();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
