# Sonora 🎧

Cliente web completo para Spotify construido con **React + Vite** sobre la **Spotify Web API** y el **Web Playback SDK**.

## Funciones

- **Login seguro con PKCE** (sin client secret en el navegador) y renovación automática del token
- **Reproductor completo**: play/pausa, anterior/siguiente, barra de progreso con seek, volumen y silencio, aleatorio, repetir (todo / canción)
- **Reproductor web integrado** (Web Playback SDK): el navegador se convierte en un dispositivo de Spotify (requiere Premium)
- **Dispositivos**: lista de dispositivos conectados y transferencia de la reproducción
- **Cola**: ver la cola y añadir canciones
- **Búsqueda** de canciones, artistas, álbumes, playlists, podcasts y episodios con filtros y paginación
- **Biblioteca**: playlists, artistas seguidos, álbumes, podcasts, episodios guardados y "Canciones que te gustan"
- **Playlists**: crear, editar nombre/descripción/visibilidad/colaborativa, cambiar portada, añadir, quitar y reordenar canciones, eliminar, seguir playlists ajenas
- **Álbumes, artistas y podcasts**: páginas de detalle, guardar/seguir
- **Me gusta**: guardar o quitar canciones con un clic
- **Perfil y estadísticas**: canciones y artistas top (4 semanas / 6 meses / siempre), géneros favoritos, escuchado recientemente
- Diseño responsive (móvil y escritorio)

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

## Limitaciones de Spotify (modo desarrollo)

- El dueño de la app necesita Spotify **Premium**; reproducir en el navegador también requiere Premium.
- Solo se ven las canciones de playlists propias o colaborativas.
- "Top tracks" del artista, novedades y categorías ya no están disponibles: la página del artista usa la búsqueda.
