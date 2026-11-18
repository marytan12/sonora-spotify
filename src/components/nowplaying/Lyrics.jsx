import { useEffect, useRef, useState } from 'react';
import { useFrame } from '../../clock.js';
import { lyricsCandidates, pickLyrics, retryLyrics, useLyrics } from '../../lyrics.js';
import { Icon, Loading, fmt, useAsync } from '../ui.jsx';

// ======================= LETRA =======================
/** Parte una línea en palabras para rellenarlas una a una: un degradado sobre la línea
 *  entera se veía mal cuando la línea ocupa varias filas (todas se rellenaban a la vez). */
function Words({ text }) {
  if (!text) return '♪';
  return text.split(' ').map((w, i) => (
    <span key={i} className="w">
      {w}
      {' '}
    </span>
  ));
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

export default function Lyrics({ item, now, onSeek, variant }) {
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
    const el = box.current?.querySelector('.line.now');
    if (el && i >= 0) {
      const end = lines[i + 1]?.t ?? item?.duration_ms ?? lines[i].t + 4000;
      // El relleno termina un poco antes del cambio de línea para que se lea completo
      const span = Math.max(300, Math.min((end - lines[i].t) * 0.92, 7000));
      fillWords(el, Math.min(1, Math.max(0, (t - lines[i].t) / span)));
    }
  }, [lines, now, item?.duration_ms]);

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

  // Desplazamiento suave para centrar la línea activa
  useEffect(() => {
    if (!isList || active < 0 || Date.now() - userScroll.current < 3500) return;
    const c = box.current;
    const el = c?.querySelector(`[data-i="${active}"]`);
    if (!c || !el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    c.scrollTo({ top: el.offsetTop - c.clientHeight * (variant === 'karaoke' ? 0.42 : 0.38), behavior: reduce ? 'auto' : 'smooth' });
  }, [active, isList, variant, fixing]);

  if (!item) return null;
  const msg =
    lyr.status === 'loading' || lyr.status === 'idle' ? null
    : lyr.status === 'episode' ? 'Los podcasts no tienen letra.'
    : lyr.status === 'instrumental' ? 'Canción instrumental.'
    : lyr.status === 'error' ? 'No se ha podido cargar la letra ahora mismo.'
    : lyr.status !== 'synced' && lyr.status !== 'plain' ? 'No hay letra para esta canción en LRCLIB.'
    : null;

  if (!isList) {
    // Letra sobre la portada: línea anterior, actual y siguiente (o solo la actual)
    if (!synced) return null;
    const from = variant === 'line' ? active : Math.max(0, active - 1);
    const to = variant === 'line' ? active : active + 1;
    return (
      <div className={`lyrics-overlay ${variant}`} ref={box} aria-live="polite">
        {active < 0 ? (
          <p className="line">♪</p>
        ) : (
          lines.slice(from, to + 1).map((l, k) => (
            <p key={from + k} className={`line ${from + k === active ? 'now' : ''}`}>
              {from + k === active ? <Words text={l.text} /> : l.text || '♪'}
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
      <div className={`lyrics ${synced ? 'synced' : ''}`} ref={box}>
        {lyr.lines.map((l, i) =>
          synced ? (
            <button
              key={i}
              data-i={i}
              className={`line ${i === active ? 'now' : i < active ? 'past' : ''}`}
              onClick={() => onSeek(l.t)}
            >
              {i === active ? <Words text={l.text} /> : l.text || '♪'}
            </button>
          ) : (
            <p key={i} className="line">
              {l.text || ' '}
            </p>
          )
        )}
        <p className="lyrics-src">
          Letra de LRCLIB
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
  const { data, loading, error } = useAsync(() => lyricsCandidates(item), [item.id]);
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
      {loading ? (
        <Loading />
      ) : error || !data?.length ? (
        <p className="lyrics-msg">No hay otras letras en LRCLIB para esta canción.</p>
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
