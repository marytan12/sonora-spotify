import { useEffect, useState } from 'react';
import TrackList from '../components/TrackList.jsx';
import { Card, ErrorBox, Icon, Loading } from '../components/ui.jsx';
import { sp } from '../spotify.js';
import { go, useApp } from '../store.jsx';

const TYPES = [
  ['all', 'Todo'],
  ['track', 'Canciones'],
  ['artist', 'Artistas'],
  ['album', 'Álbumes'],
  ['playlist', 'Playlists'],
  ['show', 'Podcasts'],
  ['episode', 'Episodios'],
];
const ALL = ['track', 'artist', 'album', 'playlist', 'show', 'episode'];

export default function Search() {
  const { route } = useApp();
  const [q, setQ] = useState(route.id || '');
  const [type, setType] = useState(route.extra || 'all');
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);

  // Búsqueda con debounce
  useEffect(() => {
    if (!q.trim()) {
      setRes(null);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await sp.search(q, type === 'all' ? ALL : [type], 0);
        setRes(r);
        setOffset(0);
        window.history.replaceState(null, '', `#/search/${encodeURIComponent(q)}${type !== 'all' ? '/' + type : ''}`);
      } catch (e) {
        setError(e);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, type]);

  // Cargar más (la API limita a 10 resultados por página)
  const more = async () => {
    const next = offset + 10;
    try {
      const r = await sp.search(q, [type], next);
      const key = type + 's';
      setRes((old) => ({ ...old, [key]: { ...r[key], items: [...old[key].items, ...r[key].items] } }));
      setOffset(next);
    } catch (e) {
      setError(e);
    }
  };

  const list = (k) => res?.[k + 's']?.items?.filter(Boolean) || [];
  const hasMore = type !== 'all' && res?.[type + 's']?.next;

  return (
    <div className="page">
      <div className="search-bar">
        <Icon name="search" />
        <input
          autoFocus
          placeholder="¿Qué quieres escuchar?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button className="icon-btn" onClick={() => setQ('')} aria-label="Borrar">
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      <div className="chips">
        {TYPES.map(([v, l]) => (
          <button key={v} className={`chip ${type === v ? 'on' : ''}`} onClick={() => setType(v)}>
            {l}
          </button>
        ))}
      </div>

      {!q && (
        <div className="empty">
          <Icon name="search" size={48} />
          <p>Busca canciones, artistas, álbumes, playlists y podcasts.</p>
          <p className="muted small">Consejo: usa filtros como <code>artist:Rosalía</code>, <code>year:2020</code> o <code>genre:rock</code>.</p>
        </div>
      )}
      {loading && <Loading />}
      {error && <ErrorBox error={error} />}

      {res && !loading && (
        <>
          {type === 'all' && list('artist')[0] && list('track').length > 0 && (
            <div className="top-result">
              <div className="top-card" onClick={() => go('artist', list('artist')[0].id)}>
                <h2>Mejor resultado</h2>
                <Card item={list('artist')[0]} />
              </div>
              <div className="grow">
                <h2>Canciones</h2>
                <TrackList tracks={list('track').slice(0, 5)} showAlbum={false} numbered={false} />
              </div>
            </div>
          )}
          {type === 'track' && <TrackList tracks={list('track')} />}
          {type === 'episode' && <TrackList tracks={list('episode')} />}
          {['artist', 'album', 'playlist', 'show'].map(
            (k) =>
              (type === 'all' || type === k) &&
              list(k).length > 0 && (
                <section className="shelf" key={k}>
                  <h2>{TYPES.find((t) => t[0] === k)[1]}</h2>
                  <div className="grid">
                    {list(k).map((it) => (
                      <Card key={it.id} item={it} />
                    ))}
                  </div>
                </section>
              )
          )}
          {type === 'all' && list('episode').length > 0 && (
            <section className="shelf">
              <h2>Episodios</h2>
              <TrackList tracks={list('episode')} numbered={false} />
            </section>
          )}
          {hasMore && (
            <button className="btn center" onClick={more}>
              Cargar más
            </button>
          )}
        </>
      )}
    </div>
  );
}
