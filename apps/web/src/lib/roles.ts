/** Papéis da equipe e áreas liberadas por papel (Premium). Espelha @nexo/core. */
export type TeamRole = 'MANAGER' | 'CONSULTANT' | 'STAFF';
export type AccessArea = 'reports' | 'settings' | 'privacy';
export type AccessRules = Record<TeamRole, Record<AccessArea, boolean>>;

export const ROLE_LABEL: Record<TeamRole, string> = {
  MANAGER: 'Gestor',
  CONSULTANT: 'Consultor',
  STAFF: 'Profissional',
};

export const ROLE_HINT: Record<TeamRole, string> = {
  MANAGER: 'Cuida do negócio com você: dia a dia e as áreas que você liberar.',
  CONSULTANT: 'Atende clientes: agenda, conversas, clientes e etapas.',
  STAFF: 'Vê e marca só a própria agenda.',
};

export const TEAM_ROLES: TeamRole[] = ['MANAGER', 'CONSULTANT', 'STAFF'];

export const AREAS: { id: AccessArea; label: string; hint: string }[] = [
  { id: 'reports', label: 'Resultados e metas', hint: 'Números do mês, faturamento e metas.' },
  {
    id: 'settings',
    label: 'Configurações do negócio',
    hint: 'Serviços, horários, mensagens do robô, avisos, folgas e regras das etapas.',
  },
  {
    id: 'privacy',
    label: 'Dados pessoais das clientes',
    hint: 'Baixar ou apagar os dados de uma cliente.',
  },
];
