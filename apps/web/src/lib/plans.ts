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

/**
 * Terceiro cartão da página inicial (pedido do JP em 11/11/2026): sob medida, sem preço, com
 * "Fale conosco". Só promete conversa e ajuste combinado, nada que o sistema ainda não faça.
 */
export const CUSTOM_PLAN = {
  id: 'personalizado' as const,
  name: 'Personalizado',
  lead: 'Para quem precisa de algo sob medida para o próprio jeito de trabalhar.',
  items: [
    'Tudo do Premium',
    'Ajustes combinados com a nexo para o seu negócio',
    'Ajuda para configurar e para ensinar a equipe',
    'Conversa direta com a nexo, sem robô no meio',
  ],
};

/**
 * Para onde vai o "Fale conosco" (link de WhatsApp ou e-mail), definido em VITE_NEXO_CONTATO.
 * Vazio enquanto o canal da nexo não está definido: o botão avisa "contato em breve".
 */
export const NEXO_CONTACT_URL: string = (import.meta.env.VITE_NEXO_CONTATO ?? '').trim();
