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

// Iconos: Ionicons (MIT, estilo iOS). Los SF Symbols de Apple no se pueden usar fuera de sus plataformas.
const files = import.meta.glob('/node_modules/ionicons/dist/svg/{home,search,library,play,pause,play-forward,play-back,shuffle,repeat,heart,heart-outline,add,list,laptop-outline,volume-high,volume-mute,trash-outline,ellipsis-horizontal,person,create-outline,close,chevron-up,chevron-down,log-out-outline,musical-notes,chatbubble-ellipses-outline,settings-outline,expand,image-outline,chevron-back,chevron-forward,mic-outline,information-circle-outline,disc-outline,person-outline,alert-circle-outline,contract,refresh-outline,checkmark,sparkles,share-outline,download-outline,logo-windows}.svg', { query: '?raw', import: 'default', eager: true });
const svgOf = (f) => files[`/node_modules/ionicons/dist/svg/${f}.svg`] || '';
const ICONS = {
  home: 'home', search: 'search', library: 'library', play: 'play', pause: 'pause',
  next: 'play-forward', prev: 'play-back', shuffle: 'shuffle', repeat: 'repeat',
  heart: 'heart', heartOutline: 'heart-outline', plus: 'add', queue: 'list', devices: 'laptop-outline',
  volume: 'volume-high', mute: 'volume-mute', trash: 'trash-outline', dots: 'ellipsis-horizontal',
  user: 'person', edit: 'create-outline', close: 'close', up: 'chevron-up', down: 'chevron-down',
  logout: 'log-out-outline', music: 'musical-notes', lyrics: 'chatbubble-ellipses-outline',
  settings: 'settings-outline', fullscreen: 'expand', image: 'image-outline',
  chevronDown: 'chevron-down', left: 'chevron-back', right: 'chevron-forward',
  mic: 'mic-outline', info: 'information-circle-outline', album: 'disc-outline', artist: 'person-outline',
  alert: 'alert-circle-outline', contract: 'contract', refresh: 'refresh-outline', check: 'checkmark',
  sparkles: 'sparkles', share: 'share-outline', download: 'download-outline', windows: 'logo-windows',
};
const cache = {};
export function Icon({ name, size = 20, className = '', ...rest }) {
  const file = ICONS[name] || name;
  const html = (cache[file] ??= svgOf(file).replace('<svg ', '<svg aria-hidden="true" focusable="false" '));
  return <span className={`icon ${className}`} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: html }} {...rest} />;
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
      ? item.artists?.map((a) => a.name).join(', ')
      : type === 'artist'
        ? 'Artista'
        : type === 'playlist'
          ? item.owner?.display_name || 'Playlist'
          : type === 'show'
            ? item.publisher || 'Podcast'
            : '');
  return (
    <div
      className={`card ${type === 'artist' ? 'is-artist' : ''}`}
      onClick={() => route && go(route, item.id)}
      onKeyDown={(e) => e.key === 'Enter' && route && go(route, item.id)}
      tabIndex={0}
      role="link"
    >
      <div className="card-img">
        <Cover src={imgOf(item)} round={type === 'artist'} />
        <button
          className="fab"
          title={`Reproducir ${item.name}`}
          onClick={(e) => {
            e.stopPropagation();
            actions.playContext(item.uri);
          }}
        >
          <Icon name="play" size={20} />
        </button>
      </div>
      <div className="card-title">{item.name}</div>
      {subtitle && <div className="card-sub">{subtitle}</div>}
    </div>
  );
}

/** Fila de arte. `row` = carrusel horizontal (estilo estantería), si no, rejilla */
export function Shelf({ title, items, action, sub, row = true, large }) {
  if (!items?.length) return null;
  return (
    <section className="shelf">
      <div className="shelf-head">
        <h2>{title}</h2>
        {action}
      </div>
      <div className={`${row ? 'rail' : 'grid'} ${large ? 'large' : ''}`}>
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
