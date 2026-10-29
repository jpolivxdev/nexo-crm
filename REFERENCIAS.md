# Referências

Análise das referências citadas no PROMPT 1 (seção 6). Servem de inspiração. **Não copiamos tela, texto nem marca de ninguém.** Consulta feita em 29/10/2026.

Legenda: **Fato** é o que está na página. **Opinião** é a nossa leitura para a nexo.

---

## 1. monday CRM

Fonte: https://monday.com/crm/features

**Fato (o que a página lista):**

- Captura de contatos de formulários, eventos, importação e outras ferramentas num painel só.
- Funil visual por etapa e "saúde do negócio", que aponta atendimentos parados.
- Ficha de cliente e conta com o histórico do relacionamento.
- Registro automático de e-mails, ligações, reuniões e mensagens na ficha.
- Sequências de mensagens e "a fazer" de retorno automáticos.
- Automações quando algo acontece (ex.: mudou de etapa).
- Painéis de resultados: conversão do funil, atividade por vendedor, previsão de vendas.
- Orçamentos, cobranças e coleta de assinatura.
- IA: agentes que buscam e qualificam contatos, ligam e preparam reuniões. Assistente que escreve retornos e atualiza o funil. Anotador de reuniões.
- Aplicativo no celular com ligações gravadas e transcritas.
- Mais de 200 integrações e API aberta.

**Opinião (o que serve para a nexo):**

| Ideia do monday | Para a nexo | Onde entra |
|---|---|---|
| Registro automático na ficha | Já fazemos com o WhatsApp: conversa, horário, falta e etapa entram sozinhos (princípio 1). | Fase 1 (feito) |
| Automação ao mudar de etapa | Regras "se X, colocar em Y" já existem. O próximo passo é a ação por etapa, como criar um "a fazer" ou mandar mensagem de modelo. | Fase 2 (M3, M5) |
| Saúde do atendimento (parado há X dias) | Equivale a "sumidas" e "faltosas" nas visões de Clientes. Dá para mostrar um selo "parado há X dias" no card da etapa. | Fase 2 |
| Sequências de retorno | Retornos automáticos pelo WhatsApp, só com mensagem de modelo aprovada e respeitando o "parar". | Fase 2 (M5), depende da Meta |
| Painel de atividade por pessoa | Útil quando o negócio tiver equipe. A piloto trabalha sozinha. | Fase 4 (M11) |
| Orçamento e cobrança | Cobranças pendentes e pacotes. Exige definir o provedor de pagamento. | Fase 2 (M5) |
| Agentes de IA e assistente | Assistente com uma lista fechada de ações e confirmação antes de agir. Nada de ligar ou mandar mensagem sozinho. | Fase 3 (M8) |

**O que não seguir:** o excesso de opções e telas. O monday é feito para equipes de vendas. Nosso público é a dona que atende sozinha e "não quer aprender sistema complicado" (seção 3). Cada ideia daqui entra só com pedido real, e com o jargão traduzido (seção 5).

---

## 2. attendee-lens.lovable.app

Fonte: https://attendee-lens.lovable.app

**Fato:**

- Painel ao vivo das respostas de participantes de um evento ("AI For Business").
- Três abas que separam os contatos por destino ("Leads Capital", "Upgrade Leads", "PCM CRM").
- A página se identifica como **demonstração com dados fictícios**, no topo e no rodapé.
- Na consulta, os dados ainda estavam carregando. Não deu para ver números nem gráficos.

**Opinião:**

- **O selo "demonstração · dados fictícios"** é exatamente o que o princípio 7 pede. Já marcamos o seed como "(demo)". Vale repetir o selo visível no painel quando o negócio for de demonstração.
- **Separar contatos por origem** (evento, Instagram, indicação) é a "captura de várias fontes" do M3. Na Fase 1 a única origem é o WhatsApp. Quando entrar o link público (Fase 2), a origem aparece na ficha e nos Resultados.
- **Atualização ao vivo** já existe no painel (tempo real). Uma ideia barata: mostrar "atualizado agora" para a dona confiar que está vendo o que acabou de acontecer.

---

## 3. icp-aligner.lovable.app

Fonte: https://icp-aligner.lovable.app

**Fato:**

- Painel que pontua inscrições de um formulário contra três perfis de cliente ideal (empresa grande, média e menor).
- Cada perfil tem sinais com peso que somam 100 pontos: faturamento, tamanho da equipe, urgência, nicho, uso de CRM.
- Faixas de pontuação viram uma ação sugerida: abordar já, tratar como quente, qualificar antes.
- Uma aba documenta os perfis e outra lista as inscrições.

**Opinião:**

- **Pontuação explicada** (mostrar quais sinais somaram pontos) combina com "humano no controle". Se um dia classificarmos clientes por pontos, a dona precisa ver o porquê, não só o número.
- Para a piloto, o equivalente simples já existe: **regras de etapa** e **visões** (frequentes, sumidas, faltosas), com o número que explica cada cliente estar ali.
- **Para a própria nexo** (Pedro e Coca na captação): a ideia serve para priorizar quais estabelecimentos abordar, por nicho, tamanho e dor. É uso interno, fora do produto.
- **Cuidado:** as faixas de pontos dos perfis se sobrepõem (ex.: 65 a 80 cabe em dois perfis). Se fizermos algo parecido, as regras precisam ser exclusivas e testadas, como já fazemos com a classificação de etapas.

---

## Resumo

Nada destas referências muda a Fase 1. As ideias que valem a pena entram no `ROADMAP.md` nas fases indicadas e só são construídas com pedido real de cliente (seção 7).

1. Ação automática por etapa
2. Selo "parado há X dias"
3. Origem do contato
4. Selo de demonstração no painel
5. Pontuação explicada
