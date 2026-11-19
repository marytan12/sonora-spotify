import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFrame } from '../../clock.js';
import { getSongOffset, lyricsCandidates, neteaseCandidate, pickLyrics, retryLyrics, setSongOffset, useLyrics, useSongOffset } from '../../lyrics.js';
import { Icon, Loading, fmt, useAsync } from '../ui.jsx';

// ======================= LETRA =======================
/** Parte una línea en palabras para rellenarlas una a una: un degradado sobre la línea
 *  entera se veía mal cuando la línea ocupa varias filas (todas se rellenaban a la vez). */
function Words({ line }) {
  // Letra palabra a palabra: cada palabra con su propio tiempo
  if (line.words?.length)
    return line.words.map((w, i) => (
      <span key={i} className="w">
        {w.text}
      </span>
    ));
  if (!line.text) return '♪';
  return line.text.split(' ').map((w, i) => (
    <span key={i} className="w">
      {w}
      {' '}
    </span>
  ));
}

/** Relleno con los tiempos de cada palabra: cada una se llena mientras se canta */
function fillTimed(el, words, t) {
  const spans = el.querySelectorAll('.w');
  if (spans.length !== words.length) return false;
  words.forEach((w, k) => {
    const p = Math.min(1, Math.max(0, (t - w.t) / Math.max(1, w.d)));
    const v = `${(p * 100).toFixed(1)}%`;
    if (spans[k].style.getPropertyValue('--wf') !== v) spans[k].style.setProperty('--wf', v);
  });
  return true;
}

function fillWords(el, f) {
  const words = el.querySelectorAll('.w');
  if (!words.length) return;
  let total = 0;
  for (const w of words) total += w.textContent.length;
  let acc = 0;
  for (const w of words) {
    const len = w.textContent.length;
    const p = Math.min(1, Math.max(0, (f * total - acc) / len));
    acc += len;
    const v = `${(p * 100).toFixed(1)}%`;
    if (w.style.getPropertyValue('--wf') !== v) w.style.setProperty('--wf', v);
  }
}

/**
 * fill: 'word' rellena la frase actual palabra a palabra; 'line' la enciende entera; 'none', sin animación.
 * lines: frases visibles con la letra sobre la portada (1 la actual, 2 actual y siguiente, 3 también la anterior).
 */
/** Solo se vuelve a dibujar si cambia la canción o un ajuste de la letra (no con cada sondeo) */
export default memo(
  Lyrics,
  (a, b) =>
    a.item?.id === b.item?.id &&
    a.item?.duration_ms === b.item?.duration_ms &&
    a.now === b.now &&
    a.onSeek === b.onSeek &&
    a.variant === b.variant &&
    a.fill === b.fill &&
    a.lines === b.lines
);

function Lyrics({ item, now, onSeek, variant, fill = 'word', lines: overlayLines = 3 }) {
  const lyr = useLyrics(item, true);
  const [active, setActive] = useState(-1);
  const box = useRef(null);
  const userScroll = useRef(0);
  const synced = lyr.status === 'synced';
  const lines = synced ? lyr.lines : null;

  // La línea activa de la canción anterior no debe arrastrarse a la nueva
  useEffect(() => setActive(-1), [lines]);

  // Cada fotograma: línea activa y relleno progresivo palabra a palabra (sin re-renderizar la lista)
  useFrame(() => {
    if (!lines) return;
    const t = now() + 150;
    let i = -1;
    for (let k = 0; k < lines.length && lines[k].t <= t; k++) i = k;
    setActive((prev) => (prev === i ? prev : i));
    const el = fill === 'word' && box.current?.querySelector('.line.now');
    if (el && i >= 0) {
      if (lines[i].words && fillTimed(el, lines[i].words, t)) return;
      const end = lines[i].end ?? lines[i + 1]?.t ?? item?.duration_ms ?? lines[i].t + 4000;
      // El relleno termina un poco antes del cambio de línea para que se lea completo
      const span = Math.max(300, Math.min((end - lines[i].t) * 0.92, 7000));
      fillWords(el, Math.min(1, Math.max(0, (t - lines[i].t) / span)));
    }
  }, [lines, now, item?.duration_ms, fill]);

  const isList = variant === 'side' || variant === 'karaoke';
  const [fixing, setFixing] = useState(false);
  useEffect(() => setFixing(false), [item?.id]);

  // Si el usuario desplaza la letra a mano, se respeta durante unos segundos
  useEffect(() => {
    const c = box.current;
    if (!c || !isList) return;
    const mark = () => (userScroll.current = Date.now());
    c.addEventListener('wheel', mark, { passive: true });
    c.addEventListener('touchmove', mark, { passive: true });
    return () => {
      c.removeEventListener('wheel', mark);
      c.removeEventListener('touchmove', mark);
    };
  }, [isList, lyr.status, fixing]);

  // Letra sobre la portada: si una frase vecina no cabe entera (se ha encogido para dejar sitio a la
  // actual), se oculta en vez de mostrarse cortada a media fila
  useLayoutEffect(() => {
    const o = box.current;
    if (isList || !o) return;
    const fit = () => {
      // Se limpia la marca en todas las frases (también la actual: React reutiliza el mismo
      // elemento cuando una vecina pasa a ser la actual). El CSS nunca oculta la actual.
      o.querySelectorAll('.line').forEach((l) => l.removeAttribute('data-nofit'));
      for (const l of o.querySelectorAll('.line:not(.now)')) {
        const lh = parseFloat(getComputedStyle(l).lineHeight) || 20;
        if (l.getBoundingClientRect().height < lh - 1) l.setAttribute('data-nofit', '');
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    return () => ro.disconnect();
  }, [active, isList, lyr.status]);

  // Desplazamiento suave para centrar la línea activa
  useEffect(() => {
    if (!isList || active < 0 || Date.now() - userScroll.current < 3500) return;
    const c = box.current;
    const el = c?.querySelector(`[data-i="${active}"]`);
    if (!c || !el) return;
    const instant = fill === 'none' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    c.scrollTo({ top: el.offsetTop - c.clientHeight * (variant === 'karaoke' ? 0.42 : 0.38), behavior: instant ? 'auto' : 'smooth' });
  }, [active, isList, variant, fixing, fill]);
  const nowText = (l) => (fill === 'word' ? <Words line={l} /> : l.text || '♪');
  const songOffset = useSongOffset(item?.id);

  if (!item) return null;
  const msg =
    lyr.status === 'loading' || lyr.status === 'idle' ? null
    : lyr.status === 'episode' ? 'Los podcasts no tienen letra.'
    : lyr.status === 'instrumental' ? 'Canción instrumental.'
    : lyr.status === 'error' ? 'No se ha podido cargar la letra ahora mismo.'
    : lyr.status !== 'synced' && lyr.status !== 'plain' ? 'No se ha encontrado letra para esta canción (ni en LRCLIB ni en NetEase).'
    : null;

  if (!isList) {
    // Letra sobre la portada: anterior, actual y siguiente (según Ajustes), o solo la actual en «Una línea»
    if (!synced) return null;
    const n = variant === 'line' ? 1 : overlayLines;
    const from = n >= 3 ? Math.max(0, active - 1) : active;
    const to = n >= 2 ? active + 1 : active;
    return (
      <div className={`lyrics-overlay lo-${variant}`} ref={box} aria-live="polite">
        {active < 0 ? (
          <p className="line">♪</p>
        ) : (
          lines.slice(from, to + 1).map((l, k) => (
            <p key={from + k} className={`line ${from + k === active ? 'now' : ''}`}>
              {from + k === active ? nowText(l) : l.text || '♪'}
            </p>
          ))
        )}
      </div>
    );
  }

  if (lyr.status === 'loading' || lyr.status === 'idle') return <Loading />;
  if (fixing) return <LyricsPicker item={item} current={lyr.meta} onDone={() => setFixing(false)} />;
  const canFix = lyr.status !== 'episode';
  if (msg)
    return (
      <div className="lyrics-msg">
        <p>{msg}</p>
        {lyr.status === 'error' && (
          <button className="lyrics-fix" onClick={() => retryLyrics(item.id)}>
            Reintentar
          </button>
        )}
        {canFix && lyr.status !== 'error' && (
          <button className="lyrics-fix" onClick={() => setFixing(true)}>
            Buscar otra letra
          </button>
        )}
      </div>
    );

  return (
    <div className={`lyrics-box ${variant}`}>
      {lyr.meta?.suspicious && (
        <button className="lyrics-warn" onClick={() => setFixing(true)} title="Elegir otra letra">
          <Icon name="alert" size={16} />
          Puede que esta letra no sea de esta versión
        </button>
      )}
      {synced && <SyncControl trackId={item.id} value={songOffset} />}
      <div className={`lyrics ${synced ? 'synced' : ''}`} ref={box}>
        {lyr.lines.map((l, i) =>
          synced ? (
            <button
              key={i}
              data-i={i}
              className={`line ${i === active ? 'now' : i < active ? 'past' : ''}`}
              onClick={() => onSeek(l.t)}
            >
              {i === active ? nowText(l) : l.text || '♪'}
            </button>
          ) : (
            <p key={i} className="line">
              {l.text || ' '}
            </p>
          )
        )}
        <p className="lyrics-src">
          {lyr.meta?.provider === 'netease' ? 'Letra de NetEase Cloud Music' : 'Letra de LRCLIB'}
          {lyr.meta?.words && ' · palabra a palabra'}
          {lyr.meta?.source === 'manual' && ' · elegida a mano'} ·{' '}
          <button className="lyrics-fix" onClick={() => setFixing(true)}>
            ¿No cuadra? Elegir otra
          </button>
        </p>
      </div>
    </div>
  );
}

// Lista de letras alternativas de LRCLIB para cuando la automática no es la buena
function LyricsPicker({ item, current, onDone }) {
  const { data, loading, error } = useAsync(() => lyricsCandidates(item).catch(() => []), [item.id]);
  const ne = useAsync(() => neteaseCandidate(item), [item.id]);
  const secs = Math.round((item.duration_ms || 0) / 1000);
  const choose = (id) => {
    pickLyrics(item.id, id);
    onDone();
  };
  return (
    <div className="lyrics-picker">
      <div className="picker-head">
        <h3>Elegir letra</h3>
        <button className="icon-btn" onClick={onDone} aria-label="Cerrar">
          <Icon name="close" size={18} />
        </button>
      </div>
      <p className="muted">
        {item.name} · {item.artists?.[0]?.name} · {fmt(item.duration_ms)}
      </p>
      {current?.source === 'manual' && (
        <button className="picker-reset" onClick={() => choose(null)}>
          <Icon name="refresh" size={16} /> Volver a la letra automática
        </button>
      )}
      {ne.data && (
        <ul className="picker-ne">
          <li>
            <button className={current?.id === ne.data.id ? 'on' : ''} onClick={() => choose(ne.data.id)}>
              <span className="pk-main">
                <strong>{ne.data.name}</strong>
                <span>
                  {ne.data.artist} · NetEase Cloud Music
                </span>
              </span>
              <span className="pk-tags">
                <em className="ok">{ne.data.words ? 'Palabra a palabra' : 'Sincronizada'}</em>
                {ne.data.diff != null && (
                  <em className={ne.data.diff <= 2 ? 'ok' : ne.data.diff > 8 ? 'bad' : ''}>
                    {ne.data.diff <= 2 ? 'Misma duración' : `±${Math.round(ne.data.diff)} s`}
                  </em>
                )}
                {current?.id === ne.data.id && <Icon name="check" size={16} />}
              </span>
            </button>
          </li>
        </ul>
      )}
      {loading ? (
        <Loading />
      ) : error || !data?.length ? (
        <p className="lyrics-msg">{ne.data ? 'No hay más letras en LRCLIB para esta canción.' : 'No hay otras letras para esta canción.'}</p>
      ) : (
        <ul>
          {data.map((c) => {
            const diff = c.duration ? Math.round(c.duration - secs) : null;
            return (
              <li key={c.id}>
                <button className={current?.id === c.id ? 'on' : ''} onClick={() => choose(c.id)}>
                  <span className="pk-main">
                    <strong>{c.trackName}</strong>
                    <span>
                      {c.artistName}
                      {c.albumName ? ` · ${c.albumName}` : ''}
                    </span>
                  </span>
                  <span className="pk-tags">
                    {c.instrumental ? <em>Instrumental</em> : c.syncedLyrics ? <em className="ok">Sincronizada</em> : <em>Sin sincronizar</em>}
                    {diff !== null && (
                      <em className={Math.abs(diff) <= 2 ? 'ok' : Math.abs(diff) > 8 ? 'bad' : ''}>
                        {Math.abs(diff) <= 2 ? 'Misma duración' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} s`}
                      </em>
                    )}
                    {current?.id === c.id && <Icon name="check" size={16} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Ajuste fino de la sincronía de esta canción (se recuerda y se suma al general de Ajustes) */
function SyncControl({ trackId, value }) {
  const step = 250;
  const label = value === 0 ? 'Sincronía' : `${value > 0 ? '+' : '−'}${(Math.abs(value) / 1000).toFixed(2).replace('.', ',')} s`;
  return (
    <div className={`lyrics-sync ${value ? 'is-set' : ''}`} role="group" aria-label="Sincronía de la letra en esta canción">
      <button type="button" onClick={() => setSongOffset(trackId, getSongOffset(trackId) - step)} title="La letra va adelantada: retrasarla 0,25 s">
        −
      </button>
      <button type="button" className="ls-value" onClick={() => setSongOffset(trackId, 0)} title={value ? 'Volver a la sincronía original' : 'Ajusta la sincronía si la letra no va con la voz'}>
        {label}
      </button>
      <button type="button" onClick={() => setSongOffset(trackId, getSongOffset(trackId) + step)} title="La letra va atrasada: adelantarla 0,25 s">
        +
      </button>
    </div>
  );
}
