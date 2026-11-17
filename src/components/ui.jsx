import { useEffect, useState } from 'react';
import { go, useApp } from '../store.jsx';

export const fmt = (ms = 0) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
export const imgOf = (obj, size = 'md') => {
  const imgs = obj?.images || obj?.album?.images || [];
  if (!imgs.length) return null;
  return size === 'sm' ? imgs[imgs.length - 1].url : imgs[0].url;
};

// Ejecuta una función async y devuelve {data, error, loading, reload}
export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...state, reload: () => setN((x) => x + 1) };
}

const paths = {
  home: 'M12 3 2 11h3v9h5v-6h4v6h5v-9h3z',
  search: 'M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z',
  library: 'M4 3h2v18H4zM9 3h2v18H9zm5.2.6 1.9-.6 5.6 17.6-1.9.6z',
  play: 'M7 4v16l13-8z',
  pause: 'M6 4h4v16H6zm8 0h4v16h-4z',
  next: 'M5 4v16l10-8zM17 4h2v16h-2z',
  prev: 'M19 4v16L9 12zM5 4h2v16H5z',
  shuffle:
    'M17 3l4 4-4 4V8h-2.6l-3 3.8-1.3-1.6L13.4 6H17zM3 6h4.6l9.8 12H17v-3l4 4-4 4v-3h-.6L6.6 8H3zm0 12h3.6l2.5-3.1 1.3 1.6L7.4 20H3z',
  repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z',
  heart:
    'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4 7 4c2.2 0 3.6 1.2 5 3 1.4-1.8 2.8-3 5-3 4 0 6.1 4.4 4.6 7.8C19.5 16.4 12 21 12 21z',
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z',
  queue: 'M3 5h13v2H3zm0 6h13v2H3zm0 6h8v2H3zm15-4 5 3.5-5 3.5z',
  devices: 'M3 4h14v10H3zm2 2v6h10V6zM1 16h18v2H1zm19-9h3v11h-3z',
  volume: 'M3 9h4l5-4v14l-5-4H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z',
  mute: 'M3 9h4l5-4v14l-5-4H3zm13.6.4 1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4 2.1-2.1z',
  trash: 'M6 7h12l-1 14H7zm3-4h6l1 2h4v2H4V5h4z',
  dots: 'M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  user: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z',
  edit: 'M3 17.2V21h3.8L18 9.8 14.2 6zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0L15.2 5 19 8.8z',
  close: 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z',
  up: 'M12 5l-7 7h4v7h6v-7h4z',
  down: 'M12 19l7-7h-4V5H9v7H5z',
  logout: 'M10 3H4v18h6v-2H6V5h4zm6 4-1.4 1.4 2.6 2.6H9v2h8.2l-2.6 2.6L16 17l5-5z',
  music: 'M9 3v10.6A4 4 0 1 0 11 17V7h8V3z',
};
export function Icon({ name, size = 20, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
      <path d={paths[name]} />
    </svg>
  );
}

export function Artists({ artists = [] }) {
  return (
    <span className="artists">
      {artists.map((a, i) => (
        <span key={a.id || a.name}>
          {i > 0 && ', '}
          {a.id ? (
            <a
              href={`#/artist/${a.id}`}
              onClick={(e) => e.stopPropagation()}
            >
              {a.name}
            </a>
          ) : (
            a.name
          )}
        </span>
      ))}
    </span>
  );
}

export function Cover({ src, round, size }) {
  return src ? (
    <img className={`cover ${round ? 'round' : ''}`} src={src} alt="" loading="lazy" style={size && { width: size, height: size }} />
  ) : (
    <div className={`cover placeholder ${round ? 'round' : ''}`} style={size && { width: size, height: size }}>
      <Icon name="music" size={28} />
    </div>
  );
}

/** Tarjeta para álbum / artista / playlist / podcast */
export function Card({ item, sub }) {
  const { actions } = useApp();
  if (!item) return null;
  const type = item.type;
  const route = { album: 'album', artist: 'artist', playlist: 'playlist', show: 'show' }[type];
  const subtitle =
    sub ??
    (type === 'album'
      ? `${(item.release_date || '').slice(0, 4)} · ${item.artists?.map((a) => a.name).join(', ')}`
      : type === 'artist'
        ? 'Artista'
        : type === 'playlist'
          ? `De ${item.owner?.display_name || 'Spotify'}`
          : type === 'show'
            ? 'Podcast'
            : '');
  return (
    <div className="card" onClick={() => route && go(route, item.id)}>
      <div className="card-img">
        <Cover src={imgOf(item)} round={type === 'artist'} />
        <button
          className="fab"
          title="Reproducir"
          onClick={(e) => {
            e.stopPropagation();
            actions.playContext(item.uri);
          }}
        >
          <Icon name="play" size={22} />
        </button>
      </div>
      <div className="card-title">{item.name}</div>
      <div className="card-sub">{subtitle}</div>
    </div>
  );
}

export function Shelf({ title, items, action, sub }) {
  if (!items?.length) return null;
  return (
    <section className="shelf">
      <div className="shelf-head">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="grid">
        {items.filter(Boolean).map((it, i) => (
          <Card key={(it.id || '') + i} item={it} sub={sub?.(it)} />
        ))}
      </div>
    </section>
  );
}

export function Loading() {
  return (
    <div className="loading">
      <span />
      <span />
      <span />
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="error-box">
      <p>{error?.message || 'Algo ha ido mal'}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
