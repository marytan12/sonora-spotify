import { useState } from 'react';
import { sp } from '../spotify.js';
import { go, useApp } from '../store.jsx';
import { Cover, Icon, Modal, imgOf } from './ui.jsx';

export default function Sidebar() {
  const { route, playlists, user } = useApp();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');
  const nav = [
    ['home', 'Inicio', 'home'],
    ['search', 'Buscar', 'search'],
    ['library', 'Tu biblioteca', 'library'],
  ];
  const shown = playlists.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <nav className="sidebar">
      <div className="box">
        <a className="brand" href="#/home">
          <img src="/favicon.svg" alt="" width="28" height="28" /> Sonora
        </a>
        {nav.map(([name, label, icon]) => (
          <a key={name} href={`#/${name}`} className={`nav-link ${route.name === name ? 'active' : ''}`}>
            <Icon name={icon} size={22} /> <span>{label}</span>
          </a>
        ))}
      </div>
      <div className="box grow">
        <div className="pl-head">
          <span>Playlists</span>
          <button className="icon-btn" title="Crear playlist" onClick={() => setCreating(true)}>
            <Icon name="plus" />
          </button>
        </div>
        <input className="input small-input" placeholder="Filtrar playlists" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <a href="#/liked" className={`pl-item ${route.name === 'liked' ? 'active' : ''}`}>
          <div className="liked-cover">
            <Icon name="heart" size={16} />
          </div>
          <span>
            Canciones que te gustan
            <small>Playlist</small>
          </span>
        </a>
        <div className="pl-list">
          {shown.map((p) => (
            <a key={p.id} href={`#/playlist/${p.id}`} className={`pl-item ${route.id === p.id ? 'active' : ''}`}>
              <Cover src={imgOf(p, 'sm')} size={40} />
              <span>
                {p.name}
                <small>{p.owner?.id === user?.id ? 'Tuya' : p.owner?.display_name}</small>
              </span>
            </a>
          ))}
        </div>
      </div>
      {creating && <CreatePlaylistModal onClose={() => setCreating(false)} />}
    </nav>
  );
}

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
