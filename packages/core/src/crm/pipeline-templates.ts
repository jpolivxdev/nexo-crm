/**
 * Modelos de etapas (funil) por nicho. Os nomes aparecem na tela do dono,
 * por isso ficam em português e no vocabulário do glossário (CLAUDE.md, seção 5).
 */
export type StageKind = 'OPEN' | 'WON' | 'LOST';

export interface StageTemplate {
  name: string;
  kind: StageKind;
}

export interface PipelineTemplate {
  name: string;
  stages: readonly StageTemplate[];
}

/** Funil padrão, para negócios que vendem orçamento ou proposta. */
export const DEFAULT_PIPELINE: PipelineTemplate = {
  name: 'Atendimentos',
  stages: [
    { name: 'Novo contato', kind: 'OPEN' },
    { name: 'Qualificado', kind: 'OPEN' },
    { name: 'Orçamento', kind: 'OPEN' },
    { name: 'Negociação', kind: 'OPEN' },
    { name: 'Fechado', kind: 'WON' },
    { name: 'Perdido', kind: 'LOST' },
  ],
};

/** Funil para negócios de agendamento (salão, cílios, barbearia, estúdio). */
const BEAUTY_PIPELINE: PipelineTemplate = {
  name: 'Atendimentos',
  stages: [
    { name: 'Novo contato', kind: 'OPEN' },
    { name: 'Pediu informação', kind: 'OPEN' },
    { name: 'Agendou', kind: 'OPEN' },
    { name: 'Atendido', kind: 'WON' },
    { name: 'Voltou', kind: 'WON' },
    { name: 'Não seguiu', kind: 'LOST' },
  ],
};

const TEMPLATES_BY_NICHE: Record<string, PipelineTemplate> = {
  cilios: BEAUTY_PIPELINE,
  salao: BEAUTY_PIPELINE,
  barbearia: BEAUTY_PIPELINE,
  estudio: BEAUTY_PIPELINE,
};

/** Modelo do nicho, ou o padrão quando o nicho não tem modelo próprio. */
export function pipelineTemplateFor(niche: string): PipelineTemplate {
  return TEMPLATES_BY_NICHE[niche.trim().toLowerCase()] ?? DEFAULT_PIPELINE;
}
