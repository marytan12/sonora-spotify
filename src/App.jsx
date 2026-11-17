import { useEffect, useState } from 'react';
import PlayerBar from './components/PlayerBar.jsx';
import Sidebar, { AddToPlaylistModal } from './components/Sidebar.jsx';
import { Cover, Icon, imgOf } from './components/ui.jsx';
import { REDIRECT_URI, handleCallback, isLoggedIn, login } from './spotify.js';
import { AppProvider, useApp } from './store.jsx';
import { Album, Artist, Playlist, Show } from './views/Collection.jsx';
import Home from './views/Home.jsx';
import Library, { Liked } from './views/Library.jsx';
import Profile from './views/Profile.jsx';
import Search from './views/Search.jsx';

// El intercambio del código OAuth solo debe ocurrir una vez (StrictMode monta dos veces)
let callbackOnce;

export default function App() {
  const [status, setStatus] = useState('checking');
  const [error, setError] = useState(null);

  useEffect(() => {
    (callbackOnce ||= handleCallback())
      .then(() => setStatus(isLoggedIn() ? 'in' : 'out'))
      .catch((e) => {
        setError(e.message);
        setStatus('out');
      });
  }, []);

  if (status === 'checking') return <div className="splash" />;
  if (status === 'out') return <Login error={error} />;
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Login({ error }) {
  return (
    <div className="login">
      <div className="login-card">
        <img src="/favicon.svg" alt="" width="64" height="64" />
        <h1>Sonora</h1>
        <p>Tu música de Spotify, en una interfaz web completa: busca, reproduce, organiza tus playlists y descubre tus estadísticas.</p>
        <button className="btn primary big" onClick={login}>
          Iniciar sesión con Spotify
        </button>
        {error && <p className="warn">{error}</p>}
        <p className="small muted">
          Usa el flujo seguro PKCE: no se guarda ninguna contraseña ni secreto. Redirect URI: <code>{REDIRECT_URI}</code>
        </p>
      </div>
    </div>
  );
}

const VIEWS = { home: Home, search: Search, library: Library, liked: Liked, playlist: Playlist, album: Album, artist: Artist, show: Show, profile: Profile };

function Shell() {
  const { route, user } = useApp();
  const View = VIEWS[route.name] || Home;
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <div className="topbar">
          <div className="history">
            <button className="icon-btn round" onClick={() => history.back()} aria-label="Atrás">‹</button>
            <button className="icon-btn round" onClick={() => history.forward()} aria-label="Adelante">›</button>
          </div>
          <a href="#/profile" className="user-chip" title="Perfil">
            {user && imgOf(user) ? <Cover src={imgOf(user, 'sm')} round size={28} /> : <Icon name="user" />}
            <span className="hide-sm">{user?.display_name}</span>
          </a>
        </div>
        <View key={route.name + (route.id || '')} />
      </main>
      <PlayerBar />
      <nav className="mobile-nav">
        <a href="#/home" className={route.name === 'home' ? 'active' : ''}><Icon name="home" /> Inicio</a>
        <a href="#/search" className={route.name === 'search' ? 'active' : ''}><Icon name="search" /> Buscar</a>
        <a href="#/library" className={route.name === 'library' ? 'active' : ''}><Icon name="library" /> Biblioteca</a>
      </nav>
      <AddToPlaylistModal />
    </div>
  );
}
