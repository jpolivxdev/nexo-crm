# Custo mensal e tempo de onboarding

Relatório da E11 (pronto da Fase 1, CLAUDE.md seção 13). Preços consultados nas páginas oficiais em **27/10/2026**, em dólar ou euro, sem imposto. Antes de contratar, confirmar na página: preço muda. Conversão para real fica para o dia da contratação (não chutamos câmbio).

Legenda: **fato** (está na fonte), **suposição** (estimativa nossa, a conferir com o uso real), **opinião**.

## O que precisa rodar

Um processo (API + worker + painel, imagem do `Dockerfile`) e um PostgreSQL 16. Para um estúdio, o uso é baixo: poucas centenas de mensagens e horários por mês.

**Suposição de consumo** (a medir no piloto): processo Node com ~250 MB de RAM e quase nada de CPU parado; Postgres com ~200 MB de RAM e menos de 1 GB de disco no primeiro ano.

## Opções de hospedagem

### 1. Railway (Hobby): mais simples

- **Fato:** plano Hobby custa US$ 5/mês e inclui US$ 5 de uso. Uso cobrado por recurso: vCPU US$ 20/mês, RAM US$ 10/GB/mês, disco US$ 0,15/GB/mês, saída de rede US$ 0,05/GB. Build não é cobrado. ([docs.railway.com/pricing/plans](https://docs.railway.com/pricing/plans))
- **Suposição:** app (0,25 GB → ~US$ 2,50) + Postgres (0,2 GB → ~US$ 2,00) + CPU baixa (~US$ 0,50) + disco 1 GB (US$ 0,15) ≈ **US$ 5 a 6/mês no total**, quase tudo coberto pelo crédito do plano.
- Prós: sobe direto do Dockerfile, Postgres no mesmo painel e na rede privada (dá para deixar o banco fora da internet), backup do volume pelo painel.
- Contras: cobrança por uso (precisa de alerta de gasto); região no Brasil a confirmar.

### 2. Render: preço fixo

- **Fato:** serviço web de menos de 1 CPU e 512 MB por US$ 7/mês; Postgres menor pago (256 MB) por US$ 6/mês com 1 GB incluído e US$ 0,30/GB a mais; workspace Hobby US$ 0. O web grátis existe, mas não serve para nós (precisa ficar ligado para o webhook responder em menos de 1 s e o worker mandar lembretes). ([render.com/pricing](https://render.com/pricing))
- **Total: US$ 13/mês** (fato, pelos preços acima), fixo.
- Prós: conta previsível, Postgres gerenciado com backup.
- Contras: o dobro da opção 1; 512 MB de RAM é apertado (suposição: cabe, a medir).

### 3. Servidor próprio (Hetzner CX23): mais barato por recurso, mais trabalho

- **Fato:** CX23 (2 vCPU, 4 GB RAM, 40 GB de disco, 20 TB de tráfego) a partir de € 5,99/mês com IPv4; backup a partir de € 1,20/mês; locais na Alemanha e Finlândia; a página mostra o CX23 como indisponível no momento. ([hetzner.com/cloud/cost-optimized](https://www.hetzner.com/cloud/cost-optimized/), reajuste de 15/06/2026 em [docs.hetzner.com](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/))
- **Total: ~€ 7,20/mês** com backup.
- Prós: sobra recurso para muitos negócios no mesmo servidor.
- Contras: a gente cuida de tudo (atualizações, firewall, HTTPS, backup e restauração do Postgres, monitoramento). Servidor na Europa: dados fora do Brasil (`[CONFIRMAR COM ADVOGADO/CONTADOR]`, item 10 da PENDENCIAS.md).

**Opinião:** Railway para o piloto. É o mais barato com banco gerenciado e o mais rápido de subir com um dev só. Se a conta passar de US$ 10/mês ou precisarmos de preço fixo, Render. Servidor próprio só quando houver vários negócios e alguém com tempo para operar. **A decisão é do Coca** (teto de gasto ainda em aberto na PENDENCIAS.md).

## Custo do WhatsApp (Meta)

Entra quando a E0 sair. Cobrado por mensagem entregue, pelo tipo e pelo país do número.

- **Fato:** mensagem de modelo de utilidade (o lembrete fora da janela de 24 h) para o Brasil: cerca de **US$ 0,0068** por mensagem na tabela atual. Desde 01/10/2026, utilidade dentro da janela também é cobrada, e as mensagens de atendimento (respostas do robô, texto livre) passaram a ser cobradas no mesmo valor da utilidade. Mensagem da cliente para o negócio é grátis. ([Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing), [atualização das mensagens de atendimento](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages))
- **A confirmar:** uma das páginas da Meta fala em 1.000 mensagens de atendimento grátis por mês por número; a outra não confirma. Conferir na tabela oficial antes de fechar preço com a piloto.
- **Suposição de uso** (estúdio com 100 horários/mês): 200 lembretes + ~8 respostas do robô por horário marcado (~800) ≈ 1.000 mensagens → **US$ 1,36/mês** só de lembretes, e até **US$ 6,80/mês** se as respostas do robô também forem cobradas.

## Custo por negócio

| Item | 1 negócio (piloto) | Cada negócio a mais |
|---|---|---|
| Hospedagem (opção 1) | ~US$ 5 a 6 (suposição) | perto de zero até o servidor encher (suposição: dezenas de estúdios no mesmo processo) |
| WhatsApp | US$ 1,36 a 6,80 (suposição de uso) | o mesmo, proporcional ao movimento |
| **Total estimado** | **~US$ 6,50 a 13/mês** | **~US$ 1,50 a 7/mês** |

O número real sai do piloto: a tela Resultados mostra horários e mensagens, e a conta do provedor mostra o gasto. Revisar esta tabela depois de 2 semanas de uso.

## Tempo de onboarding

- **Como é medido:** o cronômetro começa quando o admin nexo cria o negócio e para quando a dona conclui o assistente (5 passos). A área do admin mostra "Configurado em N min" para cada negócio.
- **Medido até agora:** só em teste automatizado (preenchimento por robô, não conta). **Tempo real da piloto: `[A MEDIR]`** no dia em que ela configurar, com a nexo junto (meta da Fase 1: "poucos minutos").
- **O que pode atrasar:** a lista de serviços, preços e horários dela ainda não chegou (PENDENCIAS.md). Ter isso em mãos antes da chamada é o que mais encurta o onboarding (opinião).
