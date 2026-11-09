/**
 * Os dois planos (decisão do JP em 09/11/2026), usados na página inicial e em Plano e assinatura.
 * Preço ainda [A DEFINIR] com o Coca: nenhuma tela mostra valor inventado. O Premium está em
 * construção e só lista o que está planejado.
 */
export interface PlanInfo {
  id: 'basico' | 'premium';
  name: string;
  lead: string;
  items: string[];
}

export const BASIC_PLAN: PlanInfo = {
  id: 'basico',
  name: 'Básico',
  lead: 'Atendimento automático pelo WhatsApp e um painel simples para organizar o dia.',
  items: [
    'Robô que marca, remarca e cancela pelo WhatsApp, 24 horas',
    'Agenda no celular, com folgas e lembretes',
    'Conversas do WhatsApp num lugar só',
    'Clientes e etapas que se organizam sozinhos',
    'Resultados e metas do mês',
    'Nex, guia de uso, e suporte direto com a nexo',
  ],
};

export const PREMIUM_PLAN: PlanInfo = {
  id: 'premium',
  name: 'Premium',
  lead: 'Para quem tem equipe e quer acompanhar metas e receita mais de perto.',
  items: [
    'Tudo do Básico',
    'Vários funis e campos do seu jeito',
    'Painéis com metas e previsão de receita',
    'Importar e exportar clientes',
    'Carteira de clientes: quem está em dia e quem está sumindo',
    'Chat da equipe, Wiki e quadro branco',
    'Sua marca no painel e modelos de mensagem',
    'Acessos por função na equipe',
  ],
};
