import { useState } from 'react';
import TrackList from '../components/TrackList.jsx';
import { Card, ErrorBox, Icon, Loading, Shelf, useAsync } from '../components/ui.jsx';
import { useSettings } from '../settings.js';
import { sp } from '../spotify.js';
import { useApp } from '../store.jsx';

const RANGES = [
  ['short_term', 'Últimas 4 semanas'],
  ['medium_term', 'Últimos 6 meses'],
  ['long_term', 'Último año'],
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
  const [settings] = useSettings();
  const [range, setRange] = useState('short_term');
  const h = new Date().getHours();
  const greet = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';

  // Secciones visibles en el orden elegido en Ajustes (lo oculto ni siquiera se pide a Spotify)
  const sections = settings.homeOrder.filter((k) => !settings.homeHidden.includes(k));
  const wantsRecent = sections.includes('recent');
  const wantsTop = sections.includes('topTracks') || sections.includes('topArtists');
  const recent = useAsync(() => (wantsRecent ? sp.recentlyPlayed() : Promise.resolve(null)), [wantsRecent], wantsRecent ? 'home:recent' : null);
  const top = useAsync(
    () => (wantsTop ? Promise.all([sp.top('tracks', range, 10), sp.top('artists', range, 12)]) : Promise.resolve(null)),
    [range, wantsTop],
    wantsTop ? `home:top:${range}` : null
  );
  // El selector de periodo va en la primera de las dos secciones de tu top que se vea
  const firstTop = sections.find((k) => k === 'topTracks' || k === 'topArtists');

  // Álbumes únicos de lo escuchado recientemente
  const recentAlbums = [];
  const seen = new Set();
  recent.data?.items?.forEach(({ track }) => {
    if (track?.album && !seen.has(track.album.id)) {
      seen.add(track.album.id);
      recentAlbums.push(track.album);
    }
  });

  const topBlock = (k, render) => (
    <section className="shelf" key={k}>
      <div className="shelf-head">
        <h2>{k === 'topTracks' ? 'Tus canciones más escuchadas' : 'Tus artistas más escuchados'}</h2>
        {firstTop === k && <RangePicker value={range} onChange={setRange} />}
      </div>
      {top.loading ? <Loading /> : top.error ? <ErrorBox error={top.error} onRetry={top.reload} /> : top.data && render(top.data)}
    </section>
  );

  const render = {
    quick: () => (
      <div className="quick" key="quick">
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
    ),
    recent: () =>
      recent.loading ? (
        <Loading key="recent" />
      ) : recent.error ? (
        <ErrorBox key="recent" error={recent.error} onRetry={recent.reload} />
      ) : (
        <Shelf key="recent" title="Escuchado recientemente" items={recentAlbums.slice(0, 12)} large />
      ),
    topTracks: () => topBlock('topTracks', (d) => <TrackList tracks={d[0].items} />),
    topArtists: () =>
      topBlock('topArtists', (d) => (
        <div className="rail">
          {d[1].items.map((a) => (
            <Card key={a.id} item={a} />
          ))}
        </div>
      )),
    playlists: () => <Shelf key="playlists" title="Tus playlists" items={playlists.slice(0, 12)} />,
  };

  return (
    <div className="page">
      <div className="home-head">
        <h1 className="greet">
          {greet}
          {user?.display_name ? `, ${user.display_name}` : ''}
        </h1>
        <a className="btn home-edit" href="#/ajustes/inicio" title="Elegir y ordenar las secciones de esta página">
          <Icon name="edit" size={16} /> Personalizar
        </a>
      </div>
      {sections.map((k) => render[k]?.())}
      {!sections.length && (
        <div className="empty">
          <p>Has ocultado todas las secciones del inicio.</p>
          <a className="btn" href="#/ajustes/inicio">
            Elegir secciones
          </a>
        </div>
      )}
    </div>
  );
}
