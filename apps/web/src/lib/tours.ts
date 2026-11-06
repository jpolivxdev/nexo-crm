/**
 * Tour guiado de cada tela: o caminho das coisas, em poucos passos. Textos escritos pela nexo.
 * `target` é um seletor CSS; vale o primeiro elemento visível. Sem alvo (ou alvo fora da tela,
 * como o menu lateral no celular), o passo aparece no meio da tela.
 */
export interface TourStep {
  target?: string;
  title: string;
  text: string;
}

/** Menu: lateral no computador, barra de baixo no celular. */
const MENU = '.sidebar__nav, .tabbar';

const HOJE: TourStep[] = [
  {
    title: 'Boas-vindas',
    text: 'Em menos de um minuto a gente mostra onde fica cada coisa. Dá para pular quando quiser e rever depois pela bússola lá em cima.',
  },
  {
    target: MENU,
    title: 'O menu',
    text: 'Todas as partes do painel ficam aqui: agenda, clientes, etapas e resultados.',
  },
  {
    target: '[data-tour="resumo"]',
    title: 'O resumo do dia',
    text: 'Quantos horários você tem hoje, quem está esperando resposta, o que falta fazer e o que já foi realizado.',
  },
  {
    target: '[aria-labelledby="horarios"]',
    title: 'Horários de hoje',
    text: 'Cada horário marcado aparece aqui. Marque realizado ou faltou com um toque.',
  },
  {
    target: '[data-tour="avisos"]',
    title: 'Avisos',
    text: 'O sino mostra o que as clientes fizeram pelo WhatsApp: marcou, remarcou, cancelou ou pediu para falar com você.',
  },
  {
    target: '[data-tour="conta"]',
    title: 'Sua conta',
    text: 'Senha, tema claro ou escuro, equipe, mensagens do robô e configurações do negócio.',
  },
  {
    target: '[data-tour="nex"]',
    title: 'Nex, guia de uso',
    text: 'Ficou com dúvida de onde fica alguma coisa? Toque aqui e o Nex mostra o caminho.',
  },
];

const AGENDA: TourStep[] = [
  {
    target: '.page-header__actions',
    title: 'Marcar um horário',
    text: 'Em "Marcar horário" você agenda uma cliente por aqui. Em "Folgas" você fecha dias ou horários em que não vai atender.',
  },
  {
    target: '.segmented',
    title: 'Dia, semana ou mês',
    text: 'Escolha como quer ver a agenda. No mês, toque num dia para ver os horários dele.',
  },
  {
    target: 'main .section, main .month',
    title: 'Os horários',
    text: 'Tudo que o robô marcou pelo WhatsApp aparece aqui sozinho, junto com o que você marcou.',
  },
];

const CLIENTES: TourStep[] = [
  {
    target: '.page-header__actions',
    title: 'Nova cliente',
    text: 'Quem chama no WhatsApp entra sozinha. Para cadastrar alguém na mão, use "Nova cliente".',
  },
  {
    target: '.search',
    title: 'Buscar',
    text: 'Encontre uma cliente pelo nome ou pelo telefone.',
  },
  {
    target: '.segmented',
    title: 'Frequentes, sumidas e faltosas',
    text: 'Separa quem vem sempre, quem sumiu e quem costuma faltar, para você saber quem chamar de volta.',
  },
];

const ETAPAS: TourStep[] = [
  {
    target: '.board',
    title: 'As etapas',
    text: 'Cada coluna é uma etapa, do primeiro contato até a cliente voltar. O robô move sozinho conforme a conversa.',
  },
  {
    target: '.board .deal',
    title: 'Mudar de etapa',
    text: 'Use o botão do cartão para passar a cliente para a próxima etapa. No computador também dá para arrastar.',
  },
  {
    target: '.page-header__actions',
    title: 'Regras automáticas',
    text: 'Aqui você cria regras do tipo "se a cliente faltou, colocar em tal etapa".',
  },
];

const RESULTADOS: TourStep[] = [
  {
    target: '.segmented',
    title: 'Escolha o período',
    text: 'Troque o período e todos os números de baixo mudam na hora.',
  },
  {
    target: 'main .section',
    title: 'Seus números',
    text: 'Horários marcados pelo robô, faltas, clientes novas e quem voltou. Só números do seu negócio, nada inventado.',
  },
];

export const TOURS: Record<string, TourStep[]> = {
  '/hoje': HOJE,
  '/agenda': AGENDA,
  '/clientes': CLIENTES,
  '/etapas': ETAPAS,
  '/resultados': RESULTADOS,
};

/** Tour da tela, ou o geral (Hoje) quando a tela ainda não tem um próprio. */
export function tourFor(section: string): TourStep[] {
  return TOURS[section] ?? HOJE;
}

const SEEN_KEY = 'nexo-tour-visto';

/** O tour geral abre sozinho uma vez por aparelho. */
export function tourSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export function markTourSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // sem armazenamento: o tour pode abrir de novo na próxima visita
  }
}
