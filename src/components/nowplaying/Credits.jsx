import { useCredits } from '../../credits.js';
import { sp } from '../../spotify.js';
import { go } from '../../store.jsx';
import { Icon, Loading, fmt, useAsync } from '../ui.jsx';

// ======================= CRÉDITOS =======================
const fmtDate = (d) => {
  if (!d) return null;
  const [y, m, day] = d.split('-').map(Number);
  if (!m) return String(y);
  return new Date(y, m - 1, day || 1).toLocaleDateString('es-ES', day ? { day: 'numeric', month: 'long', year: 'numeric' } : { month: 'long', year: 'numeric' });
};

export default function Credits({ item }) {
  const isTrack = item?.type === 'track';
  const credits = useCredits(item);
  const albumId = isTrack ? item.album?.id : null;
  // Sello y copyright vienen del álbum (si la API los devuelve)
  const { data: albumFull } = useAsync(() => (albumId ? sp.album(albumId).catch(() => null) : Promise.resolve(null)), [albumId]);
  if (!item) return null;
  if (!isTrack) return <p className="lyrics-msg">Los créditos solo están disponibles para canciones.</p>;
  const album = { ...item.album, ...albumFull };
  const facts = [
    ['Álbum', album.name],
    ['Publicado', fmtDate(album.release_date)],
    ['Pista', item.track_number ? `${item.track_number}${album.total_tracks ? ` de ${album.total_tracks}` : ''}${item.disc_number > 1 ? ` (disco ${item.disc_number})` : ''}` : null],
    ['Duración', fmt(item.duration_ms)],
    ['Contenido explícito', item.explicit ? 'Sí' : null],
    ['Popularidad', Number.isFinite(item.popularity) ? `${item.popularity} / 100` : null],
    ['Sello', album.label],
    ['ISRC', item.external_ids?.isrc],
  ].filter(([, v]) => v);
  const copyright = album.copyrights?.find((c) => c.type === 'P') || album.copyrights?.[0];
  const mainArtist = item.artists?.find((a) => a.id);

  return (
    <div className="np-credits">
      <h3>Créditos</h3>
      <div className="credit-links">
        {album.id && (
          <button className="chip-btn" onClick={() => go('album', album.id)}>
            <Icon name="album" size={16} /> Ir al álbum
          </button>
        )}
        {mainArtist && (
          <button className="chip-btn" onClick={() => go('artist', mainArtist.id)}>
            <Icon name="artist" size={16} /> Ir a {mainArtist.name}
          </button>
        )}
      </div>

      <section>
        <h4>Artistas</h4>
        <ul className="credit-people">
          {item.artists?.map((a) => (
            <li key={a.id || a.name}>
              {a.id ? <button onClick={() => go('artist', a.id)}>{a.name}</button> : a.name}
            </li>
          ))}
        </ul>
      </section>

      {credits.status === 'loading' ? (
        <Loading />
      ) : credits.status === 'ok' && credits.roles.length ? (
        credits.roles.map((r) => (
          <section key={r.label}>
            <h4>{r.label}</h4>
            <ul className="credit-people">
              {r.people.map((p) => (
                <li key={p.id || p.name}>
                  {p.name}
                  {p.extra && <span className="muted"> · {p.extra}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="muted credit-none">
          {credits.status === 'error' ? 'No se han podido cargar los créditos ahora mismo.' : 'MusicBrainz aún no tiene compositores ni productores de esta canción.'}
        </p>
      )}

      <dl className="credit-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {copyright && <p className="muted credit-copy">{copyright.text}</p>}
      <p className="lyrics-src">
        Créditos de{' '}
        {credits.url ? (
          <a href={credits.url} target="_blank" rel="noreferrer">
            MusicBrainz
          </a>
        ) : (
          'MusicBrainz'
        )}{' '}
        y Spotify
      </p>
    </div>
  );
}
