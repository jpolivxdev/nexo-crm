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

## Do JP
- Criar o repositório `nexo-crm` no seu GitHub (eu não consigo criar repositórios daqui) e avisar.
- Aprovar o plano (arquitetura + segurança) para começar o código.
