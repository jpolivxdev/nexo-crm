import { RULE_EVENTS, type StageRule } from '@nexo/core';
import { z } from 'zod';

export const stageRulesSchema = z
  .array(z.object({ event: z.enum(RULE_EVENTS), stageId: z.uuid().nullable() }))
  .max(RULE_EVENTS.length)
  .refine((rules) => new Set(rules.map((r) => r.event)).size === rules.length, {
    message: 'Cada acontecimento só pode ter uma regra.',
  });

/** Regras vêm do banco como JSON: valida antes de usar e ignora o que vier torto. */
export function readStageRules(raw: unknown): StageRule[] {
  const parsed = stageRulesSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}
