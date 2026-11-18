import { useEffect, useId, useState } from 'react';
import { GLASS_OPTIONS, useGlassMode } from '../appearance.js';
import { Icon } from '../components/ui.jsx';
import { ACCENT_COLORS, DEFAULTS, HOME_SECTIONS, SHORTCUTS, START_PAGES, resetSettings, useSettings } from '../settings.js';
import { comboOf, keyParts, setCapturing } from '../shortcuts.js';
import { useApp } from '../store.jsx';

/** Grupo de opciones excluyentes en forma de chips */
function Choice({ label, value, options, onChange }) {
  const id = useId();
  return (
    <div className="set-row">
      <span className="set-label" id={id}>
        {label}
      </span>
      <div className="chips" role="radiogroup" aria-labelledby={id}>
        {options.map(([v, l]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={`chip ${value === v ? 'on' : ''}`} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Card({ id, title, children, hint }) {
  return (
    <section className="appearance set-card" id={id} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {hint && <p>{hint}</p>}
      {children}
    </section>
  );
}

export default function AppSettings() {
  const { route } = useApp();
  const [s, set] = useSettings();

  // #/ajustes/inicio lleva directamente a esa sección
  useEffect(() => {
    if (!route.id) return;
    const t = setTimeout(() => document.getElementById(`set-${route.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return () => clearTimeout(t);
  }, [route.id]);

  return (
    <div className="page settings-page">
      <div className="page-head">
        <h1>Ajustes</h1>
      </div>

      <Card id="set-apariencia" title="Apariencia">
        <Choice
          label="Tema"
          value={s.theme}
          onChange={(theme) => set({ theme })}
          options={[
            ['dark', 'Oscuro'],
            ['light', 'Claro'],
            ['system', 'Según el sistema'],
          ]}
        />
        <div className="set-row">
          <span className="set-label">Color de acento</span>
          <div className="swatches" role="radiogroup" aria-label="Color de acento">
            {ACCENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={s.accent === c}
                className={`swatch ${s.accent === c ? 'on' : ''} ${c === 'art' ? 'auto' : ''}`}
                style={c === 'art' ? undefined : { background: c }}
                onClick={() => set({ accent: c })}
                title={c === 'art' ? 'El color de lo que suena' : c}
              >
                {c === 'art' && 'Canción'}
              </button>
            ))}
          </div>
        </div>
        <Choice
          label="Tamaño del texto"
          value={s.textSize}
          onChange={(textSize) => set({ textSize })}
          options={[
            ['s', 'Pequeño'],
            ['m', 'Normal'],
            ['l', 'Grande'],
            ['xl', 'Muy grande'],
          ]}
        />
        <Choice
          label="Densidad"
          value={s.density}
          onChange={(density) => set({ density })}
          options={[
            ['comfortable', 'Cómoda (portadas grandes)'],
            ['compact', 'Compacta (más contenido)'],
          ]}
        />
      </Card>

      <GlassCard clarity={s.glassClarity} onClarity={(glassClarity) => set({ glassClarity })} />

      <Card id="set-navegacion" title="Navegación">
        <Choice
          label="Barra superior"
          value={s.nav}
          onChange={(nav) => set({ nav })}
          options={[
            ['scroll', 'Se compacta al bajar'],
            ['always', 'Siempre compacta'],
            ['never', 'Siempre completa'],
          ]}
        />
        <Choice label="Al abrir Sonora, ir a" value={s.startPage} onChange={(startPage) => set({ startPage })} options={START_PAGES} />
      </Card>

      <HomeSections order={s.homeOrder} hidden={s.homeHidden} set={set} />

      <Card id="set-reproduccion" title="Reproducción">
        <Choice
          label="Doble clic en una canción"
          value={s.dblClick}
          onChange={(dblClick) => set({ dblClick })}
          options={[
            ['play', 'Reproducirla'],
            ['queue', 'Añadirla a la cola'],
          ]}
        />
        <Choice
          label="Volumen al abrir Sonora"
          value={s.startVolume < 0 ? 'keep' : 'set'}
          onChange={(v) => set({ startVolume: v === 'keep' ? -1 : s.startVolume < 0 ? 50 : s.startVolume })}
          options={[
            ['keep', 'No cambiarlo'],
            ['set', 'Ponerlo a…'],
          ]}
        />
        {s.startVolume >= 0 && (
          <label className="set-row set-slider">
            <span className="set-label">
              Volumen inicial <output>{s.startVolume} %</output>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={s.startVolume}
              style={{ '--p': `${s.startVolume}%` }}
              onChange={(e) => set({ startVolume: Number(e.target.value) })}
            />
            <small className="muted">Se aplica al dispositivo que esté sonando cuando abras Sonora.</small>
          </label>
        )}
        <Choice
          label="Subida suave del volumen al dar play"
          value={s.fadeIn}
          onChange={(fadeIn) => set({ fadeIn })}
          options={[
            [true, 'Sí'],
            [false, 'No'],
          ]}
        />
      </Card>

      <Shortcuts keys={s.keys} set={set} />

      <Card
        id="set-sonando"
        title="Sonando ahora"
        hint="El diseño de la vista a pantalla completa, el fondo, el modo reloj, la letra y los preajustes se cambian en su propia pestaña «Ajustes» (abajo en esa vista)."
      />

      <button
        type="button"
        className="btn outline danger"
        onClick={() => {
          if (window.confirm('¿Volver a los ajustes de fábrica de la app? Los de «Sonando ahora» no cambian.')) resetSettings();
        }}
      >
        <Icon name="refresh" size={16} /> Restablecer los ajustes de la app
      </button>
    </div>
  );
}

function GlassCard({ clarity, onClarity }) {
  const { mode, systemReduced, setMode } = useGlassMode();
  const opaque = mode === 'reduced' || (mode === 'auto' && systemReduced);
  return (
    <Card
      id="set-cristal"
      title="Cristal líquido"
      hint={
        systemReduced
          ? 'Tu sistema tiene la transparencia reducida: en «Automático» el cristal se ve opaco. Elige «Siempre cristal» para verlo igualmente.'
          : 'En «Automático» el cristal sigue la configuración de transparencia de tu sistema.'
      }
    >
      <Choice label="Modo" value={mode} onChange={setMode} options={GLASS_OPTIONS} />
      <label className={`set-row set-slider ${opaque ? 'is-off' : ''}`}>
        <span className="set-label">
          Transparencia <output>{clarity < 35 ? 'Más denso' : clarity > 65 ? 'Más transparente' : 'Normal'}</output>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={clarity}
          disabled={opaque}
          style={{ '--p': `${clarity}%` }}
          onChange={(e) => onClarity(Number(e.target.value))}
          aria-label="Transparencia del cristal"
        />
        {opaque && <small className="muted">Con el cristal opaco no hay transparencia que ajustar.</small>}
      </label>
    </Card>
  );
}

/** Secciones de «Escuchar»: mostrar u ocultar y cambiar el orden */
function HomeSections({ order, hidden, set }) {
  const names = Object.fromEntries(HOME_SECTIONS);
  const move = (i, d) => {
    const n = [...order];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    set({ homeOrder: n });
  };
  return (
    <Card id="set-inicio" title="Tu inicio" hint="Elige qué secciones ves en «Escuchar» y en qué orden.">
      <ol className="home-sections">
        {order.map((k, i) => {
          const shown = !hidden.includes(k);
          return (
            <li key={k} className={shown ? '' : 'is-hidden'}>
              <button
                type="button"
                className={`hs-toggle ${shown ? 'on' : ''}`}
                role="switch"
                aria-checked={shown}
                onClick={() => set({ homeHidden: shown ? [...hidden, k] : hidden.filter((x) => x !== k) })}
                title={shown ? 'Ocultar' : 'Mostrar'}
              >
                <span className="hs-knob" />
              </button>
              <span className="hs-name">{names[k]}</span>
              <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${names[k]}`}>
                <Icon name="up" size={18} />
              </button>
              <button type="button" className="icon-btn" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Bajar ${names[k]}`}>
                <Icon name="down" size={18} />
              </button>
            </li>
          );
        })}
      </ol>
      <button type="button" className="btn" onClick={() => set({ homeOrder: DEFAULTS.homeOrder, homeHidden: [] })}>
        Orden original
      </button>
    </Card>
  );
}

/** Atajos de teclado: pulsa «Cambiar» y después la tecla nueva */
function Shortcuts({ keys, set }) {
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);
  const label = Object.fromEntries(SHORTCUTS.map(([k, l]) => [k, l]));

  useEffect(() => {
    if (!editing) return;
    setCapturing(true);
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setEditing(null);
      const combo = e.key === 'Backspace' || e.key === 'Delete' ? '' : comboOf(e);
      if (combo === null) return; // solo un modificador: se espera a la tecla
      const next = { ...keys, [editing]: combo };
      const clash = combo && Object.keys(keys).find((a) => a !== editing && keys[a] === combo);
      if (clash) next[clash] = '';
      setNote(clash ? `«${keyParts(combo).join(' + ')}» ya era «${label[clash]}»: ese atajo se ha quitado.` : null);
      set({ keys: next });
      setEditing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      setCapturing(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  return (
    <Card id="set-atajos" title="Atajos de teclado" hint="Pulsa «Cambiar» y después la tecla o combinación nueva. Esc cancela; Retroceso deja la acción sin atajo.">
      <ul className="shortcut-list">
        {SHORTCUTS.map(([k, l]) => (
          <li key={k}>
            <span className="sc-name">{l}</span>
            <span className="sc-keys" aria-live="polite">
              {editing === k ? (
                <em>Pulsa una tecla…</em>
              ) : keys[k] ? (
                keyParts(keys[k]).map((p, i) => <kbd key={i}>{p}</kbd>)
              ) : (
                <em className="muted">Sin atajo</em>
              )}
            </span>
            <button type="button" className="btn sc-change" onClick={() => setEditing(editing === k ? null : k)}>
              {editing === k ? 'Cancelar' : 'Cambiar'}
            </button>
          </li>
        ))}
      </ul>
      {note && <p className="opt-note">{note}</p>}
      <button
        type="button"
        className="btn"
        onClick={() => {
          set({ keys: DEFAULTS.keys });
          setNote(null);
        }}
      >
        Atajos originales
      </button>
      <p className="muted small">Esc siempre cierra «Sonando ahora». Los atajos no se activan mientras escribes.</p>
    </Card>
  );
}
