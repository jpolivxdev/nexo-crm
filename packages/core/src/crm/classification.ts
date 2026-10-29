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

/**
 * Acontecimentos que a dona pode ligar a uma etapa ("se X, colocar em Y").
 * "appointment.returned" é o realizado da 2ª vez em diante.
 */
export const RULE_EVENTS = [
  'contact.created',
  'faq.viewed',
  'appointment.created',
  'appointment.confirmed',
  'appointment.done',
  'appointment.returned',
  'appointment.no_show',
  'appointment.cancelled',
  'handoff.requested',
  'contact.opted_out',
] as const;
export type RuleEvent = (typeof RULE_EVENTS)[number];

/** Regra da dona. stageId null = "não mexer na etapa" (desliga a regra padrão). */
export interface StageRule {
  event: RuleEvent;
  stageId: string | null;
}

export interface ClassificationInput {
  event: CrmEventType | string;
  stages: readonly StageRef[];
  currentStageId: string | null;
  /** Quantos atendimentos realizados o cliente já tem (contando este). */
  doneCount: number;
  /** Regras da dona. Valem antes das padrão e podem mover para qualquer etapa. */
  rules?: readonly StageRule[];
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

/** Evento de regra: o realizado da 2ª vez em diante vira "appointment.returned". */
export function ruleEventOf(event: string, doneCount: number): string {
  return event === 'appointment.done' && doneCount >= 2 ? 'appointment.returned' : event;
}

/** Etapa para onde a regra padrão leva, para mostrar na tela ("Padrão: Agendou"). */
export function defaultStageFor(event: RuleEvent, stages: readonly StageRef[]): string | null {
  if (event === 'appointment.returned') {
    return defaultTarget('appointment.done', 2, stages);
  }
  return defaultTarget(event, 1, stages);
}

function defaultTarget(event: string, doneCount: number, stages: readonly StageRef[]) {
  let key = targetKey(event, doneCount);
  if (!key) return null;
  let target = stages.find((s) => s.key === key);
  if (!target && FALLBACK[key]) {
    key = FALLBACK[key]!;
    target = stages.find((s) => s.key === key);
  }
  return target?.id ?? null;
}

/** Devolve a etapa para onde o cliente deve ir, ou null se fica onde está. */
export function classify(input: ClassificationInput): string | null {
  const ruleEvent = ruleEventOf(input.event, input.doneCount);
  const rule =
    input.rules?.find((r) => r.event === ruleEvent) ??
    // Sem regra própria para "voltou", vale a de "foi atendida".
    (ruleEvent === 'appointment.returned'
      ? input.rules?.find((r) => r.event === 'appointment.done')
      : undefined);
  if (rule) {
    if (rule.stageId === null) return null;
    const target = input.stages.find((s) => s.id === rule.stageId);
    // Regra para etapa que não existe mais: segue a padrão.
    if (target) return target.id === input.currentStageId ? null : target.id;
  }

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
