import { useState } from 'react';
import { sp } from '../spotify.js';
import { go, useApp } from '../store.jsx';
import { Cover, Icon, Modal, imgOf } from './ui.jsx';

export function CreatePlaylistModal({ onClose, initialUris }) {
  const { refreshPlaylists, toast, fail } = useApp();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [pub, setPub] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await sp.createPlaylist(name || 'Mi playlist', desc, pub);
      if (initialUris?.length) await sp.addToPlaylist(p.id, initialUris);
      await refreshPlaylists();
      toast('Playlist creada');
      onClose();
      go('playlist', p.id);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Crear playlist" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Nombre
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi playlist" />
        </label>
        <label>
          Descripción
          <textarea className="input" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
        </label>
        <label className="check">
          <input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} /> Pública
        </label>
        <button className="btn primary" disabled={busy}>
          {busy ? 'Creando…' : 'Crear'}
        </button>
      </form>
    </Modal>
  );
}

export function AddToPlaylistModal() {
  const { addTarget, openAddToPlaylist, playlists, user, toast, fail } = useApp();
  const [creating, setCreating] = useState(false);
  if (!addTarget) return null;
  const close = () => openAddToPlaylist(null);
  if (creating) return <CreatePlaylistModal initialUris={addTarget} onClose={() => { setCreating(false); close(); }} />;
  const mine = playlists.filter((p) => p.owner?.id === user?.id || p.collaborative);
  return (
    <Modal title="Añadir a playlist" onClose={close}>
      <button className="btn" onClick={() => setCreating(true)}>
        <Icon name="plus" size={16} /> Nueva playlist
      </button>
      <div className="modal-list">
        {mine.map((p) => (
          <button
            key={p.id}
            className="pl-item"
            onClick={async () => {
              try {
                await sp.addToPlaylist(p.id, addTarget);
                toast(`Añadido a ${p.name}`);
                close();
              } catch (e) {
                fail(e);
              }
            }}
          >
            <Cover src={imgOf(p, 'sm')} size={40} />
            <span>{p.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
