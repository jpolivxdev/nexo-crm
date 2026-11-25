import {
  GLASS_LIMITS,
  GLASS_PRESETS,
  type GlassPreset,
  type GlassSettings,
  matchPreset,
  resetGlass,
  setGlass,
  useGlass,
} from '../lib/glass';

const GLASS_PRESET_LABEL: Record<GlassPreset, string> = {
  transparente: 'Transparente',
  fosco: 'Fosco',
  solido: 'Sólido',
};

type GlassKnob = Exclude<keyof GlassSettings, 'on'>;

const GLASS_KNOBS: {
  key: GlassKnob;
  label: string;
  hint: string;
  show: (v: number) => string;
}[] = [
  {
    key: 'blur',
    label: 'Desfoque',
    hint: 'Quanto o fundo fica embaçado atrás dos cartões.',
    show: (v) => `${v} px`,
  },
  {
    key: 'opacity',
    label: 'Cobertura',
    hint: 'Mais cobertura deixa o cartão mais sólido e o texto mais firme.',
    show: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'saturation',
    label: 'Cor do fundo',
    hint: 'Deixa as cores de trás mais vivas.',
    show: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'edge',
    label: 'Brilho da borda',
    hint: 'A linha clara em volta de cada cartão.',
    show: (v) => `${Math.round(v * 100)}%`,
  },
];

/** Vidro do painel: ligar, escolher um modelo pronto ou ajustar à mão. Vale só neste aparelho. */
export function GlassControls({ compact = false }: { compact?: boolean }) {
  const glass = useGlass();
  const preset = matchPreset(glass);
  return (
    <div
      className="glass-controls"
      role="group"
      aria-labelledby={compact ? 'vidro-janela' : 'vidro'}
    >
      <div className="glass-controls__head">
        <div>
          <h3 id={compact ? 'vidro-janela' : 'vidro'}>Efeito de vidro</h3>
          <p className="muted small">
            Barra, menu e cartões translúcidos sobre um fundo com as cores da nexo.
          </p>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={glass.on}
            aria-label="Efeito de vidro"
            onChange={(e) => setGlass({ on: e.target.checked })}
          />
          <span aria-hidden="true" />
        </label>
      </div>
      {glass.on && (
        <>
          <div className="segmented" role="group" aria-label="Modelos de vidro">
            {(Object.keys(GLASS_PRESETS) as GlassPreset[]).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={preset === id}
                className={preset === id ? 'on' : ''}
                onClick={() => setGlass(GLASS_PRESETS[id])}
              >
                {GLASS_PRESET_LABEL[id]}
              </button>
            ))}
          </div>
          <details open={compact || undefined}>
            <summary>Ajustar à mão</summary>
            <div className="glass-controls__sliders">
              {GLASS_KNOBS.map((k) => {
                const id = `vidro-${compact ? 'j-' : ''}${k.key}`;
                const lim = GLASS_LIMITS[k.key];
                return (
                  <div key={k.key} className="glass-slider">
                    <div className="glass-slider__top">
                      <label htmlFor={id}>{k.label}</label>
                      <output htmlFor={id}>{k.show(glass[k.key])}</output>
                    </div>
                    <input
                      id={id}
                      type="range"
                      min={lim.min}
                      max={lim.max}
                      step={lim.step}
                      value={glass[k.key]}
                      aria-describedby={`${id}-dica`}
                      aria-valuetext={k.show(glass[k.key])}
                      onChange={(e) => setGlass({ [k.key]: Number(e.target.value) })}
                    />
                    <small id={`${id}-dica`}>{k.hint}</small>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={resetGlass}
            >
              Voltar ao padrão
            </button>
          </details>
        </>
      )}
    </div>
  );
}
