import { useEffect, useState } from 'react';
import TrackList from '../components/TrackList.jsx';
import { Card, ErrorBox, Icon, Loading, Modal, Shelf, fmt, imgOf, useAsync } from '../components/ui.jsx';
import { sp } from '../spotify.js';
import { go, useApp } from '../store.jsx';
import { Header, usePaged } from './Library.jsx';

const byOffset = (page) => page.offset + page.limit;

function SaveButton({ uri, labels = ['Guardar', 'Guardado'] }) {
  const { saved, checkSaved, toggleSaved } = useApp();
  useEffect(() => {
    if (uri) checkSaved([uri]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);
  const on = !!saved[uri];
  return (
    <button className={`btn outline ${on ? 'on' : ''}`} onClick={() => toggleSaved(uri)}>
      {on ? labels[1] : labels[0]}
    </button>
  );
}

function PlayBig({ uri }) {
  const { actions, playback } = useApp();
  const playingThis = playback?.context?.uri === uri && playback?.is_playing;
  return (
    <button className="play-big" onClick={() => (playingThis ? actions.toggle() : actions.playContext(uri))} title="Reproducir">
      <Icon name={playingThis ? 'pause' : 'play'} size={28} />
    </button>
  );
}

// ---------------- PLAYLIST ----------------
export function Playlist() {
  const { route, user, toast, fail, refreshPlaylists } = useApp();
  const id = route.id;
  const meta = useAsync(() => sp.playlist(id), [id]);
  const pl = meta.data;
  const canEdit = pl && (pl.owner?.id === user?.id || pl.collaborative);
  const hasItems = pl && (pl.items !== undefined || pl.tracks?.items !== undefined);
  const p = usePaged((o) => (hasItems ? sp.playlistItems(id, o || 0) : Promise.resolve({ items: [] })), [id, hasItems], byOffset);
  const [editing, setEditing] = useState(false);
  const tracks = p.items.map((x) => x.item || x.track);

  if (meta.loading) return <Loading />;
  if (meta.error) return <ErrorBox error={meta.error} onRetry={meta.reload} />;

  const total = pl.items?.total ?? pl.tracks?.total;
  const duration = tracks.reduce((s, t) => s + (t?.duration_ms || 0), 0);

  const remove = async (t) => {
    try {
      await sp.removeFromPlaylist(id, [t.uri]);
      toast('Quitado de la playlist');
      p.reload();
    } catch (e) {
      fail(e);
    }
  };
  const move = async (i, dir) => {
    try {
      await sp.reorderPlaylist(id, i, dir > 0 ? i + 2 : i - 1);
      p.reload();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="page">
      <Header
        img={imgOf(pl)}
        kind={`Playlist ${pl.public ? 'pública' : 'privada'}${pl.collaborative ? ' · colaborativa' : ''}`}
        title={pl.name}
        meta={
          <>
            <strong>{pl.owner?.display_name}</strong>
            {total !== undefined && ` · ${total} canciones`}
            {duration > 0 && ` · ${fmt(duration)}`}
          </>
        }
      >
        {pl.description && <p className="desc" dangerouslySetInnerHTML={{ __html: pl.description }} />}
      </Header>
      <div className="actions-row">
        <PlayBig uri={pl.uri} />
        {pl.owner?.id !== user?.id && <SaveButton uri={pl.uri} labels={['Seguir', 'Siguiendo']} />}
        {canEdit && (
          <button className="btn outline" onClick={() => setEditing(true)}>
            <Icon name="edit" size={16} /> Editar
          </button>
        )}
        {pl.owner?.id === user?.id && (
          <button
            className="btn outline danger"
            onClick={async () => {
              if (!confirm(`¿Eliminar "${pl.name}" de tu biblioteca?`)) return;
              try {
                await sp.libraryRemove([pl.uri]);
                await refreshPlaylists();
                toast('Playlist eliminada');
                go('library');
              } catch (e) {
                fail(e);
              }
            }}
          >
            <Icon name="trash" size={16} /> Eliminar
          </button>
        )}
      </div>
      {!hasItems ? (
        <div className="notice">
          Spotify solo permite ver las canciones de playlists propias o colaborativas en apps en modo
          desarrollo. Puedes reproducirla igualmente con el botón de play.
        </div>
      ) : (
        <>
          {p.error && <ErrorBox error={p.error} onRetry={p.reload} />}
          {tracks.length > 0 && (
            <TrackList tracks={tracks} contextUri={pl.uri} onRemove={canEdit ? remove : undefined} onMove={canEdit ? move : undefined} />
          )}
          {p.loading && <Loading />}
          {!p.loading && !tracks.length && !p.error && (
            <div className="empty">
              <p>Esta playlist está vacía.</p>
              <a className="btn" href="#/search">Buscar canciones</a>
            </div>
          )}
          {p.hasMore && !p.loading && <button className="btn center" onClick={p.more}>Cargar más</button>}
        </>
      )}
      {editing && <EditPlaylist pl={pl} onClose={() => setEditing(false)} onSaved={() => { meta.reload(); refreshPlaylists(); }} />}
    </div>
  );
}

function EditPlaylist({ pl, onClose, onSaved }) {
  const { toast, fail } = useApp();
  const [name, setName] = useState(pl.name);
  const [desc, setDesc] = useState(pl.description?.replace(/<[^>]+>/g, '') || '');
  const [pub, setPub] = useState(!!pl.public);
  const [collab, setCollab] = useState(!!pl.collaborative);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      // Una playlist colaborativa no puede ser pública
      await sp.updatePlaylist(pl.id, { name, description: desc, public: collab ? false : pub, collaborative: collab });
      if (file) await sp.uploadCover(pl.id, await toJpegBase64(file));
      toast('Playlist actualizada');
      onSaved();
      onClose();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Editar detalles" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label>
          Nombre
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Descripción
          <textarea className="input" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </label>
        <label>
          Portada (JPEG/PNG)
          <input className="input" type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} />
        </label>
        <label className="check">
          <input type="checkbox" checked={pub && !collab} disabled={collab} onChange={(e) => setPub(e.target.checked)} /> Pública
        </label>
        <label className="check">
          <input type="checkbox" checked={collab} onChange={(e) => setCollab(e.target.checked)} /> Colaborativa
        </label>
        <button className="btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  );
}

// Spotify exige JPEG en base64 de menos de 256 KB: reescalamos con canvas
function toJpegBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = Math.min(640, img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      let q = 0.9;
      let data;
      do {
        data = c.toDataURL('image/jpeg', q).split(',')[1];
        q -= 0.1;
      } while (data.length > 250_000 && q > 0.2);
      URL.revokeObjectURL(img.src);
      resolve(data);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ---------------- ÁLBUM ----------------
export function Album() {
  const { route, openAddToPlaylist } = useApp();
  const a = useAsync(() => sp.album(route.id), [route.id]);
  const [extra, setExtra] = useState([]);
  useEffect(() => setExtra([]), [route.id]);
  if (a.loading) return <Loading />;
  if (a.error) return <ErrorBox error={a.error} onRetry={a.reload} />;
  const al = a.data;
  const tracks = [...al.tracks.items, ...extra].map((t) => ({ ...t, album: al }));
  const dur = tracks.reduce((s, t) => s + t.duration_ms, 0);
  const more = al.tracks.total > tracks.length;
  return (
    <div className="page">
      <Header
        img={imgOf(al)}
        kind={al.album_type === 'single' ? 'Sencillo' : al.album_type === 'compilation' ? 'Recopilatorio' : 'Álbum'}
        title={al.name}
        meta={
          <>
            {al.artists.map((ar, i) => (
              <span key={ar.id}>
                {i > 0 && ', '}
                <a href={`#/artist/${ar.id}`}><strong>{ar.name}</strong></a>
              </span>
            ))}
            {` · ${al.release_date?.slice(0, 4)} · ${al.total_tracks} canciones · ${fmt(dur)}`}
          </>
        }
      />
      <div className="actions-row">
        <PlayBig uri={al.uri} />
        <SaveButton uri={al.uri} />
        <button className="btn outline" onClick={() => openAddToPlaylist(tracks.map((t) => t.uri))}>
          <Icon name="plus" size={16} /> Añadir todo a playlist
        </button>
      </div>
      <TrackList tracks={tracks} contextUri={al.uri} showAlbum={false} showCover={false} />
      {more && (
        <button className="btn center" onClick={async () => setExtra([...extra, ...(await sp.albumTracks(al.id, tracks.length)).items])}>
          Cargar más
        </button>
      )}
      {al.copyrights?.length > 0 && (
        <div className="copyright small muted">
          {al.copyrights.map((c) => (
            <div key={c.text}>{c.text}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- ARTISTA ----------------
export function Artist() {
  const { route } = useApp();
  const id = route.id;
  const a = useAsync(async () => {
    const artist = await sp.artist(id);
    const [albums, singles, appears, songs] = await Promise.all([
      sp.artistAlbums(id, 'album').catch(() => ({ items: [] })),
      sp.artistAlbums(id, 'single').catch(() => ({ items: [] })),
      sp.artistAlbums(id, 'appears_on,compilation').catch(() => ({ items: [] })),
      // "Top tracks" ya no existe en modo desarrollo: usamos búsqueda filtrada por artista
      sp.search(`artist:"${artist.name}"`, ['track']).catch(() => ({ tracks: { items: [] } })),
    ]);
    const popular = (songs.tracks?.items || []).filter((t) => t?.artists?.some((x) => x.id === id));
    return { artist, albums: albums.items, singles: singles.items, appears: appears.items, popular };
  }, [id]);

  if (a.loading) return <Loading />;
  if (a.error) return <ErrorBox error={a.error} onRetry={a.reload} />;
  const { artist, albums, singles, appears, popular } = a.data;
  return (
    <div className="page">
      <Header img={imgOf(artist)} round kind="Artista" title={artist.name} meta={artist.genres?.length ? artist.genres.slice(0, 4).join(' · ') : null} />
      <div className="actions-row">
        <PlayBig uri={artist.uri} />
        <SaveButton uri={artist.uri} labels={['Seguir', 'Siguiendo']} />
      </div>
      {popular.length > 0 && (
        <section className="shelf">
          <h2>Canciones</h2>
          <TrackList tracks={popular} />
        </section>
      )}
      <Shelf title="Álbumes" items={albums} sub={(x) => x.release_date?.slice(0, 4)} />
      <Shelf title="Sencillos y EP" items={singles} sub={(x) => x.release_date?.slice(0, 4)} />
      <Shelf title="Aparece en" items={appears} />
    </div>
  );
}

// ---------------- PODCAST ----------------
export function Show() {
  const { route } = useApp();
  const s = useAsync(() => sp.show(route.id), [route.id]);
  const p = usePaged((o) => sp.showEpisodes(route.id, o || 0), [route.id], byOffset);
  if (s.loading) return <Loading />;
  if (s.error) return <ErrorBox error={s.error} onRetry={s.reload} />;
  const show = s.data;
  return (
    <div className="page">
      <Header img={imgOf(show)} kind="Podcast" title={show.name} meta={`${show.total_episodes ?? ''} episodios`}>
        <p className="desc">{show.description}</p>
      </Header>
      <div className="actions-row">
        <PlayBig uri={show.uri} />
        <SaveButton uri={show.uri} labels={['Seguir', 'Siguiendo']} />
      </div>
      <TrackList tracks={p.items.map((e) => ({ ...e, show }))} contextUri={show.uri} showAlbum={false} />
      {p.loading && <Loading />}
      {p.hasMore && !p.loading && <button className="btn center" onClick={p.more}>Cargar más</button>}
    </div>
  );
}

export { Card };
