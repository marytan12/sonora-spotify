import { useEffect, useRef, useState } from 'react';
import { useArtColor } from './art.js';
import { useGlassHighlight, useLiquidGlass } from './glass.js';
import PlayerBar from './components/PlayerBar.jsx';
import { AddToPlaylistModal, CreatePlaylistModal } from './components/Sidebar.jsx';
import { Cover, Icon, imgOf } from './components/ui.jsx';
import { REDIRECT_URI, handleCallback, isLoggedIn, login } from './spotify.js';
import { AppProvider, useApp } from './store.jsx';
import { Album, Artist, Playlist, Show } from './views/Collection.jsx';
import Home from './views/Home.jsx';
import Library, { Liked } from './views/Library.jsx';
import Profile from './views/Profile.jsx';
import Search from './views/Search.jsx';
import Summary from './views/Summary.jsx';

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
      <div className="login-art" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} style={{ '--i': i }} />
        ))}
      </div>
      <div className="login-card">
        <Logo size={56} />
        <h1>Sonora</h1>
        <p>Tu música de Spotify con las portadas en primer plano: escucha, organiza tus playlists, sigue la letra y mira los Canvas.</p>
        <button className="btn primary big" onClick={login}>
          Conectar con Spotify
        </button>
        {error && <p className="warn">{error}</p>}
        <p className="fine">
          Inicio de sesión seguro con PKCE, sin contraseñas ni secretos guardados. Dirección de vuelta: <code>{REDIRECT_URI}</code>
        </p>
      </div>
    </div>
  );
}

export function Logo({ size = 28 }) {
  return <img className="logo" src="/favicon.svg" width={size} height={size} alt="" />;
}

const VIEWS = { home: Home, search: Search, library: Library, liked: Liked, playlist: Playlist, album: Album, artist: Artist, show: Show, profile: Profile, resumen: Summary };
const NAV = [
  ['home', 'Escuchar', 'home'],
  ['search', 'Buscar', 'search'],
  ['library', 'Biblioteca', 'library'],
  ['resumen', 'Resumen', 'sparkles'],
];

/** true al bajar por la página (más de 80 px) y false al volver a subir, como la barra de iOS */
function useCompactOnScroll() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 6) return;
      setCompact(y > 80 && y > lastY);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return compact;
}

function Shell() {
  const { route, user, playback } = useApp();
  const navRef = useRef(null);
  const mobileRef = useRef(null);
  const compact = useCompactOnScroll();
  useLiquidGlass(navRef);
  useLiquidGlass(mobileRef);
  useGlassHighlight();
  // Al cambiar de sección, la barra vuelve a su tamaño normal
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.name]);
  const [creating, setCreating] = useState(false);
  const View = VIEWS[route.name] || Home;
  const art = imgOf(playback?.item?.album || playback?.item, 'sm');
  const ambient = useArtColor(art);
  const active = route.name === 'liked' ? 'library' : route.name;

  return (
    <div className="app" style={{ '--ambient': ambient || '110 90 170' }}>
      <div className="ambient" aria-hidden="true" />
      <header ref={navRef} className={`topnav glass lg-track ${compact ? 'compact' : ''}`}>
        <a className="brand" href="#/home" aria-label="Sonora, inicio">
          <Logo /> <span>Sonora</span>
        </a>
        <nav className="tabs" aria-label="Secciones">
          {NAV.map(([name, label, icon]) => (
            <a key={name} href={`#/${name}`} className={active === name ? 'on' : ''} aria-current={active === name ? 'page' : undefined} aria-label={label} title={label}>
              <Icon name={icon} size={18} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="nav-right">
          <button className="icon-btn round" title="Nueva playlist" onClick={() => setCreating(true)}>
            <Icon name="plus" size={20} />
          </button>
          <a href="#/profile" className="user-chip" title="Tu perfil" aria-label="Tu perfil">
            {user && imgOf(user) ? <Cover src={imgOf(user, 'sm')} round size={30} /> : <Icon name="user" />}
          </a>
        </div>
      </header>
      <main className="main">
        <View key={route.name + (route.id || '')} />
      </main>
      <PlayerBar />
      <nav ref={mobileRef} className="mobile-nav glass lg-track" aria-label="Secciones">
        {NAV.map(([name, label, icon]) => (
          <a key={name} href={`#/${name}`} className={active === name ? 'on' : ''}>
            <Icon name={icon} /> {label}
          </a>
        ))}
      </nav>
      <AddToPlaylistModal />
      {creating && <CreatePlaylistModal onClose={() => setCreating(false)} />}
    </div>
  );
}
