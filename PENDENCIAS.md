# Pendências do nexo CRM

Lista do que depende dos sócios. Atualizada em 29/10/2026. Quando um item for respondido, ele sai daqui e vai para `CLAUDE.md` ou `DECISOES.md`.

## Da cliente-piloto

Respostas recebidas em 29/10/2026 (pelo Jandoza e pelo JP) estão em `CLAUDE.md`, seção 2. Ainda falta:
- O robô pode marcar uma cliente logo depois da outra, sem intervalo entre os atendimentos? (hoje marca seguido)
- OK dela no rascunho do recado antes do horário (em `CLAUDE.md`, seção 2).
- Catálogo (PDF de 29/10): confirmar os preços da tabela em `CLAUDE.md`, a duração de cada serviço além dos cílios, se o robô agenda todos os serviços ou só cílios, e se manutenção é 15 a 20 dias (PDF) ou 21 a 25 (resposta dela).
- Nome no robô: "Falar com a Lígia" ou "Falar com a Lika" (a marca é "by Lika")?
- Quem pergunta de curso: o robô passa o número do curso ou passa para ela?
- Fotos do PDF: o produto não usa fotos na Fase 1. Para usar as fotos do espaço depois (link público na Fase 2 ou divulgação da nexo), precisa do OK dela por escrito. As fotos de rosto parecem de banco de imagem: não usar sem saber a licença.
- Ela volta na semana de 02/11/2026. Acertar o sistema com ela e depois marcar a data do piloto.
- Qual é o aplicativo de agenda que ela usa hoje, e se quer trazer os horários já marcados de lá.
- Se ela tem MEI ou CNPJ (vai pesar quando a Meta entrar). Não respondeu.

## Dos sócios
- Lembrete por e-mail para a cliente final (item da seção M4): as clientes não têm e-mail no cadastro, só WhatsApp, e pedir e-mail vai contra coletar o mínimo. Proposta: lembrete só pelo WhatsApp e tirar o e-mail da cliente do escopo da Fase 1. Confirmar com o JP.
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
