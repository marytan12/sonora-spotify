import { useState } from 'react';
import TrackList from '../components/TrackList.jsx';
import { ErrorBox, Loading, Shelf, useAsync } from '../components/ui.jsx';
import { sp } from '../spotify.js';
import { useApp } from '../store.jsx';

const RANGES = [
  ['short_term', 'Últimas 4 semanas'],
  ['medium_term', 'Últimos 6 meses'],
  ['long_term', 'Todo el tiempo'],
];

export function RangePicker({ value, onChange }) {
  return (
    <div className="chips">
      {RANGES.map(([v, l]) => (
        <button key={v} className={`chip ${value === v ? 'on' : ''}`} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export default function Home() {
  const { user, playlists } = useApp();
  const [range, setRange] = useState('short_term');
  const h = new Date().getHours();
  const greet = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';

  const recent = useAsync(() => sp.recentlyPlayed(), []);
  const top = useAsync(
    () => Promise.all([sp.top('tracks', range, 10), sp.top('artists', range, 12)]),
    [range]
  );

  // Álbumes únicos de lo escuchado recientemente
  const recentAlbums = [];
  const seen = new Set();
  recent.data?.items?.forEach(({ track }) => {
    if (track?.album && !seen.has(track.album.id)) {
      seen.add(track.album.id);
      recentAlbums.push(track.album);
    }
  });

  return (
    <div className="page">
      <h1 className="greet">
        {greet}
        {user?.display_name ? `, ${user.display_name}` : ''}
      </h1>

      <div className="quick">
        <a href="#/liked" className="quick-item">
          <div className="liked-cover">♥</div>
          <span>Canciones que te gustan</span>
        </a>
        {playlists.slice(0, 7).map((p) => (
          <a key={p.id} href={`#/playlist/${p.id}`} className="quick-item">
            {p.images?.[0]?.url ? <img src={p.images[p.images.length - 1].url} alt="" /> : <div className="liked-cover">♪</div>}
            <span>{p.name}</span>
          </a>
        ))}
      </div>

      {recent.loading ? <Loading /> : recent.error ? <ErrorBox error={recent.error} onRetry={recent.reload} /> : (
        <Shelf title="Escuchado recientemente" items={recentAlbums.slice(0, 12)} large />
      )}

      <section className="shelf">
        <div className="shelf-head">
          <h2>Tu top</h2>
          <RangePicker value={range} onChange={setRange} />
        </div>
        {top.loading ? (
          <Loading />
        ) : top.error ? (
          <ErrorBox error={top.error} onRetry={top.reload} />
        ) : (
          <>
            <TrackList tracks={top.data[0].items} />
            <Shelf title="Tus artistas más escuchados" items={top.data[1].items} />
          </>
        )}
      </section>

      <Shelf title="Tus playlists" items={playlists.slice(0, 12)} />
    </div>
  );
}
