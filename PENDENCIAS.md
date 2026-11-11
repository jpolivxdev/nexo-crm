# Pendências do nexo CRM

Lista do que depende dos sócios. Atualizada em 06/11/2026. Quando um item for respondido, ele sai daqui e vai para `CLAUDE.md` ou `DECISOES.md`.

## Da cliente-piloto

Respostas recebidas em 29/10/2026 (pelo Jandoza e pelo JP) estão em `CLAUDE.md`, seção 2. Ainda falta:

- O robô pode marcar uma cliente logo depois da outra, sem intervalo entre os atendimentos? (hoje marca seguido)
- OK dela no rascunho do recado antes do horário (em `CLAUDE.md`, seção 2).
- Botão do robô: ela quer "Falar com Instituto Star", mas o WhatsApp só aceita 20 letras no botão (esse tem 24). Proposta: botão "Falar com a equipe" e, nas mensagens, "a equipe do Instituto Star" (ex.: "Avisei a equipe do Instituto Star"). Confirmar com ela.
- Duração que falta: limpeza de pele, dermaplan, drenagem, spa das sobrancelhas, lash lifting e as manutenções de cílios (levam 1h30 também?).
- Quem faz drenagem e limpeza de pele: nome, dias e horários dessa pessoa, e se ela precisa de acesso ao painel.
- Mostrar a lista do robô por categoria (Cílios, Sobrancelhas, Pele e corpo) ou tudo numa lista só? Ainda sem resposta.
- Fotos do PDF: o produto não usa fotos na Fase 1. Para usar as fotos do espaço depois (link público na Fase 2 ou divulgação da nexo), precisa do OK dela por escrito. As fotos de rosto parecem de banco de imagem: não usar sem saber a licença.
- Ela volta na semana de 02/11/2026. Acertar o sistema com ela e depois marcar a data do piloto.
- Qual é o aplicativo de agenda que ela usa hoje, e se quer trazer os horários já marcados de lá.
- Se ela tem MEI ou CNPJ (vai pesar quando a Meta entrar). Não respondeu.

## Dos sócios

- Lembrete por e-mail para a cliente final (item da seção M4): as clientes não têm e-mail no cadastro, só WhatsApp, e pedir e-mail vai contra coletar o mínimo. Proposta: lembrete só pelo WhatsApp e tirar o e-mail da cliente do escopo da Fase 1. Confirmar com o JP.
- Teto de gasto mensal com hospedagem (Coca).
- Modelo de planos: grátis + IA paga x implantação + mensalidade (Coca).
- Quando a conta da Meta destravar: cadastrar os dois modelos de lembrete (`docs/modelos-whatsapp.md`) e ligar `WHATSAPP_REMINDER_TEMPLATES`.
- Destravar a conta da Meta: forma de pagamento, perfil da empresa, verificação, e de quem fica a conta (usar o MEI do Jandoza ou o da piloto).
- Regras dos dados das clientes dela (onde ficam, quem acessa, o que acontece no fim do contrato), escritas antes do piloto e confirmadas com advogado.
- Dois planos (09/11/2026): nome definitivo do Premium e preço dos dois (Coca). A página mostra "Valor em breve" até lá. Confirmar se a regra de não fazer peça nova de marca antes de 3 conversas reais vale para a página com a demo.
- Plano Personalizado na página inicial (11/11/2026): para onde vai o "Fale conosco" (WhatsApp da nexo, que depende do chip novo, e-mail ou formulário). Pôr o link em `VITE_NEXO_CONTATO`; até lá o botão mostra "Contato em breve". Mensal/anual com desconto só entra se os sócios definirem o desconto.
- Nex com pergunta livre (06/11/2026): criar a chave do Gemini no AI Studio (em qual conta Google da nexo?) e pôr em `GEMINI_API_KEY`. Com clientes pagantes, decidir se passa para a camada paga (o Google deixa de usar as perguntas para melhorar o produto). Plano do meio dos três CRMs: **[A DEFINIR]**.

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

## Planos (27/10/2026)

- Divisão escolhida pelo Jandoza: Grátis / CRM / Completo (CRM + agenda + robô). Falta o Coca definir preço, desconto anual e o limite de clientes do Grátis.
- Trava por plano no servidor: feita em 06/11/2026 (Grátis = clientes e etapas; CRM = + resultados; Completo = + agenda, robô e lembretes). Confirmar com o Coca se a divisão fica assim e qual o limite de clientes do Grátis.
- Premium P1 (09/11/2026): QR code na tela de ligar o 2FA e ferramenta do admin para desligar o 2FA de quem perdeu o celular (com auditoria). Hoje é pelo Suporte.
- Quadro branco (P7): biblioteca pronta de código aberto ou quadro simples nosso? Sugestão: biblioteca, carregada só na tela.
