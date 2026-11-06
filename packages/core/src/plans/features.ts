/**
 * O que cada plano libera. Divisão pedida pelo Jandoza em 27/10/2026: Grátis (CRM básico),
 * CRM e Completo (CRM + agenda + robô). Preços e limites: [A DEFINIR com o Coca].
 * Clientes, ficha, etapas e "a fazer" valem para todos; o resto depende do plano.
 */
export type PlanId = 'FREE' | 'CRM' | 'COMPLETE';

export type Feature = 'report' | 'agenda' | 'bot' | 'reminders';

export const PLAN_FEATURES: Record<PlanId, readonly Feature[]> = {
  FREE: [],
  CRM: ['report'],
  COMPLETE: ['report', 'agenda', 'bot', 'reminders'],
};

export const FEATURES: readonly Feature[] = ['report', 'agenda', 'bot', 'reminders'];

const isFeature = (value: string): value is Feature => (FEATURES as string[]).includes(value);

/** Recursos do negócio: os do plano mais os liberados à parte (feature flags). */
export function featuresOf(plan: PlanId, extra: readonly string[] = []): Feature[] {
  const all = new Set<Feature>(PLAN_FEATURES[plan]);
  for (const f of extra) if (isFeature(f)) all.add(f);
  return FEATURES.filter((f) => all.has(f));
}

export function hasFeature(plan: PlanId, extra: readonly string[], feature: Feature): boolean {
  return featuresOf(plan, extra).includes(feature);
}
