# Pendências do nexo CRM

Lista do que depende dos sócios. Atualizada em 26/10/2026. Quando um item for respondido, ele sai daqui e vai para `CLAUDE.md` ou `DECISOES.md`.

## Da cliente-piloto (o Jandoza confirma com a mãe quando ela voltar de viagem)
- Nome dela e nome do estúdio.
- Lista de serviços (ex.: aplicação fio a fio, volume russo, híbrido, manutenção, remoção, lash lifting), com duração e preço de cada um. Hoje só sabemos "1 hora".
- Prazo de manutenção que ela usa (ex.: até X dias conta como manutenção; depois disso vira aplicação nova?).
- Dias e horário de funcionamento, pausas e folgas.
- Como ela agenda hoje (caderno, app, só WhatsApp) e quantas clientes atende por semana.
- O que ela quer que o robô diga antes do horário (cuidados, chegar sem rímel, teste de sensibilidade). Texto dela, não nosso.
- Se ela tem MEI ou CNPJ (vai pesar quando a Meta entrar).
- Depois de quantos dias sem vir ela considera que a cliente sumiu (a tela usa 45 dias por enquanto).
- Se quer o lembrete de oferecer o próximo horário depois do atendimento, e em quantos dias.
- Data para começar o piloto.

## Dos sócios
- Teto de gasto mensal com hospedagem (Coca).
- Modelo de planos: grátis + IA paga x implantação + mensalidade (Coca).
- Destravar a conta da Meta: forma de pagamento, perfil da empresa, verificação, e de quem fica a conta (usar o MEI do Jandoza ou o da piloto).
- Regras dos dados das clientes dela (onde ficam, quem acessa, o que acontece no fim do contrato), escritas antes do piloto e confirmadas com advogado.

## Assinaturas (tela pronta, sem funcionar; pedido do JP em 27/10/2026)
- A tela "Plano e assinatura" (Conta → Plano e assinatura) é só visual. Nomes (Básico, Com IA, Equipe), preços e o que entra em cada plano são provisórios: definir com o Coca.
- Desconto do plano anual: existe? Quanto?
- Fazer funcionar depois: forma de cobrança (cartão, Pix, boleto) e provedor de pagamento, troca de plano, liberação de recursos por plano (o banco já tem `Tenant.plan` e feature flags), nota fiscal (depende do CNPJ) e o que acontece quando o pagamento atrasa.

## Criar conta e e-mails (feito em 27/10/2026, falta decidir para produção)
- Provedor de e-mail para produção (confirmar e-mail, esqueci a senha): escolher entre opções como Resend, Brevo ou Amazon SES, com preço conferido na página oficial de cada um. Precisa de um domínio da nexo para enviar (SPF/DKIM). Sem isso, em produção "Esqueci a senha" e "Criar conta" ficam escondidos.
- Abrir o cadastro para qualquer pessoa (`SIGNUP_ENABLED=true`) ou deixar só a nexo criando contas na piloto? (sócios)
- Texto dos termos de uso e da política de privacidade que a pessoa aceita no cadastro [CONFIRMAR COM ADVOGADO/CONTADOR] (item 4 abaixo).
- O que fazer com contas criadas e nunca confirmadas (apagar depois de X dias?).

## Para levar a advogado ou contador
1. A nexo é operadora e o negócio cliente é controlador dos dados das clientes finais? Como isso entra no contrato?
2. Qual base legal usar para guardar nome, telefone e conversas das clientes finais (execução de contrato, legítimo interesse, consentimento)?
3. O que o aviso da primeira mensagem do robô precisa dizer, no mínimo? Precisa de link para política de privacidade?
4. Texto da política de privacidade e dos termos de uso, em linguagem simples.
5. Por quanto tempo podemos e devemos guardar histórico, logs, auditoria e backups?
6. No fim do contrato: em quantos dias apagar, e como provar que apagamos (inclusive dos backups)?
7. Se uma cliente final contar algo de saúde (alergia, irritação nos olhos), o que muda? Precisa de cuidado extra por ser dado sensível?
8. Incidente: quando é obrigatório avisar a ANPD e as titulares, em que prazo e em que formato?
9. Precisa nomear um encarregado de dados (DPO)? Pequena empresa ou MEI tem dispensa?
10. Hospedar fora do Brasil (ex.: servidor nos EUA) exige algo a mais (transferência internacional)?
11. Sem CNPJ: dá para assinar contrato com a piloto pelo MEI do Jandoza ou em nome dos sócios? Quem responde se algo der errado? (contador e advogado)
12. Como emitir nota e receber da piloto antes de a nexo ter CNPJ? (contador)
13. Usar o número pessoal de trabalho da dona na API da Meta: há algum cuidado contratual sobre perda ou bloqueio do número?
14. Quando a cliente pede para excluir os dados, perdemos também o pedido de "parar" dela. Podemos guardar só o telefone (ou um hash dele) numa lista de bloqueio, para o robô não mandar mensagem automática de novo? Por quanto tempo?

## Do JP
- Criar o repositório `nexo-crm` no seu GitHub (eu não consigo criar repositórios daqui) e avisar.
- Aprovar o plano (arquitetura + segurança) para começar o código.

## Planos (27/10/2026)
- Divisão escolhida pelo Jandoza: Grátis / CRM / Completo (CRM + agenda + robô). Falta o Coca definir preço, desconto anual e o limite de clientes do Grátis.
- Trava por plano no servidor: hoje a tela de planos é só visual e todo negócio tem tudo. Antes de abrir o Grátis, cada rota da agenda e do robô precisa checar o plano na API (não basta esconder o botão na tela).
