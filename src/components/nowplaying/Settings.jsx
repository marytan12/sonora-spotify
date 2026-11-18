import { useState } from 'react';
import { GLASS_OPTIONS, useGlassMode } from '../../appearance.js';
import { Icon } from '../ui.jsx';
import { ACCENTS, BUILTIN_PRESETS, DEFAULTS, ELEMENTS, FONTS, presetPrefs, readPresets, writePresets } from './prefs.js';

// ======================= AJUSTES =======================
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

function Toggle({ label, value, onChange }) {
  return (
    <Options
      label={label}
      value={value ? 'on' : 'off'}
      onChange={(v) => onChange(v === 'on')}
      options={[
        ['on', 'Sí'],
        ['off', 'No'],
      ]}
    />
  );
}

export default function Settings({ prefs, set, canvas, canvasError, onRetryCanvas, isTrack }) {
  return (
    <div className="np-settings">
      <h3>Ajustes de la vista</h3>
      <Presets prefs={prefs} set={set} />

      <h4 className="opt-group">Diseño</h4>
      <Options
        label="Diseño de la vista"
        value={prefs.layout}
        onChange={(layout) => set({ layout, ...(layout === 'stage' && prefs.panel !== 'settings' ? { panel: 'none' } : {}) })}
        options={[
          ['classic', 'Clásico'],
          ['stage', 'Portada grande'],
          ['lyrics', 'Solo letra'],
          ['studio', 'Estudio'],
        ]}
      />
      <p className="opt-hint">
        {
          {
            classic: 'Portada y controles a la izquierda; letra, cola o ajustes al lado.',
            stage: 'La portada, enorme y centrada. El panel se abre flotando encima.',
            lyrics: 'La letra ocupa la pantalla, con una barra de controles abajo.',
            studio: 'Portada pequeña y todos los datos de la canción: álbum, año, pista y lo siguiente.',
          }[prefs.layout]
        }
      </p>
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

      <h4 className="opt-group">Portada</h4>
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

      <h4 className="opt-group">Letra</h4>
      <Options
        label="Dónde se ve la letra"
        value={prefs.lyrics}
        onChange={(lyrics) => set({ lyrics, panel: lyrics === 'side' ? 'lyrics' : prefs.panel })}
        options={[
          ['side', 'En el panel'],
          ['cover', 'Sobre la portada'],
          ['line', 'Una línea en la portada'],
          ['none', 'Ocultar'],
        ]}
      />
      {(prefs.lyrics !== 'none' || prefs.layout === 'lyrics') && (
        <>
          {prefs.lyrics === 'cover' && prefs.layout !== 'lyrics' && (
            <Options
              label="Frases sobre la portada"
              value={prefs.coverLines}
              onChange={(coverLines) => set({ coverLines })}
              options={[
                [1, 'Solo la actual'],
                [2, 'Actual y siguiente'],
                [3, 'Anterior, actual y siguiente'],
              ]}
            />
          )}
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
            label="Fuente de la letra"
            value={prefs.lyricFont}
            onChange={(lyricFont) => set({ lyricFont })}
            options={[['same', 'La de la vista'], ...Object.entries(FONTS).map(([k, f]) => [k, f.label])]}
          />
          <Options
            label="Grosor de la letra"
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
          <Options
            label="Color de la letra"
            value={prefs.lyricColor}
            onChange={(lyricColor) => set({ lyricColor })}
            options={[
              ['white', 'Blanco'],
              ['accent', 'Color de acento'],
            ]}
          />
          <Options
            label="Tamaño de la letra"
            value={prefs.lyricSize}
            onChange={(lyricSize) => set({ lyricSize })}
            options={[
              ['s', 'Pequeña'],
              ['m', 'Mediana'],
              ['l', 'Grande'],
            ]}
          />
          {prefs.lyrics === 'side' && (
            <Options
              label="Alineación de la letra"
              value={prefs.lyricAlign}
              onChange={(lyricAlign) => set({ lyricAlign })}
              options={[
                ['left', 'Izquierda'],
                ['center', 'Centrada'],
              ]}
            />
          )}
          <Slider
            label="Sincronía de la letra"
            value={prefs.lyricOffset}
            min={-2000}
            max={2000}
            step={100}
            format={(v) => (v === 0 ? 'exacta' : `${v > 0 ? '+' : '−'}${(Math.abs(v) / 1000).toFixed(1)} s ${v > 0 ? 'antes' : 'después'}`)}
            onChange={(lyricOffset) => set({ lyricOffset })}
          />
        </>
      )}

      <h4 className="opt-group">Canvas y fondo</h4>
      <Options
        label="Canvas"
        value={prefs.canvas}
        onChange={(c) => set({ canvas: c })}
        options={[
          ['none', 'Desactivado'],
          ['background', 'Fondo'],
          ['cover', 'Portada'],
          ['both', 'Ambos'],
          ['portrait', 'Retrato 9:16'],
        ]}
      />
      <p className="opt-hint">
        {prefs.canvas === 'none'
          ? 'Canvas desactivado: se muestra la portada.'
          : !isTrack
            ? 'Solo las canciones tienen Canvas.'
            : canvasError
              ? 'El servicio de Canvas no responde ahora mismo: se muestra la portada.'
              : canvas
                ? 'Esta canción tiene Canvas.'
                : 'Esta canción no tiene Canvas: se usa la portada.'}
        {canvasError && prefs.canvas !== 'none' && isTrack && (
          <>
            {' '}
            <button type="button" className="lyrics-fix" onClick={onRetryCanvas}>
              Reintentar
            </button>
          </>
        )}
      </p>
      {prefs.canvas === 'portrait' && (
        <Options
          label="Posición en modo retrato"
          value={prefs.portraitPos}
          onChange={(portraitPos) => set({ portraitPos })}
          options={[
            ['left', 'Izquierda'],
            ['center', 'Centro'],
          ]}
        />
      )}
      <Options
        label="Fondo"
        value={prefs.bg}
        onChange={(bg) => set({ bg })}
        options={[
          ['cover', 'Portada difuminada'],
          ['artist', 'Foto del artista'],
          ['gradient', 'Degradado'],
          ['solid', 'Color liso'],
        ]}
      />
      {['background', 'both'].includes(prefs.canvas) && <p className="opt-hint">Si la canción tiene Canvas, el fondo es el Canvas.</p>}
      <Slider label="Desenfoque del fondo (portada)" value={prefs.blur} max={120} onChange={(blur) => set({ blur })} />
      <Slider label="Desenfoque del fondo (Canvas)" value={prefs.canvasBlur} max={60} onChange={(canvasBlur) => set({ canvasBlur })} />
      <Slider label="Oscurecer el fondo" value={prefs.dim} max={80} format={(v) => `${v} %`} onChange={(dim) => set({ dim })} />
      <Toggle label="Fondo que respira (colores de la portada)" value={prefs.breathe} onChange={(breathe) => set({ breathe })} />
      {prefs.breathe && (
        <Options
          label="Velocidad del fondo que respira"
          value={prefs.breatheSpeed}
          onChange={(breatheSpeed) => set({ breatheSpeed })}
          options={[
            ['slow', 'Lenta'],
            ['normal', 'Normal'],
            ['fast', 'Rápida'],
          ]}
        />
      )}

      <h4 className="opt-group">Pantalla en reposo</h4>
      <Options
        label="Modo reloj"
        value={prefs.clockAfter}
        onChange={(clockAfter) => set({ clockAfter })}
        options={[
          [0, 'Nunca'],
          [1, 'Tras 1 min'],
          [3, 'Tras 3 min'],
          [5, 'Tras 5 min'],
          [10, 'Tras 10 min'],
        ]}
      />
      <p className="opt-hint">Sin tocar nada, se muestra la hora en grande sobre la portada atenuada. Ideal en una segunda pantalla.</p>
      <Toggle label="Ocultar barras sin mover el ratón (3 s)" value={prefs.autoHide} onChange={(autoHide) => set({ autoHide })} />

      <h4 className="opt-group">Interfaz</h4>
      <GlassOption />
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
      <button className="btn" type="button" onClick={() => set({ ...DEFAULTS, panel: 'settings' })}>
        Restablecer ajustes
      </button>
    </div>
  );
}

// Cristal de toda la app (también está en el perfil)
function GlassOption() {
  const { mode, systemReduced, setMode } = useGlassMode();
  return (
    <>
      <Options label="Cristal líquido de la app" value={mode} onChange={setMode} options={GLASS_OPTIONS} />
      {systemReduced && mode === 'auto' && (
        <p className="opt-hint">Tu sistema tiene la transparencia reducida, así que ahora se ve opaco. «Siempre cristal» lo muestra igualmente.</p>
      )}
    </>
  );
}

// Preajustes: los de serie y los tuyos (guardados en el navegador)
function Presets({ prefs, set }) {
  const [mine, setMine] = useState(readPresets);
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
      </div>
      <form className="preset-save" onSubmit={save}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (p. ej. Domingo)" maxLength={24} aria-label="Nombre del preajuste" />
        <button className="btn" type="submit" disabled={!name.trim()}>
          Guardar los ajustes actuales
        </button>
      </form>
    </fieldset>
  );
}
