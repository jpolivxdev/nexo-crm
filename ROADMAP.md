# Roadmap

Regra: construir o menor produto que resolve uma dor concreta, colocar na mão da cliente-piloto e só avançar com evidência de uso. Detalhe dos módulos em [CLAUDE.md](CLAUDE.md), seção 6.

## Fase 1: MVP piloto (agora, escopo completo)

Módulos: M1 completo, M2 básico, M3 (funil padrão + modelo por nicho + classificação por regras), M4 básico, lembretes de horário, M9 mínimo, painel no celular, multi-negócio.

| Entrega | O que entra | Pronto quando | Situação |
|---|---|---|---|
| E0 | Meta: conta, número da piloto, templates | Mensagem real entregue e 2 templates aprovados | Adiada (decisão do JP em 26/10/2026) |
| E1 | Esqueleto: monorepo, Postgres local, lint, testes, CI, documentação | CI verde e `/health` respondendo | Feita |
| E2 | Banco multi-negócio: Prisma, modelo de dados, RLS, papéis do banco, seed demo | Teste prova que um negócio não vê o outro | Feita |
| E3 | Disponibilidade e agendamento, sem horário duplo | Testes de regras e de concorrência | Feita |
| E4 | Robô (máquina de estados pura) | Teste para cada estado e transição | Em revisão (PR #9) |
| E5 | Canal: interface + adaptador simulado + simulador + webhook da Cloud API | Testes com payloads simulados; ponta a ponta real depende de E0 | Em revisão (PR #9) |
| E6 | CRM básico: contato automático, histórico, eventos, funil, classificação | Conversa simulada gera ficha e etapa certas | Em revisão (PR #9) |
| E7 | Passar para a equipe, "parar", fora do horário | Testes + aviso ao dono | Em revisão (PR #9; aviso pelo WhatsApp da dona depende de E0) |
| E8 | Painel do dono (PWA): login, hoje, agenda, ficha, etapas, tempo real | 360 px, agendamento em até 5 s, acessibilidade | Em revisão (PR #9) |
| E9 | Onboarding guiado + admin nexo + cronômetro | Negócio demo criado com tempo medido | Em revisão (PR da E9) |
| E10 | Lembretes 24h e 1h com confirmar/cancelar | Testes com relógio simulado | Em revisão (PR da E10; no WhatsApp real depende das mensagens de modelo da E0) |
| E11 | Relatório mínimo, deploy, relatório de custo e onboarding | Definição de pronto da Fase 1 | A fazer |

Portão: a piloto usa por 2 a 4 semanas com clientes reais. Medir agendamentos pelo robô, faltas, passagens para a equipe e pedidos.

## Fase 2: Retenção

M5 (retornos, pós-venda, cobrança), link público de agendamento, Google Calendar bidirecional, kanban arrastável, etiquetas, etapas personalizáveis.

Observação: para estúdio de cílios, o lembrete de manutenção (a cada 2 a 4 semanas) pode valer mais que o funil. Candidato a antecipar.

Portão: 3 ou mais negócios ativos pedindo.

## Fase 3: IA paga

M8 completo, com assinatura, limite e registro de custo. Portão: clientes dispostos a pagar, preço definido pelo Coca.

## Fase 4: Expansão

M6 (e-mail, VoIP), M7 (gamificação), M10 (demais integrações), M11 (operação da equipe). Portão: demanda comprovada.
