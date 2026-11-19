import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useArtColor } from './art.js';
import { useGlassHighlight, useGlassWhileScrolling, useLiquidGlass } from './glass.js';
import PlayerBar from './components/PlayerBar.jsx';
import { AddToPlaylistModal, CreatePlaylistModal } from './components/Sidebar.jsx';
import { Cover, Icon, imgOf } from './components/ui.jsx';
import { hexRgb, useSettings } from './settings.js';
import { REDIRECT_URI, handleCallback, isLoggedIn, login } from './spotify.js';
import { restoreScroll } from './transitions.js';
import { AppProvider, useApp } from './store.jsx';
import AppSettings from './views/AppSettings.jsx';
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

const VIEWS = {
  home: Home,
  search: Search,
  library: Library,
  liked: Liked,
  playlist: Playlist,
  album: Album,
  artist: Artist,
  show: Show,
  profile: Profile,
  resumen: Summary,
  ajustes: AppSettings,
};
const NAV = [
  ['home', 'Escuchar', 'home'],
  ['search', 'Buscar', 'search'],
  ['library', 'Biblioteca', 'library'],
  ['resumen', 'Resumen', 'sparkles'],
];

/** true al bajar por la página (más de 80 px) y false al volver a subir, como la barra de iOS.
 *  `mode` (Ajustes): 'scroll' así, 'always' siempre compacta, 'never' nunca */
function useCompactOnScroll(mode) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (mode !== 'scroll') return setCompact(mode === 'always');
    setCompact(false);
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 6) return;
      setCompact(y > 80 && y > lastY);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [mode]);
  return compact;
}

function Shell() {
  const { route, user, playback } = useApp();
  const [settings] = useSettings();
  const navRef = useRef(null);
  const mobileRef = useRef(null);
  const compact = useCompactOnScroll(settings.nav);
  useLiquidGlass(navRef);
  useLiquidGlass(mobileRef);
  useGlassHighlight();
  useGlassWhileScrolling();
  // Al cambiar de página se empieza arriba; al volver atrás, donde se estaba (con la caché de
  // páginas el contenido ya está, así que el salto es inmediato)
  useLayoutEffect(() => {
    restoreScroll(route.restore || 0);
  }, [route]);
  const [creating, setCreating] = useState(false);
  const View = VIEWS[route.name] || Home;
  const art = imgOf(playback?.item?.album || playback?.item, 'sm');
  const songColor = useArtColor(art);
  // Color de acento de toda la app: el de lo que suena o uno fijo elegido en Ajustes
  const ambient = settings.accent === 'art' ? songColor || '110 90 170' : hexRgb(settings.accent);
  const active = route.name === 'liked' ? 'library' : route.name;

  return (
    <div className="app" style={{ '--ambient': ambient }}>
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
          <a href="#/ajustes" className={`icon-btn round ${route.name === 'ajustes' ? 'on' : ''}`} title="Ajustes" aria-label="Ajustes">
            <Icon name="settings" size={20} />
          </a>
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
