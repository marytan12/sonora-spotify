# Sonora 🎧

Cliente web completo para Spotify construido con **React + Vite** sobre la **Spotify Web API** y el **Web Playback SDK**.

## Funciones

- **Login seguro con PKCE** (sin client secret en el navegador) y renovación automática del token
- **Reproductor completo**: play/pausa, anterior/siguiente, barra de progreso con seek, volumen y silencio, aleatorio, repetir (todo / canción)
- **Reproductor web integrado** (Web Playback SDK): el navegador se convierte en un dispositivo de Spotify
- **Dispositivos**: lista de dispositivos conectados y transferencia de la reproducción
- **Cola**: ver la cola y añadir canciones
- **Búsqueda** de canciones, artistas, álbumes, playlists, podcasts y episodios con filtros y paginación
- **Biblioteca**: playlists, artistas seguidos, álbumes, podcasts, episodios guardados y "Canciones que te gustan"
- **Playlists**: crear, editar nombre/descripción/visibilidad/colaborativa, cambiar portada, añadir, quitar y reordenar canciones, eliminar, seguir playlists ajenas
- **Álbumes, artistas y podcasts**: páginas de detalle, guardar/seguir
- **Me gusta**: guardar o quitar canciones con un clic
- **Perfil y estadísticas**: canciones y artistas top (4 semanas / 6 meses / siempre), géneros favoritos, escuchado recientemente
- **Sonando ahora** a pantalla completa: fondo inmersivo con la portada difuminada, colores sacados de la portada, pantalla completa
- **Spotify Canvas**: los vídeos en bucle de cada canción, en la portada o de fondo (vía `api/canvas.js`)
- **Letras en tiempo real** (LRCLIB): la línea actual se resalta y se rellena mientras suena; pulsa una línea para saltar a ella
- Diseño **liquid glass** con el arte como protagonista, iconos estilo iOS (Ionicons) y versión móvil

> Adaptado a los cambios de la API de Spotify de febrero de 2026 para apps en modo desarrollo
> (`/me/library`, `/playlists/{id}/items`, búsqueda limitada a 10 resultados por página, etc.).

## Configuración

1. Crea una app en <https://developer.spotify.com/dashboard> y marca **Web API** y **Web Playback SDK**.
2. Añade estas **Redirect URIs** en la configuración de la app:
   - `http://127.0.0.1:5173/callback` (desarrollo; Spotify no acepta `localhost`)
   - `https://TU-DOMINIO.vercel.app/callback` (producción)
3. En modo desarrollo, añade en **User Management** las cuentas de Spotify que vayan a usar la app (máx. 5).
4. Copia `.env.example` a `.env` y pon tu Client ID. **Nunca** pongas el client secret: no hace falta.

```bash
npm install
npm run dev
```

Abre <http://127.0.0.1:5173>.

## Despliegue

Proyecto listo para Vercel (`vercel.json` incluye la reescritura SPA para `/callback`).
Define la variable de entorno `VITE_SPOTIFY_CLIENT_ID` en el proyecto.

## Tu resumen

En «Resumen»: tu artista y tu canción nº 1, tus top 5, tu década favorita, la variedad de artistas, a qué hora
del día escuchas más, lo que tienes en bucle y tus géneros, por periodo (4 semanas, 6 meses o el último año, que es lo que Spotify calcula como largo plazo).
El botón «Compartir resumen» genera una tarjeta en imagen (1080×1920) para descargarla o compartirla.

## App para Windows 11

`public/descargas/Sonora.exe` (descargable desde el perfil) abre Sonora en su propia ventana usando Chrome o Edge
en modo aplicación. Se usa el navegador y no Electron porque la reproducción de Spotify en el navegador necesita
Widevine, que Chrome y Edge incluyen y Electron no. Para volver a compilarlo: `desktop\build.cmd` (usa el
compilador de C# de .NET Framework 4, incluido en Windows). La web también es instalable como app (manifiesto PWA).

## Canvas y letras

- **Canvas**: Spotify no ofrece los Canvas en su API oficial. `api/canvas.js` (función de Vercel) los pide a un servicio
  comunitario no oficial ([spotify-canva.vercel.app](https://spotify-canva.vercel.app/)). Puedes cambiar el origen con la
  variable `CANVAS_UPSTREAM`, por ejemplo si despliegas tu propia instancia de
  [Paxsenix0/Spotify-Canvas-API](https://github.com/Paxsenix0/Spotify-Canvas-API). Si el servicio falla, se muestra la portada.
- **Letras**: se obtienen en el navegador desde [LRCLIB](https://lrclib.net), una base de datos abierta de letras sincronizadas.

## Limitaciones de Spotify (modo desarrollo)

- La cuenta propietaria de la app en el dashboard de Spotify necesita Premium (requisito de Spotify para el modo desarrollo); la app está pensada para usuarios Premium.
- Solo se ven las canciones de playlists propias o colaborativas.
- "Top tracks" del artista, novedades y categorías ya no están disponibles: la página del artista usa la búsqueda.
