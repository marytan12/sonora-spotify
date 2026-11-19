import { useEffect, useRef, useState } from 'react';
import { CreatePlaylistModal } from '../components/Sidebar.jsx';
import TrackList from '../components/TrackList.jsx';
import { Card, Cover, ErrorBox, Icon, Loading, cached, remember } from '../components/ui.jsx';
import { useArtColor } from '../art.js';
import { sp } from '../spotify.js';
import { useApp } from '../store.jsx';

/** Cabecera común: el arte manda. `banner` = foto de artista a todo lo ancho */
export function Header({ img, round, kind, title, children, meta, banner }) {
  const color = useArtColor(img);
  return (
    <header className={`hero ${banner ? 'banner' : ''}`} style={{ '--art': color || '110 90 170' }}>
      <div className="hero-bg" aria-hidden="true">
        {img && <img src={img} alt="" />}
      </div>
      {!banner && <Cover src={img} round={round} />}
      <div className="hero-text">
        <h1 className={title?.length > 28 ? 'long' : ''}>{title}</h1>
        {kind && <p className="kind">{kind}</p>}
        {meta && <div className="meta">{meta}</div>}
        {children}
      </div>
    </header>
  );
}

/** Carga una lista paginada con botón "Cargar más" */
const sig = (x) => x?.id || x?.uri || x?.item?.uri || x?.track?.uri || x?.album?.id || x?.show?.id || x?.episode?.id || '';

/**
 * Lista paginada. Con `key`, se guarda en la caché de páginas (con todas las páginas ya cargadas):
 * al volver se ve al momento y se comprueba por detrás que la primera página no ha cambiado.
 */
export function usePaged(fetchPage, deps, getNextArg, key) {
  const [items, setItems] = useState(() => cached(key)?.items ?? []);
  const [next, setNext] = useState(() => cached(key)?.next ?? null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(() => !cached(key));
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const load = async (arg, reset, quiet) => {
    if (!quiet) setLoading(true);
    try {
      const page = await fetchPage(arg);
      const nextArg = page.next ? getNextArg(page, arg) : null;
      const old = itemsRef.current;
      // Comprobación por detrás: si la primera página es la misma, se conserva todo lo cargado
      if (quiet && page.items.length <= old.length && page.items.every((x, i) => sig(x) === sig(old[i]))) return;
      const all = reset ? page.items : [...old, ...page.items];
      itemsRef.current = all;
      setItems(all);
      setNext(nextArg);
      remember(key, { items: all, next: nextArg });
      setError(null);
    } catch (e) {
      if (!quiet) setError(e);
    } finally {
      if (!quiet) setLoading(false);
    }
  };
  useEffect(() => {
    const c = cached(key);
    if (c) {
      itemsRef.current = c.items;
      setItems(c.items);
      setNext(c.next);
      setLoading(false);
      load(undefined, true, true);
    } else {
      itemsRef.current = [];
      setItems([]);
      load(undefined, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, key]);
  return { items, error, loading, hasMore: next !== null, more: () => load(next), reload: () => load(undefined, true) };
}
const byOffset = (page) => page.offset + page.limit;

const TABS = [
  ['playlists', 'Playlists'],
  ['artists', 'Artistas'],
  ['albums', 'Álbumes'],
  ['shows', 'Podcasts'],
  ['episodes', 'Episodios guardados'],
];

export default function Library() {
  const { route, playlists } = useApp();
  const [creating, setCreating] = useState(false);
  const tab = route.id || 'playlists';
  return (
    <div className="page">
      <div className="page-head">
        <h1>Biblioteca</h1>
        <button className="btn" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> Nueva playlist
        </button>
      </div>
      {creating && <CreatePlaylistModal onClose={() => setCreating(false)} />}
      <div className="chips">
        {TABS.map(([v, l]) => (
          <a key={v} href={`#/library/${v}`} className={`chip ${tab === v ? 'on' : ''}`}>
            {l}
          </a>
        ))}
      </div>
      {tab === 'playlists' && (
        <div className="grid">
          <a href="#/liked" className="card liked-card">
            <div className="liked-cover huge">
              <Icon name="heart" size={48} />
            </div>
            <div className="card-title">Canciones que te gustan</div>
            <div className="card-sub">Todo lo que has marcado</div>
          </a>
          {playlists.map((p) => (
            <Card key={p.id} item={p} />
          ))}
        </div>
      )}
      {tab === 'artists' && <FollowedArtists />}
      {tab === 'albums' && <PagedGrid fetch={(o) => sp.savedAlbums(o)} map={(x) => x.album} cacheKey="lib:albums" />}
      {tab === 'shows' && <PagedGrid fetch={(o) => sp.savedShows(o)} map={(x) => x.show} cacheKey="lib:shows" />}
      {tab === 'episodes' && <SavedEpisodes />}
    </div>
  );
}

function PagedGrid({ fetch, map, cacheKey }) {
  const p = usePaged((o) => fetch(o || 0), [], byOffset, cacheKey);
  return (
    <>
      {p.error && <ErrorBox error={p.error} onRetry={p.reload} />}
      <div className="grid">
        {p.items.map(map).filter(Boolean).map((it) => (
          <Card key={it.id} item={it} />
        ))}
      </div>
      {p.loading && <Loading />}
      {!p.loading && !p.items.length && !p.error && <p className="muted pad">Aún no tienes nada guardado aquí.</p>}
      {p.hasMore && !p.loading && <button className="btn center" onClick={p.more}>Cargar más</button>}
    </>
  );
}

function FollowedArtists() {
  const p = usePaged(
    async (after) => {
      const r = await sp.followedArtists(after);
      return r.artists;
    },
    [],
    (page) => page.cursors?.after,
    'lib:artists'
  );
  return (
    <>
      {p.error && <ErrorBox error={p.error} onRetry={p.reload} />}
      <div className="grid">
        {p.items.map((a) => (
          <Card key={a.id} item={a} />
        ))}
      </div>
      {p.loading && <Loading />}
      {!p.loading && !p.items.length && !p.error && <p className="muted pad">No sigues a ningún artista.</p>}
      {p.hasMore && !p.loading && <button className="btn center" onClick={p.more}>Cargar más</button>}
    </>
  );
}

function SavedEpisodes() {
  const p = usePaged((o) => sp.savedEpisodes(o || 0), [], byOffset, 'lib:episodes');
  return (
    <>
      {p.error && <ErrorBox error={p.error} onRetry={p.reload} />}
      {p.items.length > 0 && <TrackList tracks={p.items.map((x) => x.episode)} />}
      {p.loading && <Loading />}
      {p.hasMore && !p.loading && <button className="btn center" onClick={p.more}>Cargar más</button>}
    </>
  );
}

export function Liked() {
  const { user, actions } = useApp();
  const p = usePaged((o) => sp.savedTracks(o || 0), [], byOffset, 'liked');
  const tracks = p.items.map((x) => x.track);
  return (
    <div className="page">
      <header className="hero liked-hero" style={{ '--art': '255 92 138' }}>
        <div className="hero-bg" aria-hidden="true" />
        <div className="liked-cover huge">
          <Icon name="heart" size={72} />
        </div>
        <div className="hero-text">
          <h1>Canciones que te gustan</h1>
          <div className="meta">{p.items.length}{p.hasMore ? '+' : ''} canciones guardadas</div>
        </div>
      </header>
      <div className="actions-row">
        <button
          className="play-big"
          onClick={() => user && actions.playContext(`spotify:user:${user.id}:collection`)}
        >
          <Icon name="play" size={20} />
        </button>
      </div>
      {p.error && <ErrorBox error={p.error} onRetry={p.reload} />}
      {tracks.length > 0 && <TrackList tracks={tracks} contextUri={user && `spotify:user:${user.id}:collection`} />}
      {p.loading && <Loading />}
      {p.hasMore && !p.loading && <button className="btn center" onClick={p.more}>Cargar más</button>}
    </div>
  );
}
