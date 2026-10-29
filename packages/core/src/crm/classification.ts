import type { StageKey } from './pipeline-templates.js';

/**
 * Classificação automática por regras (Fase 1, sem IA): cada acontecimento leva o cliente
 * para uma etapa, e o cartão só anda para frente. "Perdido" fica de fora: só o dono marca.
 */

export type CrmEventType =
  | 'contact.created'
  | 'faq.viewed'
  | 'appointment.created'
  | 'appointment.done'
  | 'appointment.no_show'
  | 'appointment.cancelled';

export interface StageRef {
  id: string;
  key: string | null;
  position: number;
}

export interface ClassificationInput {
  event: CrmEventType | string;
  stages: readonly StageRef[];
  currentStageId: string | null;
  /** Quantos atendimentos realizados o cliente já tem (contando este). */
  doneCount: number;
}

function targetKey(event: string, doneCount: number): StageKey | null {
  switch (event) {
    case 'contact.created':
      return 'new';
    case 'faq.viewed':
      return 'asked_info';
    case 'appointment.created':
      return 'scheduled';
    case 'appointment.done':
      return doneCount >= 2 ? 'returned' : 'attended';
    default:
      return null;
  }
}

/** Funil padrão (sem agendamento) usa outras etapas para os mesmos acontecimentos. */
const FALLBACK: Partial<Record<StageKey, StageKey>> = {
  asked_info: 'qualified',
  scheduled: 'qualified',
  attended: 'won',
  returned: 'won',
};

/** Devolve a etapa para onde o cliente deve ir, ou null se fica onde está. */
export function classify(input: ClassificationInput): string | null {
  let key = targetKey(input.event, input.doneCount);
  if (!key) return null;

  let target = input.stages.find((s) => s.key === key);
  if (!target && FALLBACK[key]) {
    key = FALLBACK[key]!;
    target = input.stages.find((s) => s.key === key);
  }
  if (!target) return null;

  const current = input.stages.find((s) => s.id === input.currentStageId);
  if (!current) return target.id;
  if (current.key === 'lost') return null;
  return target.position > current.position ? target.id : null;
}
