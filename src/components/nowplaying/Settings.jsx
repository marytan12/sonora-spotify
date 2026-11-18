import { ACCENTS, DEFAULTS, ELEMENTS, FONTS } from './prefs.js';

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
      <Options
        label="Letra"
        value={prefs.lyrics}
        onChange={(lyrics) => set({ lyrics, panel: lyrics === 'side' ? 'lyrics' : prefs.panel })}
        options={[
          ['side', 'En el panel'],
          ['cover', 'Sobre la portada'],
          ['line', 'Una línea en la portada'],
          ['none', 'Ocultar'],
        ]}
      />
      {prefs.lyrics !== 'none' && (
        <>
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
      <Slider label="Desenfoque del fondo (portada)" value={prefs.blur} max={120} onChange={(blur) => set({ blur })} />
      <Slider label="Desenfoque del fondo (Canvas)" value={prefs.canvasBlur} max={60} onChange={(canvasBlur) => set({ canvasBlur })} />
      <Slider label="Oscurecer el fondo" value={prefs.dim} max={80} format={(v) => `${v} %`} onChange={(dim) => set({ dim })} />
      <Toggle label="Fondo que respira (colores de la portada)" value={prefs.breathe} onChange={(breathe) => set({ breathe })} />
      <Toggle label="Ocultar barras sin mover el ratón (3 s)" value={prefs.autoHide} onChange={(autoHide) => set({ autoHide })} />
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
