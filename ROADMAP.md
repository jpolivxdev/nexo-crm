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
| E4 | Robô (máquina de estados pura) | Teste para cada estado e transição | Feita (PR #9, juntado em 29/10/2026) |
| E5 | Canal: interface + adaptador simulado + simulador + webhook da Cloud API | Testes com payloads simulados; ponta a ponta real depende de E0 | Feita (PR #9, juntado em 29/10/2026) |
| E6 | CRM básico: contato automático, histórico, eventos, funil, classificação | Conversa simulada gera ficha e etapa certas | Feita (PR #9, juntado em 29/10/2026) |
| E7 | Passar para a equipe, "parar", fora do horário | Testes + aviso ao dono | Feita (PR #9, juntado em 29/10/2026; aviso pelo WhatsApp da dona depende de E0) |
| E8 | Painel do dono (PWA): login, hoje, agenda, ficha, etapas, tempo real | 360 px, agendamento em até 5 s, acessibilidade | Feita (PR #9, juntado em 29/10/2026) |
| E9 | Onboarding guiado + admin nexo + cronômetro | Negócio demo criado com tempo medido | Feita (PR #10, juntado em 29/10/2026) |
| E10 | Lembretes 24h e 1h com confirmar/cancelar | Testes com relógio simulado | Feita (PR #12, juntado em 29/10/2026; no WhatsApp real depende das mensagens de modelo da E0) |
| E11 | Relatório mínimo, deploy, relatório de custo e onboarding | Definição de pronto da Fase 1 | Feita (PR #13, juntado em 29/10/2026; falta escolher a hospedagem e medir o onboarding com a piloto) |
| E12 | Página de entrada, criar conta com confirmação de e-mail, esqueci a senha | Fluxo completo testado (API e telas) | Feita (PR #13, juntado em 29/10/2026; envio de e-mail em produção depende do provedor) |
| E13 | Direitos da cliente (LGPD): baixar e excluir os dados pela ficha | Testes de API (exportar, excluir, isolamento, CSRF) e de tela | Feita (PR #15, juntado em 29/10/2026) |
| E14 | Folgas e bloqueios pela tela (Agenda → Folgas) | Horários somem e voltam; aviso de horários já marcados | Feita (PR #15, juntado em 29/10/2026) |
| E15 | Mensagens do robô editáveis (Conta → Mensagens do robô) | Regras no @nexo/core com teste; API e tela testadas | Feita (PR #15, juntado em 29/10/2026) |
| E18 | Gatilho de fechamento: realizado sem próximo horário vira "a fazer" | Teste de API (cria uma vez; não cria se já marcou) | Feita (PR #15, juntado em 29/10/2026) |
| E17 | Visões de clientes: frequentes, sumidas e faltosas (Clientes) | Regras testadas na API, isolamento e tela | Feita (PR #15, juntado em 29/10/2026) |
| E16 | Regras de etapa da dona (Etapas → Regras automáticas) | Regras no @nexo/core com teste; faltou → "Não seguiu" testado ponta a ponta | Feita (PR #15, juntado em 29/10/2026) |
| E19 | Várias profissionais (Conta → Equipe) e acesso de cada uma só à própria agenda | Testes de API (cópia de serviços e horários, só a própria agenda, tirar acesso) e de tela | Feita (PR #16, juntado em 29/10/2026) |
| E20 | Avisos para a dona (tela, notificação do aparelho e e-mail opcional) e prazo do "oferecer o próximo horário" (Conta → Avisos) | Testes de API (aviso só do que a cliente fez, e-mail sem dado da cliente, prazo e fechamento sozinho) e de tela | Em revisão (PR #17) |

Falta na Fase 1 (conferência do PROMPT 1 em 27/10/2026, previsão ~19 h de código):
1. ~~Exportar e excluir dados de uma cliente (LGPD), obrigatório antes do piloto.~~ Feito na E13 (29/10/2026).
2. ~~Tela de folgas e bloqueios (a agenda já respeita).~~ Feito na E14 (29/10/2026).
3. ~~Tela para a dona editar as mensagens do robô (o robô já aceita).~~ Feito na E15 (29/10/2026).
4. ~~Regras de etapa criadas pela dona ("se X, colocar em Y").~~ Feito na E16 (29/10/2026).
5. ~~Visão de clientes frequentes, sumidas e faltosas.~~ Feito na E17 (29/10/2026).
6. ~~Gatilho de fechamento por regra (realizado → "a fazer" de oferecer o próximo horário).~~ Feito na E18 (29/10/2026).
7. ~~Mais de uma profissional no assistente e login da profissional.~~ Feito na E19 (29/10/2026), em Conta → Equipe.
8. ~~Aviso à dona de novo horário/cancelamento~~ Feito na E20 (29/10/2026). Lembrete por e-mail para a cliente final: em aberto (ela não tem e-mail no cadastro; ver PENDENCIAS.md).
9. ~~REFERENCIAS.md.~~ Feito em 29/10/2026. As ideias aproveitáveis (ação por etapa, selo "parado há X dias", origem do contato, selo de demonstração, pontuação explicada) ficam para as fases 2 e 3, só com pedido real.
10. Checklist de segurança e backup com restauração (depende da hospedagem).
11. Provedor de e-mail de produção (depende da escolha).
12. WhatsApp real com a Cloud API e mensagens de modelo (depende da Meta).

Portão: a piloto usa por 2 a 4 semanas com clientes reais. Medir agendamentos pelo robô, faltas, passagens para a equipe e pedidos.

## Fase 2: Retenção

M5 (retornos, pós-venda, cobrança), link público de agendamento, Google Calendar bidirecional, kanban arrastável, etiquetas, etapas personalizáveis.

Observação: para estúdio de cílios, o lembrete de manutenção (a cada 2 a 4 semanas) pode valer mais que o funil. Candidato a antecipar.

Portão: 3 ou mais negócios ativos pedindo.

## Fase 3: IA paga

M8 completo, com assinatura, limite e registro de custo. Portão: clientes dispostos a pagar, preço definido pelo Coca.

## Fase 4: Expansão

M6 (e-mail, VoIP), M7 (gamificação), M10 (demais integrações), M11 (operação da equipe). Portão: demanda comprovada.
