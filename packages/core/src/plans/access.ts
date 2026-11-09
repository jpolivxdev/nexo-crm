/**
 * Papéis da equipe e o que cada um acessa (plano Premium). O dono vê tudo; a profissional
 * (STAFF) vê só a própria agenda, como no Básico. Gestor e consultor fazem o dia a dia e
 * entram nas áreas abaixo conforme o dono liga ou desliga em Acessos por papel.
 */
export type TeamRole = 'MANAGER' | 'CONSULTANT' | 'STAFF';

export const TEAM_ROLES: readonly TeamRole[] = ['MANAGER', 'CONSULTANT', 'STAFF'];

/** reports: Resultados e metas · settings: configurações do negócio · privacy: exportar e apagar dados de cliente. */
export type AccessArea = 'reports' | 'settings' | 'privacy';

export const ACCESS_AREAS: readonly AccessArea[] = ['reports', 'settings', 'privacy'];

export type AccessRules = Record<TeamRole, Record<AccessArea, boolean>>;

export const DEFAULT_ACCESS: AccessRules = {
  MANAGER: { reports: true, settings: true, privacy: true },
  CONSULTANT: { reports: true, settings: false, privacy: false },
  STAFF: { reports: false, settings: false, privacy: false },
};

/** Lê as regras guardadas no negócio; o que faltar ou vier errado fica no padrão. */
export function accessRulesOf(saved: unknown): AccessRules {
  const out: AccessRules = {
    MANAGER: { ...DEFAULT_ACCESS.MANAGER },
    CONSULTANT: { ...DEFAULT_ACCESS.CONSULTANT },
    STAFF: { ...DEFAULT_ACCESS.STAFF },
  };
  if (!saved || typeof saved !== 'object') return out;
  for (const role of TEAM_ROLES) {
    const row = (saved as Record<string, unknown>)[role];
    if (!row || typeof row !== 'object') continue;
    for (const area of ACCESS_AREAS) {
      const value = (row as Record<string, unknown>)[area];
      if (typeof value === 'boolean') out[role][area] = value;
    }
  }
  return out;
}

/** Áreas que o papel acessa. Dono: todas. Papel desconhecido: nenhuma. */
export function areasFor(role: string, rules: AccessRules): AccessArea[] {
  if (role === 'OWNER') return [...ACCESS_AREAS];
  if (!(TEAM_ROLES as string[]).includes(role)) return [];
  return ACCESS_AREAS.filter((area) => rules[role as TeamRole][area]);
}
