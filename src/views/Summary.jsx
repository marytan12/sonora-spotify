import { useEffect, useMemo, useState } from 'react';
import { useArtColor } from '../art.js';
import { Cover, ErrorBox, Icon, Loading, Modal, imgOf, useAsync } from '../components/ui.jsx';
import { sp } from '../spotify.js';
import { go, useApp } from '../store.jsx';
import { RANGES, analyze, renderCard, tagline } from '../summary.js';

export default function Summary() {
  const { user, actions } = useApp();
  const [range, setRange] = useState('short_term');
  const data = useAsync(
    () =>
      Promise.all([
        sp.top('tracks', range, 50),
        sp.top('artists', range, 50),
        sp.recentlyPlayed().catch(() => ({ items: [] })),
      ]),
    [range]
  );
  const s = useMemo(
    () => (data.data ? analyze(data.data[0]?.items, data.data[1]?.items, data.data[2]?.items) : null),
    [data.data]
  );
  const heroImg = imgOf(s?.topArtist);
  const color = useArtColor(heroImg);
  const [sharing, setSharing] = useState(false);
  const period = RANGES.find(([v]) => v === range);

  return (
    <div className="page summary" style={{ '--art': color || '110 90 170' }}>
      <header className="sum-hero">
        <div className="sum-hero-bg" aria-hidden="true">
          {heroImg && <img src={heroImg} alt="" />}
        </div>
        <div className="sum-hero-text">
          <h1>Tu resumen</h1>
          <p>{s ? tagline(s) : 'Lo que más has escuchado, en una sola página.'}</p>
          <div className="chips" role="radiogroup" aria-label="Periodo">
            {RANGES.map(([v, l]) => (
              <button key={v} role="radio" aria-checked={range === v} className={`chip ${range === v ? 'on' : ''}`} onClick={() => setRange(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {s?.topArtist && (
          <button className="btn primary sum-share" onClick={() => setSharing(true)}>
            <Icon name="share" size={18} /> Compartir resumen
          </button>
        )}
      </header>

      {data.loading ? (
        <Loading />
      ) : data.error ? (
        <ErrorBox error={data.error} onRetry={data.reload} />
      ) : !s?.topArtist && !s?.topTrack ? (
        <div className="empty">
          <p>Aún no hay suficiente música escuchada en este periodo para hacer tu resumen.</p>
          <p className="muted small">Prueba con «Últimos 6 meses» o «Desde siempre».</p>
        </div>
      ) : (
        <div className="sum-grid">
          {s.topArtist && (
            <button className="sum-tile sum-artist glass" onClick={() => go('artist', s.topArtist.id)}>
              <Cover src={heroImg} round />
              <span className="sum-label">Tu artista nº 1</span>
              <strong className="sum-big">{s.topArtist.name}</strong>
            </button>
          )}

          {s.topTrack && (
            <div className="sum-tile sum-track glass">
              <button className="sum-track-art" onClick={() => actions.playUris([s.topTrack.uri])} title={`Reproducir ${s.topTrack.name}`}>
                <Cover src={imgOf(s.topTrack.album)} />
                <span className="fab-play">
                  <Icon name="play" size={22} />
                </span>
              </button>
              <span className="sum-label">Tu canción nº 1</span>
              <strong className="sum-big">{s.topTrack.name}</strong>
              <span className="muted">{s.topTrack.artists?.map((a) => a.name).join(', ')}</span>
            </div>
          )}

          <div className="sum-tile glass">
            <span className="sum-label">Top artistas</span>
            <ol className="sum-list">
              {s.artists.map((a, i) => (
                <li key={a.id}>
                  <button onClick={() => go('artist', a.id)}>
                    <span className="sum-n">{i + 1}</span>
                    <Cover src={imgOf(a)} round size={44} />
                    <span className="sum-name">{a.name}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="sum-tile glass">
            <span className="sum-label">Top canciones</span>
            <ol className="sum-list">
              {s.tracks.map((t, i) => (
                <li key={t.id}>
                  <button onClick={() => actions.playUris(s.tracks.map((x) => x.uri), i)} title={`Reproducir ${t.name}`}>
                    <span className="sum-n">{i + 1}</span>
                    <Cover src={imgOf(t.album)} size={44} />
                    <span className="sum-name">
                      {t.name}
                      <small>{t.artists?.map((a) => a.name).join(', ')}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          {s.decade && (
            <div className="sum-tile sum-stat glass">
              <span className="sum-label">Tu década</span>
              <strong className="sum-huge">{s.decade.label}</strong>
              <span className="muted">
                El {s.decade.share} % de tus canciones más escuchadas
                {s.oldest && s.newest && s.oldest !== s.newest ? `, que van de ${s.oldest} a ${s.newest}` : ''}.
              </span>
            </div>
          )}

          <div className="sum-tile sum-stat glass">
            <span className="sum-label">Variedad</span>
            <strong className="sum-huge">{s.distinct}</strong>
            <span className="muted">
              artistas distintos entre tus {s.count} canciones más escuchadas. {s.style}.
            </span>
          </div>

          {s.topMoment && (
            <div className="sum-tile sum-moments glass">
              <span className="sum-label">Cuándo escuchas</span>
              <strong className="sum-big">Sobre todo {s.topMoment.phrase}</strong>
              <div className="sum-bars" role="img" aria-label={s.moments.map((m) => `${m.key}: ${m.count}`).join(', ')}>
                {s.moments.map((m) => {
                  const max = Math.max(...s.moments.map((x) => x.count), 1);
                  return (
                    <div key={m.key} className={`sum-bar ${m === s.topMoment ? 'on' : ''}`}>
                      <div style={{ height: `${Math.max(6, (m.count / max) * 100)}%` }} />
                      <span>{m.key}</span>
                    </div>
                  );
                })}
              </div>
              <span className="muted small">Según tus últimas {s.moments.reduce((n, m) => n + m.count, 0)} escuchas.</span>
            </div>
          )}

          {s.onRepeat && (
            <div className="sum-tile sum-stat glass">
              <span className="sum-label">En bucle</span>
              <strong className="sum-big">{s.onRepeat.track.name}</strong>
              <span className="muted">
                {s.onRepeat.n} veces en tus últimas escuchas.
              </span>
            </div>
          )}

          {s.genres.length > 0 && (
            <div className="sum-tile glass">
              <span className="sum-label">Tus géneros</span>
              <div className="sum-genres">
                {s.genres.map((g) => (
                  <span key={g} className="chip">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="sum-tile sum-stat glass">
            <span className="sum-label">Tu top en minutos</span>
            <strong className="sum-huge">{s.minutes}</strong>
            <span className="muted">minutos dura tu top de canciones{s.explicit ? `; el ${s.explicit} % son explícitas` : ''}.</span>
          </div>
        </div>
      )}

      {sharing && s && <ShareModal s={s} period={period?.[2] || ''} color={color} name={user?.display_name} onClose={() => setSharing(false)} />}
    </div>
  );
}

function ShareModal({ s, period, color, name, onClose }) {
  const { toast } = useApp();
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    let objectUrl;
    renderCard(s, { period, color, name })
      .then((b) => {
        if (!alive) return;
        if (!b) throw new Error('No se ha podido crear la imagen.');
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      })
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [s, period, color, name]);

  const file = blob && new File([blob], 'sonora-resumen.png', { type: 'image/png' });
  const canShare = file && navigator.canShare?.({ files: [file] });
  const share = async () => {
    try {
      await navigator.share({ files: [file], title: 'Mi resumen en Sonora' });
    } catch (e) {
      if (e?.name !== 'AbortError') toast('No se ha podido compartir. Descarga la imagen y compártela tú.', 'error');
    }
  };

  return (
    <Modal title="Compartir tu resumen" onClose={onClose}>
      <div className="share-preview">{error ? <ErrorBox error={error} /> : url ? <img src={url} alt="Tarjeta de tu resumen" /> : <Loading />}</div>
      <div className="share-actions">
        {url && (
          <a className="btn primary" href={url} download="sonora-resumen.png">
            <Icon name="download" size={18} /> Descargar imagen
          </a>
        )}
        {canShare && (
          <button className="btn" onClick={share}>
            <Icon name="share" size={18} /> Compartir
          </button>
        )}
      </div>
    </Modal>
  );
}
