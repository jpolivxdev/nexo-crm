/**
 * O que cada plano libera. Desde 09/11/2026 são dois planos à venda (decisão do JP):
 * COMPLETE é o Básico e PREMIUM é o Premium. FREE e CRM ficam do tempo dos três planos, sem
 * cliente, até sair. Preços e limites: [A DEFINIR com o Coca].
 * Clientes, ficha, etapas e "a fazer" valem para todos; o resto depende do plano.
 */
export type PlanId = 'FREE' | 'CRM' | 'COMPLETE' | 'PREMIUM';

/**
 * team_roles: gestor e consultor na equipe, Acessos por papel e verificação obrigatória.
 * crm_plus: CRM completo (vários funis, campanhas, campos próprios, previsão, tarefas da equipe).
 * contacts_plus: importar e exportar clientes e a Carteira (quem volta e quem está em risco).
 */
export type Feature =
  'report' | 'agenda' | 'bot' | 'reminders' | 'team_roles' | 'crm_plus' | 'contacts_plus';

const BASIC: readonly Feature[] = ['report', 'agenda', 'bot', 'reminders'];
const PREMIUM: readonly Feature[] = ['team_roles', 'crm_plus', 'contacts_plus'];

export const PLAN_FEATURES: Record<PlanId, readonly Feature[]> = {
  FREE: [],
  CRM: ['report'],
  COMPLETE: BASIC,
  PREMIUM: [...BASIC, ...PREMIUM],
};

export const FEATURES: readonly Feature[] = [...BASIC, ...PREMIUM];

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
