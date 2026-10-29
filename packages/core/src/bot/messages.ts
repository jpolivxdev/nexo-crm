/**
 * Mensagens padrão do robô, no tom da nexo: frases curtas, "você", sempre com um próximo passo.
 * O dono pode trocar qualquer uma pelo painel (Tenant.botMessages). Variáveis entre chaves.
 */
export const DEFAULT_MESSAGES = {
  privacyNotice:
    'Oi! Aqui é o atendimento automático do {negocio}. Usamos seu nome e telefone só para cuidar dos seus horários. Para parar de receber mensagens, é só escrever "parar".',
  menu: 'Como posso ajudar? Escolha uma opção.',
  menuBook: 'Marcar horário',
  menuMine: 'Meus horários',
  menuFaq: 'Dúvidas',
  menuHuman: 'Falar com {dona}',
  chooseService: 'Qual serviço você quer marcar?',
  noServices: 'Ainda não há serviços para marcar por aqui. Toque abaixo para falar com {dona}.',
  chooseProfessional: 'Com quem você prefere?',
  anyProfessional: 'Tanto faz',
  chooseDate: 'Qual dia fica melhor para {servico}?',
  noDates: 'Não encontrei horários livres nos próximos dias. Quer falar com {dona}?',
  chooseTime: 'Horários livres em {data}. Qual você prefere?',
  noTimes: 'Esse dia acabou de lotar. Escolha outro dia.',
  confirm: 'Confirma {servico} em {data} às {hora}?',
  confirmYes: 'Confirmar',
  confirmOtherTime: 'Outro horário',
  booked:
    'Pronto! Seu horário está marcado: {servico}, {data} às {hora}. Para remarcar ou cancelar, escreva "menu".',
  slotTaken: 'Puxa, esse horário acabou de ser ocupado. Escolha outro.',
  mineEmpty: 'Você não tem horários marcados. Quer marcar um?',
  mineList: 'Seus próximos horários. Escolha um para remarcar ou cancelar.',
  manage: '{servico} em {data} às {hora}. O que você quer fazer?',
  manageReschedule: 'Remarcar',
  manageCancel: 'Cancelar',
  manageBack: 'Voltar',
  cancelConfirm: 'Cancelar {servico} em {data} às {hora}?',
  cancelYes: 'Sim, cancelar',
  cancelNo: 'Não',
  cancelled: 'Horário cancelado. Quando quiser marcar de novo, escreva "menu".',
  rescheduled: 'Pronto! Seu horário foi remarcado para {data} às {hora}.',
  faqList: 'Escolha sua dúvida.',
  faqEmpty: 'Por enquanto não temos dúvidas cadastradas. Quer falar com {dona}?',
  handoff: 'Certo! Avisei {dona}, que vai continuar a conversa por aqui.',
  handoffClosed:
    'Certo! Avisei {dona}. Agora estamos fora do horário de atendimento, então a resposta vem no próximo horário.',
  optOut:
    'Tudo bem, você não vai mais receber mensagens automáticas. Se mudar de ideia, escreva "oi".',
  notUnderstood: 'Não entendi. Escolha uma das opções abaixo.',
  more: 'Ver mais',
} as const;

export type MessageKey = keyof typeof DEFAULT_MESSAGES;
export type MessageOverrides = Partial<Record<MessageKey, string>>;

/** Troca {variavel} pelo valor. Variável desconhecida fica como está, para o erro aparecer no teste. */
export function render(
  key: MessageKey,
  vars: Record<string, string>,
  overrides: MessageOverrides = {},
): string {
  const template = overrides[key]?.trim() || DEFAULT_MESSAGES[key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}
