# Segurança, privacidade e LGPD — nexo CRM

Versão inicial de 26/10/2026, escrita antes de qualquer código de produção. Base: PROMPT 2 do JP, OWASP Top 10, OWASP ASVS nível 2, OWASP Top 10 para LLM (Fase 3) e LGPD (Lei 13.709/2018).

Não somos advogados. Tudo marcado **[CONFIRMAR COM ADVOGADO/CONTADOR]** é dúvida organizada, não afirmação.

Revisão: ao fim de cada fase, rodar o checklist da seção 6 e responder item por item.

---

## 1. O que estamos protegendo

1. **Dados pessoais dos clientes dos nossos clientes** (nome, telefone, histórico de conversas, horários, faltas). Essas pessoas não conhecem a nexo. Ativo mais sensível.
2. **Dados de saúde em potencial.** Clínicas de estética, fisio e odonto podem gerar conversa com dado de saúde (dado sensível na LGPD). Na piloto (estúdio de cílios), o risco é menor, mas existe: clientes podem relatar alergia, irritação nos olhos ou uso de medicamento. Tratar como risco alto.
3. **Credenciais:** tokens da Meta, segredo do app, chaves de IA, banco, contas dos donos.
4. **O número de WhatsApp de cada negócio:** abuso pode levar a bloqueio pela Meta. Na piloto, é o número pessoal de trabalho da dona, com todas as clientes dela. Perder esse número seria grave.
5. **Reputação da nexo:** vazamento ou spam com o nome de um cliente acaba com a confiança antes de ela existir.

---

## 2. Modelo de ameaças (STRIDE)

Legenda STRIDE: **S** falsificação de identidade, **T** adulteração, **R** repúdio, **I** vazamento de informação, **D** negação de serviço, **E** elevação de privilégio.

| # | Ameaça | STRIDE | Impacto | Controles planejados |
|---|---|---|---|---|
| A1 | Alguém de fora forja webhooks da Meta para criar agendamentos, contatos ou mensagens falsas | S, T | Alto | Validar `X-Hub-Signature-256` com App Secret sobre o corpo bruto e comparação em tempo constante; 401 + registro quando inválida; `VERIFY_TOKEN` forte no GET; alerta quando houver muitas falhas; rate limit na rota |
| A2 | Um negócio tenta ver ou alterar dados de outro (quebra de isolamento) | I, T, E | Crítico | `tenant_id` sempre vindo da sessão; filtro na aplicação + RLS no Postgres; IDs UUID; papel do banco da aplicação sem superusuário e sem `BYPASSRLS`; teste de isolamento em todas as rotas, em todo commit |
| A3 | Funcionário do negócio vê mais do que deveria | I, E | Médio (piloto sem equipe) | Autorização por papel no backend, negando por padrão; profissional vê só a própria agenda e os clientes que atende |
| A4 | Cliente final manda mensagem maliciosa: texto gigante, flood, tentativa de injeção, mídia estranha | D, T | Médio | Schema com tamanho máximo; truncar e registrar; limite por contato e por negócio; conteúdo sempre tratado como texto não confiável (sem HTML); robô determinístico na Fase 1 |
| A5 | Injeção de prompt contra a IA (Fase 3) | T, E, I | Alto | Mensagem do cliente nunca vira instrução; allowlist de funções restrita ao `tenant_id`; schema de entrada e saída; confirmação humana para alterar ou apagar; limite de custo |
| A6 | Roubo de sessão ou de senha do dono | S, E | Alto | Argon2id; bloqueio progressivo; cookie `HttpOnly`, `Secure`, `SameSite`; sessão revogada ao trocar senha; CSRF; CSP; 2FA opcional para dono e obrigatório para admin nexo |
| A7 | Segredo vaza pelo repositório ou pelos logs | I | Alto | `.env` no `.gitignore`; gitleaks no pre-commit e na CI; logs com redação de tokens e telefone mascarado; segredos de produção só no cofre do provedor |
| A8 | Sócio da nexo acessa dados de cliente sem necessidade | I, R | Alto | Admin nexo entra em um negócio só informando motivo, com 2FA; registro no log de auditoria imutável; acesso com prazo; revisão periódica dos registros |
| A9 | Dependência de terceiros comprometida | T, E | Alto | Lockfile; `npm audit` na CI; Dependabot ou Renovate; evitar pacotes abandonados; poucas dependências |
| A10 | Abuso do número do negócio (envio em massa, spam) leva a bloqueio pela Meta | D | Crítico na piloto | Opt-out imediato; janela de 24h e templates; limite de envio por negócio; sem envio em massa; alerta de pico |
| A11 | Perda de dados (falha, erro humano, ransomware) | D | Alto | Backup diário criptografado; teste de restauração documentado; nada de apagar fisicamente sem política; migrações revisadas |
| A12 | Ação sensível negada depois ("não fui eu que apaguei") | R | Médio | Log de auditoria imutável com quem, quando, o quê e de onde |

---

## 3. Como os requisitos de segurança mudam a arquitetura

1. **RLS de verdade com Prisma.** Dois papéis no Postgres: um dono das tabelas, usado só nas migrações, e um papel da aplicação sem superusuário e sem `BYPASSRLS`. Cada requisição roda numa transação que define `app.tenant_id` (via extensão do Prisma Client), e as políticas de RLS leem esse valor. O worker da fila faz o mesmo para cada tarefa.
2. **Sessão no servidor, não JWT.** Sessão guardada no Postgres, com cookie `HttpOnly`. Fica fácil derrubar todas as sessões ao trocar a senha. Exige token CSRF nas rotas que alteram dados. Painel e API no mesmo site (mesmo domínio ou subdomínio) para o cookie funcionar com `SameSite`.
3. **Acesso de admin nexo como "entrada controlada".** O admin não vê dados de negócio por padrão. Para entrar, informa o motivo, passa pelo 2FA e recebe acesso com prazo. Tudo vai para o log de auditoria.
4. **Log de auditoria imutável.** Tabela só de inclusão: o papel da aplicação tem `INSERT`, sem `UPDATE` e sem `DELETE`. Opcional: cada linha guarda o hash da anterior para denunciar adulteração.
5. **Criptografia de campo** para tokens da Meta e chaves de integração (AES-256-GCM), com a chave fora do banco, no cofre do provedor.
6. **Webhook com corpo bruto** (`rawBody` no NestJS) antes de qualquer parser, para validar a assinatura.
7. **Logs com redação automática** (ex.: pino com lista de campos a esconder): telefone mascarado, sem conteúdo de mensagem, sem token.
8. **Robô ganha um estado de "aviso inicial".** Na primeira conversa, ele informa em uma frase que é atendimento automático do negócio e onde ver a política de privacidade, e isso fica registrado em `Consent`.
9. **Direitos do titular desde a Fase 1.** Exportar, corrigir e excluir os dados de um cliente final. Excluir apaga a pessoa e as mensagens dela e deixa nos eventos e relatórios só um registro anonimizado, para os números continuarem certos.
10. **Rate limiting** por IP e por negócio. Com um só servidor na Fase 1, o limite pode ficar em memória; com mais de um, passa para o Postgres. Sem Redis por enquanto.
11. **Hospedagem:** "banco não exposto à internet" pesa contra a opção Fly.io + Neon, porque o Neon é acessado pela internet (com TLS). Ficam mais alinhadas as opções com rede privada entre app e banco (Railway, Render ou servidor próprio). Também é preciso registrar a região dos dados e preferir uma no Brasil, se o custo permitir. A confirmar.
12. **Três ambientes** (desenvolvimento, teste, produção) com chaves diferentes. Dados reais nunca saem da produção.
13. **CI obrigatória:** lint, testes (com isolamento), gitleaks e auditoria de dependências. Falhou, não sobe.
14. **Dado sensível:** campos estruturados não guardam informação de saúde. Se a cliente mandar, fica só no histórico, com acesso restrito à dona, e nunca vai para a IA.

---

### Tarefas de segurança abertas

| Prioridade | Tarefa | Origem |
|---|---|---|
| Feita (27/10/2026) | Login: Argon2id, sessão no servidor com cookie HttpOnly/SameSite=Strict, CSRF, bloqueio após 5 erros, limite por IP, 2FA para admin nexo, auditoria de login/logout. | E8 |
| Feita (27/10/2026) | Troca de senha pela dona (encerra as outras sessões); senha provisória obrigando troca no primeiro acesso; 2FA do admin cadastrado pelo `admin:create`; entrada controlada do admin num negócio (motivo + código + 1 hora + auditoria de início e fim). | E9 |
| Feita (27/10/2026) | Tabela `tenant_directory` (lista do admin) fica fora do RLS: só nome, tipo e datas, preenchida por gatilho; a aplicação só lê. Teste confere colunas e permissões. | E9 |
| Aberta | Exportar e excluir dados de uma cliente final pelo painel (direitos do titular). | Antes do piloto |
| Feita (27/10/2026) | Tabela `channel_routes` (número do canal → negócio) fica fora do RLS porque o webhook ainda não sabe o negócio. Compensação: a aplicação só tem `SELECT` nela, e o teste de RLS lista as únicas exceções (`users`, `channel_routes`). | E5 |
| Feita (27/10/2026) | Fila pg-boss: estrutura criada pelo papel dono; a aplicação só usa. Jobs carregam conteúdo de mensagem e telefone, então ficam no máximo 1 hora depois de concluídos e 24 horas se não forem processados. Logs do worker não levam conteúdo. | E5 |
| Feita (27/10/2026) | Chaves estrangeiras compostas com `tenant_id` em todas as ligações entre tabelas de negócio. O Postgres não aplica RLS na checagem de chave estrangeira; a chave composta impede apontar para registro de outro negócio. Um teste da CI falha se surgir ligação sem `tenant_id`. | Revisão da E3 |

---

## 4. Registro das operações de tratamento (LGPD)

Papéis, em princípio: o negócio cliente é o **controlador** e a nexo é a **operadora**. **[CONFIRMAR COM ADVOGADO]**

| Dado | De quem | Para quê | Base legal provável | Retenção | Quem acessa |
|---|---|---|---|---|---|
| Nome do perfil do WhatsApp e telefone | Cliente final | Identificar e responder; agendar | [CONFIRMAR COM ADVOGADO] (execução de contrato ou procedimentos preliminares?) | [A DEFINIR] | Dono e equipe autorizada; admin nexo só com motivo |
| Conteúdo das conversas | Cliente final | Atender e manter histórico | [CONFIRMAR COM ADVOGADO] | [A DEFINIR] | Dono e equipe autorizada; admin nexo só com motivo |
| Horários, serviços, faltas, anotações | Cliente final | Agenda e histórico | [CONFIRMAR COM ADVOGADO] | [A DEFINIR] | Dono e equipe autorizada |
| Registro de opt-in e opt-out | Cliente final | Cumprir regras do WhatsApp e da LGPD | [CONFIRMAR COM ADVOGADO] (obrigação legal ou legítimo interesse?) | Enquanto houver relação + [A DEFINIR] | Sistema; dono |
| Possível dado de saúde relatado espontaneamente | Cliente final | Nenhum fim específico; só fica no histórico | [CONFIRMAR COM ADVOGADO] (dado sensível, art. 11) | Igual ao histórico, ou menor | Só o dono |
| Nome, e-mail, senha (hash), 2FA | Dono e equipe | Login e segurança | Execução de contrato | Enquanto houver conta + [A DEFINIR] | Sistema; admin nexo para suporte |
| Logs técnicos (telefone mascarado, IP) | Todos | Segurança e diagnóstico | Legítimo interesse [CONFIRMAR COM ADVOGADO] | [A DEFINIR] (sugestão: 90 dias) | JP e Jandoza |
| Log de auditoria | Usuários do sistema | Prestação de contas | Legítimo interesse / obrigação legal [CONFIRMAR COM ADVOGADO] | [A DEFINIR] | Admin nexo; dono vê o do próprio negócio |
| Fila de mensagens (pg-boss) | Cliente final | Processar a mensagem fora da requisição do webhook | Mesma do conteúdo das conversas | 1 hora após processar; 24 horas no máximo | Sistema |
| Backups | Todos os acima | Continuidade | Mesma do dado original | Ciclo de [A DEFINIR] dias | Provedor (criptografado); admin nexo para restauração |

Onde os dados ficam: provedor e região **[A DEFINIR]**, informar ao cliente na proposta.

Fim do contrato: exportação entregue ao negócio e exclusão em até **[A DEFINIR]** dias, incluindo backups no ciclo seguinte.

---

## 5. Plano de incidente

**Detectar:** alertas de falha de assinatura de webhook, de tentativas de login, de pico de envio; aviso do provedor; aviso de cliente; gitleaks.

**Quem avisa quem:**
1. Quem perceber avisa JP e Jandoza na hora (grupo dos sócios no WhatsApp). Responsável técnico: **[A DEFINIR]**. Responsável pela comunicação com o cliente: **[A DEFINIR]**.
2. O responsável técnico abre um registro com data, hora, o que foi visto e quem sabe.

**Conter:**
- Segredo vazado: revogar e trocar na hora (token da Meta, chave do banco, chave de IA), derrubar sessões, registrar.
- Acesso indevido: bloquear a conta, derrubar sessões, preservar logs.
- Abuso de envio: pausar envios automáticos do negócio afetado.

**Avaliar:** quais dados, de quais negócios, de quantas pessoas, desde quando.

**Avisar:** o negócio cliente (controlador) o quanto antes. Avisar a ANPD e os titulares quando o incidente puder gerar risco ou dano relevante: prazos e formato **[CONFIRMAR COM ADVOGADO]**.

**Corrigir e aprender:** corrigir a causa, testar, registrar o que mudou em `DECISOES.md`.

---

## 6. Checklist de revisão (fim de cada fase)

Responder OK / Pendente / Não se aplica, com o motivo. Cada Pendente vira tarefa com prioridade (crítica, alta, média, baixa). Nenhuma fase vai para clientes reais com item crítico pendente.

| # | Item | Fase 1 | Motivo |
|---|---|---|---|
| 1 | Isolamento entre negócios testado em todas as rotas? | | |
| 2 | Autorização verificada no backend em toda rota, negando por padrão? | | |
| 3 | Assinatura de webhook validada com corpo bruto e comparação em tempo constante? | | |
| 4 | Idempotência de webhooks? | | |
| 5 | Toda entrada validada com schema e limite de tamanho? | | |
| 6 | Nenhuma consulta SQL montada por concatenação? | | |
| 7 | Nenhum segredo no repositório (gitleaks limpo)? | | |
| 8 | Cabeçalhos de segurança, CORS, CSRF e rate limiting ativos? | | |
| 9 | Logs sem dados pessoais desnecessários e sem segredos? | | |
| 10 | Log de auditoria das ações sensíveis? | | |
| 11 | Fluxos de exportação e exclusão de dados do titular funcionando? | | |
| 12 | Opt-out ("parar") respeitado e registrado? | | |
| 13 | Backups configurados e restauração testada? | | |
| 14 | Dependências auditadas, sem vulnerabilidade alta ou crítica aberta? | | |
| 15 | (Fase 3) Allowlist de funções da IA, confirmação humana, schema de saída e limite de custo? | | |

---

## 7. Requisitos de referência (resumo do PROMPT 2)

- **Isolamento:** `tenant_id` obrigatório e vindo da sessão; RLS; UUID; teste de isolamento em todo commit.
- **Autenticação:** Argon2id; bloqueio progressivo; recuperação por link de uso único que expira; cookie `HttpOnly`/`Secure`/`SameSite`; sessão encerrada ao trocar senha; 2FA opcional para dono e obrigatório para admin nexo; autorização por papel negando por padrão; acesso da nexo só com motivo registrado.
- **Meta:** assinatura com corpo bruto e tempo constante; `VERIFY_TOKEN` forte; 200 rápido + fila; idempotência; token de usuário de sistema criptografado, escopo mínimo, rotação; opt-in, janela de 24h, templates, "parar/sair"; limite de envio por negócio.
- **Web:** schema com tamanho máximo; só ORM ou parametrizado; sem `dangerouslySetInnerHTML` com conteúdo de usuário; CSRF; CORS restrito; Helmet (CSP, HSTS, `X-Content-Type-Options`, `frame-ancestors`, `Referrer-Policy`); rate limiting; uploads validados e fora da pasta pública; prevenção de SSRF; erros genéricos.
- **Segredos:** nada no git; gitleaks no pre-commit e na CI; cofre do provedor; chaves por ambiente; vazou, revoga, troca e registra.
- **LGPD:** controlador x operadora no contrato; minimização; saúde fora de campos e da IA; aviso na primeira interação; política e termos simples; exportar, corrigir e excluir; retenção e fim de contrato na proposta; região registrada; tabela de tratamento.
- **Criptografia e logs:** TLS 1.2+; criptografia em repouso e de campo; logs mascarados; auditoria imutável; alertas.
- **IA (Fase 3):** entrada não confiável; allowlist com `tenant_id`; confirmação humana; saída validada; mínimo de dado pessoal e nada de saúde; política de retenção do provedor; limite de custo; relatórios só leitura em visões filtradas.
- **Infra:** lockfile; `npm audit`; Dependabot/Renovate; CI que barra; banco fora da internet; usuário sem superusuário; backup diário criptografado com restauração testada; ambientes separados; plano de incidente.
