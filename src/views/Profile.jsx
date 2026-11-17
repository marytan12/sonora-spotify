import { useState } from 'react';
import TrackList from '../components/TrackList.jsx';
import { ErrorBox, Icon, Loading, Shelf, imgOf, useAsync } from '../components/ui.jsx';
import { logout, sp } from '../spotify.js';
import { useApp } from '../store.jsx';
import { RangePicker } from './Home.jsx';
import { Header } from './Library.jsx';

export default function Profile() {
  const { user, playlists } = useApp();
  const [range, setRange] = useState('medium_term');
  const top = useAsync(() => Promise.all([sp.top('tracks', range, 50), sp.top('artists', range, 30)]), [range]);
  const recent = useAsync(() => sp.recentlyPlayed(), []);

  // Géneros favoritos calculados a partir de tus artistas top
  const genres = {};
  top.data?.[1].items.forEach((a, i) => a.genres?.forEach((g) => (genres[g] = (genres[g] || 0) + (30 - i))));
  const topGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const max = topGenres[0]?.[1] || 1;

  if (!user) return <Loading />;
  const mine = playlists.filter((p) => p.owner?.id === user.id);
  return (
    <div className="page">
      <Header img={imgOf(user)} round kind="Perfil" title={user.display_name || user.id} meta={`${mine.length} playlists propias`} />
      <div className="actions-row">
        {user.external_urls?.spotify && (
          <a className="btn outline" href={user.external_urls.spotify} target="_blank" rel="noreferrer">
            Abrir en Spotify
          </a>
        )}
        <button className="btn outline" onClick={logout}>
          <Icon name="logout" size={16} /> Cerrar sesión
        </button>
      </div>

      <section className="shelf">
        <div className="shelf-head">
          <h2>Estadísticas</h2>
          <RangePicker value={range} onChange={setRange} />
        </div>
        {top.loading ? (
          <Loading />
        ) : top.error ? (
          <ErrorBox error={top.error} onRetry={top.reload} />
        ) : (
          <>
            {topGenres.length > 0 && (
              <div className="genres">
                <h3>Tus géneros</h3>
                {topGenres.map(([g, v]) => (
                  <div key={g} className="genre-row">
                    <span>{g}</span>
                    <div className="bar">
                      <div style={{ width: `${(v / max) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Shelf title="Artistas top" items={top.data[1].items} sub={(_, i) => 'Artista'} />
            <h2>Canciones top</h2>
            <TrackList tracks={top.data[0].items} />
          </>
        )}
      </section>

      <section className="shelf">
        <h2>Escuchado recientemente</h2>
        {recent.loading ? <Loading /> : recent.error ? <ErrorBox error={recent.error} /> : (
          <TrackList tracks={recent.data.items.map((x) => x.track)} />
        )}
      </section>

      <Shelf title="Tus playlists públicas" items={mine.filter((p) => p.public)} />
    </div>
  );
}
