import { useEffect, useState } from 'react';
import TrackList from '../components/TrackList.jsx';
import { Card, Cover, ErrorBox, Icon, Loading } from '../components/ui.jsx';
import { sp } from '../spotify.js';
import { useApp } from '../store.jsx';

/** Cabecera común para playlist / álbum / artista / podcast */
export function Header({ img, round, kind, title, children, meta }) {
  return (
    <header className="hero">
      <Cover src={img} round={round} size={200} />
      <div className="hero-text">
        <span className="small">{kind}</span>
        <h1 className={title?.length > 30 ? 'long' : ''}>{title}</h1>
        {children}
        {meta && <div className="meta">{meta}</div>}
      </div>
    </header>
  );
}

/** Carga una lista paginada con botón "Cargar más" */
export function usePaged(fetchPage, deps, getNextArg) {
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = async (arg, reset) => {
    setLoading(true);
    try {
      const page = await fetchPage(arg);
      setItems((old) => (reset ? page.items : [...old, ...page.items]));
      setNext(page.next ? getNextArg(page, arg) : null);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setItems([]);
    load(undefined, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
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
  const tab = route.id || 'playlists';
  return (
    <div className="page">
      <h1>Tu biblioteca</h1>
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
            <div className="card-sub">Playlist automática</div>
          </a>
          {playlists.map((p) => (
            <Card key={p.id} item={p} />
          ))}
        </div>
      )}
      {tab === 'artists' && <FollowedArtists />}
      {tab === 'albums' && <PagedGrid fetch={(o) => sp.savedAlbums(o)} map={(x) => x.album} />}
      {tab === 'shows' && <PagedGrid fetch={(o) => sp.savedShows(o)} map={(x) => x.show} />}
      {tab === 'episodes' && <SavedEpisodes />}
    </div>
  );
}

function PagedGrid({ fetch, map }) {
  const p = usePaged((o) => fetch(o || 0), [], byOffset);
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
    (page) => page.cursors?.after
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
  const p = usePaged((o) => sp.savedEpisodes(o || 0), [], byOffset);
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
  const p = usePaged((o) => sp.savedTracks(o || 0), [], byOffset);
  const tracks = p.items.map((x) => x.track);
  return (
    <div className="page">
      <header className="hero liked-hero">
        <div className="liked-cover huge">
          <Icon name="heart" size={72} />
        </div>
        <div className="hero-text">
          <span className="small">Playlist</span>
          <h1>Canciones que te gustan</h1>
          <div className="meta">{user?.display_name} · {p.items.length}{p.hasMore ? '+' : ''} canciones</div>
        </div>
      </header>
      <div className="actions-row">
        <button
          className="play-big"
          onClick={() => user && actions.playContext(`spotify:user:${user.id}:collection`)}
          title="Reproducir"
        >
          <Icon name="play" size={28} />
        </button>
      </div>
      {p.error && <ErrorBox error={p.error} onRetry={p.reload} />}
      {tracks.length > 0 && <TrackList tracks={tracks} contextUri={user && `spotify:user:${user.id}:collection`} />}
      {p.loading && <Loading />}
      {p.hasMore && !p.loading && <button className="btn center" onClick={p.more}>Cargar más</button>}
    </div>
  );
}
