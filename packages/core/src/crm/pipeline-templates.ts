/**
 * Modelos de etapas (funil) por nicho. Os nomes aparecem na tela do dono,
 * por isso ficam em português e no vocabulário do glossário (CLAUDE.md, seção 5).
 */
export type StageKind = 'OPEN' | 'WON' | 'LOST';

/** Chave fixa da etapa, usada pelas regras (o dono pode renomear a etapa sem quebrar nada). */
export type StageKey =
  | 'new'
  | 'asked_info'
  | 'scheduled'
  | 'attended'
  | 'returned'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost';

export interface StageTemplate {
  key: StageKey;
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
    { key: 'new', name: 'Novo contato', kind: 'OPEN' },
    { key: 'qualified', name: 'Qualificado', kind: 'OPEN' },
    { key: 'proposal', name: 'Orçamento', kind: 'OPEN' },
    { key: 'negotiation', name: 'Negociação', kind: 'OPEN' },
    { key: 'won', name: 'Fechado', kind: 'WON' },
    { key: 'lost', name: 'Perdido', kind: 'LOST' },
  ],
};

/** Funil para negócios de agendamento (salão, cílios, barbearia, estúdio). */
const BEAUTY_PIPELINE: PipelineTemplate = {
  name: 'Atendimentos',
  stages: [
    { key: 'new', name: 'Novo contato', kind: 'OPEN' },
    { key: 'asked_info', name: 'Pediu informação', kind: 'OPEN' },
    { key: 'scheduled', name: 'Agendou', kind: 'OPEN' },
    { key: 'attended', name: 'Atendido', kind: 'WON' },
    { key: 'returned', name: 'Voltou', kind: 'WON' },
    { key: 'lost', name: 'Não seguiu', kind: 'LOST' },
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
