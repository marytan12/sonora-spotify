import { useEffect, useRef, useState } from 'react';
import TrackList from '../components/TrackList.jsx';
import { Card, ErrorBox, Icon, Loading } from '../components/ui.jsx';
import { sp } from '../spotify.js';
import { go, replaceHash, useApp } from '../store.jsx';

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

// ---------- Recientes (en este navegador) ----------
const Q_KEY = 'sonora_recent_searches';
const OPEN_KEY = 'sonora_recent_opened';
const readList = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const writeList = (key, list) => {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* sin almacenamiento */
  }
};
/** Solo lo necesario para pintar la tarjeta otra vez */
const slim = (it) => ({
  id: it.id,
  type: it.type,
  uri: it.uri,
  name: it.name,
  images: (it.images || []).slice(-2),
  artists: it.artists?.map((a) => ({ id: a.id, name: a.name })),
  owner: it.owner && { display_name: it.owner.display_name },
  publisher: it.publisher,
});

// Resultados ya vistos: volver a escribir lo mismo los muestra al instante
const resultCache = new Map();

export default function Search() {
  const { route } = useApp();
  const [q, setQ] = useState(route.id || '');
  const [type, setType] = useState(route.extra || 'all');
  const [res, setRes] = useState(() => resultCache.get(`${route.extra || 'all'}:${(route.id || '').trim()}`) || null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [recentQ, setRecentQ] = useState(() => readList(Q_KEY));
  const [recentOpen, setRecentOpen] = useState(() => readList(OPEN_KEY));
  const reqRef = useRef(0);
  // Búsqueda a la que pertenecen los resultados que se ven ({ text, type }): «Cargar más» siempre
  // continúa esa, aunque mientras tanto se esté escribiendo otra
  const [shown, setShown] = useState(() => (res ? { text: (route.id || '').trim(), type: route.extra || 'all' } : null));
  const shownRef = useRef(shown);
  shownRef.current = shown;

  const saveQuery = (text = q) => {
    const t = text.trim();
    if (!t) return;
    const next = [t, ...recentQ.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8);
    setRecentQ(next);
    writeList(Q_KEY, next);
  };
  const removeQuery = (t) => {
    const next = recentQ.filter((x) => x !== t);
    setRecentQ(next);
    writeList(Q_KEY, next);
  };
  const opened = (it) => {
    saveQuery();
    const next = [slim(it), ...recentOpen.filter((x) => x.id !== it.id)].slice(0, 12);
    setRecentOpen(next);
    writeList(OPEN_KEY, next);
  };
  const clearAll = () => {
    setRecentQ([]);
    setRecentOpen([]);
    writeList(Q_KEY, []);
    writeList(OPEN_KEY, []);
  };

  // Búsqueda mientras escribes: espera corta, sin borrar lo anterior mientras llega lo nuevo y
  // sin que una respuesta antigua (más lenta) pise a la más reciente
  useEffect(() => {
    const text = q.trim();
    if (!text) {
      // Una respuesta que aún estuviera en camino ya no vale (ni para los resultados ni para la dirección)
      ++reqRef.current;
      setRes(null);
      setShown(null);
      setLoading(false);
      if (window.location.hash.startsWith('#/search/')) replaceHash('#/search');
      return;
    }
    const key = `${type}:${text}`;
    const hit = resultCache.get(key);
    if (hit) {
      setRes(hit);
      setShown({ text, type });
    }
    const id = ++reqRef.current;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await sp.search(text, type === 'all' ? ALL : [type], 0);
        if (id !== reqRef.current) return;
        resultCache.set(key, r);
        if (resultCache.size > 40) resultCache.delete(resultCache.keys().next().value);
        setRes(r);
        setShown({ text, type });
        setOffset(0);
        replaceHash(`#/search/${encodeURIComponent(text)}${type !== 'all' ? '/' + type : ''}`);
      } catch (e) {
        if (id === reqRef.current) setError(e);
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    }, hit ? 0 : 220);
    return () => clearTimeout(t);
  }, [q, type]);

  // Cargar más (la API limita a 10 resultados por página)
  const more = async () => {
    const from = shownRef.current;
    if (!from || from.type === 'all') return;
    const next = offset + 10;
    try {
      const r = await sp.search(from.text, [from.type], next);
      // Si entretanto se ve otra búsqueda, esta página ya no le corresponde
      if (shownRef.current !== from) return;
      const key = from.type + 's';
      setRes((old) => ({ ...old, [key]: { ...r[key], items: [...old[key].items, ...r[key].items] } }));
      setOffset(next);
    } catch (e) {
      if (shownRef.current === from) setError(e);
    }
  };

  const list = (k) => res?.[k + 's']?.items?.filter(Boolean) || [];
  // Solo con los resultados de la búsqueda actual a la vista y sin otra en camino
  const hasMore = !loading && shown?.type === type && shown.text === q.trim() && type !== 'all' && res?.[type + 's']?.next;

  return (
    <div className="page">
      <div className={`search-bar ${loading ? 'is-loading' : ''}`}>
        <Icon name="search" />
        <input
          autoFocus
          placeholder="¿Qué quieres escuchar?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && saveQuery()}
          aria-label="Buscar"
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

      {!q.trim() &&
        (recentQ.length || recentOpen.length ? (
          <div className="recents">
            {recentQ.length > 0 && (
              <section className="shelf">
                <div className="shelf-head">
                  <h2>Búsquedas recientes</h2>
                  <button className="btn" onClick={clearAll}>
                    Borrar todo
                  </button>
                </div>
                <div className="recent-queries">
                  {recentQ.map((t) => (
                    <span key={t} className="recent-q">
                      <button type="button" onClick={() => setQ(t)}>
                        <Icon name="search" size={14} /> {t}
                      </button>
                      <button type="button" className="recent-x" onClick={() => removeQuery(t)} aria-label={`Quitar «${t}»`}>
                        <Icon name="close" size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </section>
            )}
            {recentOpen.length > 0 && (
              <section className="shelf">
                <div className="shelf-head">
                  <h2>Abiertos recientemente</h2>
                  {!recentQ.length && (
                    <button className="btn" onClick={clearAll}>
                      Borrar todo
                    </button>
                  )}
                </div>
                <div className="rail">
                  {recentOpen.map((it) => (
                    <Card key={it.id} item={it} onOpen={opened} />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="empty">
            <Icon name="search" size={48} />
            <p>Busca canciones, artistas, álbumes, playlists y podcasts.</p>
            <p className="muted small">
              Consejo: usa filtros como <code>artist:Rosalía</code>, <code>year:2020</code> o <code>genre:rock</code>.
            </p>
          </div>
        ))}
      {loading && !res && <Loading />}
      {error && <ErrorBox error={error} />}

      {res && q.trim() && (
        // Al pulsar cualquier resultado, la búsqueda se guarda en «Búsquedas recientes»
        <div className={`search-results ${loading ? 'is-stale' : ''}`} onClickCapture={() => saveQuery()}>
          {type === 'all' && list('artist')[0] && list('track').length > 0 && (
            <div className="top-result">
              <div className="top-card" onClick={() => go('artist', list('artist')[0].id)}>
                <h2>Mejor resultado</h2>
                <Card item={list('artist')[0]} onOpen={opened} />
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
                  <div className={type === 'all' ? 'rail' : 'grid'}>
                    {list(k).map((it) => (
                      <Card key={it.id} item={it} onOpen={opened} />
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
        </div>
      )}
    </div>
  );
}
