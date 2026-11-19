import { useState } from 'react';
import { Icon } from '../ui.jsx';
import { ACCENTS, BUILTIN_PRESETS, DEFAULTS, ELEMENTS, FONTS, presetPrefs, readPresets, writePresets } from './prefs.js';

// ======================= AJUSTES =======================
// A la vista solo lo esencial (preajustes, diseño, letra, fondo y Canvas); el resto, plegado en grupos.
// El cristal de toda la app se cambia en la página Ajustes, no aquí.
function Options({ label, value, options, onChange }) {
  return (
    <fieldset className="opt">
      <legend>{label}</legend>
      <div className="opt-row">
        {options.map(([v, l]) => (
          <button key={v} type="button" className={value === v ? 'on' : ''} onClick={() => onChange(v)} aria-pressed={value === v}>
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Slider({ label, value, min = 0, max, step = 1, format = (v) => v, onChange }) {
  return (
    <label className="opt">
      <span className="opt-label">
        {label} <output>{format(value)}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--p': `${((value - min) / (max - min)) * 100}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

const YES_NO = [
  [true, 'Sí'],
  [false, 'No'],
];

/** Grupo plegable de ajustes menos usados */
function More({ title, children }) {
  return (
    <details className="opt-more">
      <summary>
        {title}
        <Icon name="down" size={16} />
      </summary>
      <div className="opt-more-body">{children}</div>
    </details>
  );
}

export default function Settings({ prefs, set, canvas, canvasError, onRetryCanvas, isTrack }) {
  const canvasHint =
    prefs.canvas === 'none' || !isTrack
      ? null
      : canvasError
        ? 'El servicio de Canvas no responde ahora mismo: se muestra la portada.'
        : canvas
          ? null
          : 'Esta canción no tiene Canvas: se usa la portada.';

  return (
    <div className="np-settings">
      <h3>Ajustes de la vista</h3>
      <Presets prefs={prefs} set={set} />

      <Options
        label="Diseño"
        value={prefs.layout}
        onChange={(layout) => set({ layout, ...(layout === 'stage' && prefs.panel !== 'settings' ? { panel: 'none' } : {}) })}
        options={[
          ['classic', 'Clásico'],
          ['stage', 'Portada grande'],
          ['lyrics', 'Solo letra'],
          ['studio', 'Estudio'],
        ]}
      />
      {prefs.layout !== 'lyrics' && (
        <Options
          label="Letra"
          value={prefs.lyrics}
          onChange={(lyrics) => set({ lyrics, panel: lyrics === 'side' ? 'lyrics' : prefs.panel })}
          options={[
            ['side', 'Al lado'],
            ['cover', 'Sobre la portada'],
            ['line', 'Una línea'],
            ['none', 'Ocultar'],
          ]}
        />
      )}
      <Options
        label="Fondo"
        value={prefs.bg}
        onChange={(bg) => set({ bg })}
        options={[
          ['cover', 'Portada'],
          ['artist', 'Artista'],
          ['gradient', 'Degradado'],
          ['solid', 'Color liso'],
        ]}
      />
      <Options
        label="Canvas"
        value={prefs.canvas}
        onChange={(c) => set({ canvas: c })}
        options={[
          ['none', 'No'],
          ['cover', 'En la portada'],
          ['background', 'De fondo'],
          ['both', 'Ambos'],
          ['portrait', 'Vertical'],
        ]}
      />
      {canvasHint && (
        <p className="opt-hint">
          {canvasHint}{' '}
          {canvasError && (
            <button type="button" className="lyrics-fix" onClick={onRetryCanvas}>
              Reintentar
            </button>
          )}
        </p>
      )}
      <Slider label="Oscurecer el fondo" value={prefs.dim} max={80} format={(v) => `${v} %`} onChange={(dim) => set({ dim })} />

      <div className="opt-groups">
        <More title="Estilo">
          <Options
            label="Tema"
            value={prefs.theme}
            onChange={(theme) => set({ theme })}
            options={[
              ['liquid', 'Cristal líquido'],
              ['minimal', 'Minimal'],
            ]}
          />
          <Options label="Fuente" value={prefs.font} onChange={(font) => set({ font })} options={Object.entries(FONTS).map(([k, f]) => [k, f.label])} />
          <Options
            label="Forma de la portada"
            value={prefs.shape}
            onChange={(shape) => set({ shape })}
            options={[
              ['rounded', 'Redondeada'],
              ['square', 'Cuadrada'],
              ['circle', 'Circular'],
            ]}
          />
          <Options
            label="Filtro de imagen"
            value={prefs.filter}
            onChange={(filter) => set({ filter })}
            options={[
              ['none', 'Ninguno'],
              ['grayscale', 'Blanco y negro'],
              ['sepia', 'Sepia'],
              ['vintage', 'Vintage'],
              ['vivid', 'Vívido'],
            ]}
          />
          <fieldset className="opt">
            <legend>Color de acento</legend>
            <div className="swatches">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`swatch ${prefs.accent === c ? 'on' : ''} ${c === 'auto' ? 'auto' : ''}`}
                  style={c === 'auto' ? undefined : { background: c }}
                  onClick={() => set({ accent: c })}
                  aria-pressed={prefs.accent === c}
                  title={c === 'auto' ? 'Automático (de la portada)' : c}
                >
                  {c === 'auto' && 'Auto'}
                </button>
              ))}
            </div>
          </fieldset>
        </More>

        <More title="Letra">
          <Options
            label="Tamaño"
            value={prefs.lyricSize}
            onChange={(lyricSize) => set({ lyricSize })}
            options={[
              ['s', 'Pequeña'],
              ['m', 'Mediana'],
              ['l', 'Grande'],
            ]}
          />
          <Options
            label="Resaltado de la frase actual"
            value={prefs.lyricFill}
            onChange={(lyricFill) => set({ lyricFill })}
            options={[
              ['word', 'Palabra a palabra'],
              ['line', 'Línea entera'],
              ['none', 'Sin animación'],
            ]}
          />
          <Options
            label="Color"
            value={prefs.lyricColor}
            onChange={(lyricColor) => set({ lyricColor })}
            options={[
              ['white', 'Blanco'],
              ['accent', 'Color de acento'],
            ]}
          />
          {prefs.lyrics === 'side' && prefs.layout !== 'lyrics' && (
            <Options
              label="Alineación"
              value={prefs.lyricAlign}
              onChange={(lyricAlign) => set({ lyricAlign })}
              options={[
                ['left', 'Izquierda'],
                ['center', 'Centrada'],
              ]}
            />
          )}
          {prefs.lyrics === 'cover' && prefs.layout !== 'lyrics' && (
            <Options
              label="Frases sobre la portada"
              value={prefs.coverLines}
              onChange={(coverLines) => set({ coverLines })}
              options={[
                [1, 'La actual'],
                [2, 'Y la siguiente'],
                [3, 'También la anterior'],
              ]}
            />
          )}
          <Options
            label="Fuente"
            value={prefs.lyricFont}
            onChange={(lyricFont) => set({ lyricFont })}
            options={[['same', 'La de la vista'], ...Object.entries(FONTS).map(([k, f]) => [k, f.label])]}
          />
          <Options
            label="Grosor"
            value={prefs.lyricWeight}
            onChange={(lyricWeight) => set({ lyricWeight })}
            options={[
              ['auto', 'Según el tema'],
              ['regular', 'Normal'],
              ['semibold', 'Seminegrita'],
              ['bold', 'Negrita'],
              ['black', 'Extra'],
            ]}
          />
          <Slider
            label="Sincronía de todas las canciones"
            value={prefs.lyricOffset}
            min={-2000}
            max={2000}
            step={100}
            format={(v) => (v === 0 ? 'exacta' : `${v > 0 ? '+' : '−'}${(Math.abs(v) / 1000).toFixed(1)} s ${v > 0 ? 'antes' : 'después'}`)}
            onChange={(lyricOffset) => set({ lyricOffset })}
          />
          <p className="opt-hint">Para una sola canción, usa «− Sincronía +» junto a la letra.</p>
        </More>

        <More title="Fondo y movimiento">
          <Slider
            label="Desenfoque del fondo"
            value={prefs.blur}
            max={120}
            // Un solo control: el Canvas de fondo se desenfoca menos para que se siga viendo
            onChange={(blur) => set({ blur, canvasBlur: Math.round(blur / 2) })}
          />
          <Options label="Fondo que respira (colores de la portada)" value={prefs.breathe} onChange={(breathe) => set({ breathe })} options={YES_NO} />
          {prefs.breathe && (
            <Options
              label="Velocidad"
              value={prefs.breatheSpeed}
              onChange={(breatheSpeed) => set({ breatheSpeed })}
              options={[
                ['slow', 'Lenta'],
                ['normal', 'Normal'],
                ['fast', 'Rápida'],
              ]}
            />
          )}
          {prefs.canvas === 'portrait' && (
            <Options
              label="Canvas vertical"
              value={prefs.portraitPos}
              onChange={(portraitPos) => set({ portraitPos })}
              options={[
                ['left', 'A la izquierda'],
                ['center', 'Centrado'],
              ]}
            />
          )}
        </More>

        <More title="Pantalla">
          <Options
            label="Modo reloj (la hora en grande sin tocar nada)"
            value={prefs.clockAfter}
            onChange={(clockAfter) => set({ clockAfter })}
            options={[
              [0, 'Nunca'],
              [1, '1 min'],
              [3, '3 min'],
              [5, '5 min'],
              [10, '10 min'],
            ]}
          />
          <Options label="Ocultar las barras sin mover el ratón" value={prefs.autoHide} onChange={(autoHide) => set({ autoHide })} options={YES_NO} />
          <fieldset className="opt">
            <legend>Elementos visibles</legend>
            <div className="opt-row">
              {ELEMENTS.map(([k, l]) => {
                const shown = !prefs.hidden.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    className={shown ? 'on' : ''}
                    aria-pressed={shown}
                    onClick={() => set({ hidden: shown ? [...prefs.hidden, k] : prefs.hidden.filter((x) => x !== k) })}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </More>
      </div>

      <button className="btn" type="button" onClick={() => set({ ...DEFAULTS, panel: 'settings' })}>
        Restablecer
      </button>
    </div>
  );
}

// Preajustes: los de serie y los tuyos (guardados en el navegador)
function Presets({ prefs, set }) {
  const [mine, setMine] = useState(readPresets);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const save = (e) => {
    e.preventDefault();
    const n = name.trim().slice(0, 24);
    if (!n) return;
    const { panel: _panel, ...rest } = prefs;
    const next = [...mine.filter((p) => p.name.toLowerCase() !== n.toLowerCase()), { name: n, prefs: rest }].slice(-12);
    writePresets(next);
    setMine(next);
    setName('');
    setSaving(false);
  };
  const remove = (n) => {
    const next = mine.filter((p) => p.name !== n);
    writePresets(next);
    setMine(next);
  };
  return (
    <fieldset className="opt presets">
      <legend>Preajustes</legend>
      <div className="opt-row">
        {BUILTIN_PRESETS.map(([n, p]) => (
          <button key={n} type="button" onClick={() => set(presetPrefs(p, prefs.panel))}>
            {n}
          </button>
        ))}
        {mine.map((p) => (
          <span key={p.name} className="preset-mine">
            <button type="button" onClick={() => set(presetPrefs(p.prefs, prefs.panel))}>
              {p.name}
            </button>
            <button type="button" className="preset-del" onClick={() => remove(p.name)} aria-label={`Borrar el preajuste ${p.name}`} title="Borrar">
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
        {!saving && (
          <button type="button" className="preset-add" onClick={() => setSaving(true)} title="Guardar los ajustes actuales como preajuste">
            <Icon name="plus" size={14} /> Guardar
          </button>
        )}
      </div>
      {saving && (
        <form className="preset-save" onSubmit={save}>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (p. ej. Domingo)"
            maxLength={24}
            aria-label="Nombre del preajuste"
            autoFocus
          />
          <button className="btn" type="submit" disabled={!name.trim()}>
            Guardar
          </button>
          <button className="btn" type="button" onClick={() => setSaving(false)}>
            Cancelar
          </button>
        </form>
      )}
    </fieldset>
  );
}
