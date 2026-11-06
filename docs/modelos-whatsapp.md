# Modelos de mensagem (WhatsApp)

Fora da janela de 24 horas depois da última mensagem da cliente, o WhatsApp só deixa enviar **mensagem de modelo** (template) aprovada pela Meta. Os lembretes de horário usam dois modelos. Cadastre-os no Gerenciador do WhatsApp da conta do negócio quando a conta da Meta estiver liberada.

Depois de aprovados, ligue `WHATSAPP_REMINDER_TEMPLATES=true` no `.env`. Antes disso, o lembrete de quem não conversou nas últimas 24 horas fica marcado como "precisa de modelo" e não sai.

Fonte: documentação oficial da Meta sobre modelos de mensagem (https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates). Conferir as regras de lá na hora de cadastrar.

## Como cadastrar

- **Categoria:** Utilidade (lembrete de algo que a cliente marcou).
- **Idioma:** Português (BR), código `pt_BR`.
- **Nome:** exatamente o da tabela (o sistema manda pelo nome).
- **Botões:** resposta rápida, na ordem da tabela. O sistema manda o retorno de cada botão; a cliente toca e o robô entende igual ao lembrete normal.
- **Exemplo das variáveis:** a Meta pede um exemplo. Use dados fictícios, como "Estúdio Exemplo", "Design de sobrancelha", "terça, 03/11" e "09:00".

| Nome | Texto | Botões |
|---|---|---|
| `lembrete_horario_24h` | Oi! Passando para lembrar do seu horário no {{1}}: {{2}}, amanhã ({{3}}) às {{4}}. Você confirma? | Confirmar · Remarcar · Cancelar |
| `lembrete_horario_1h` | Seu horário de {{1}} no {{2}} é hoje às {{3}}. Se não puder vir, toque em Cancelar. | Confirmar · Cancelar |

Variáveis: no de 24 h, {{1}} negócio, {{2}} serviço, {{3}} dia, {{4}} hora. No de 1 h, {{1}} serviço, {{2}} negócio, {{3}} hora.

## Cuidados

- O texto do modelo é fixo. O texto que a dona edita no painel vale só dentro da janela de 24 horas.
- Se a piloto aprovar o recado com o cuidado dos olhos (rascunho no `CLAUDE.md`, seção 2), o modelo de 24 h muda junto: o texto daqui e o de `REMINDER_TEMPLATES` (`packages/core/src/bot/reminders.ts`) têm de ser iguais ao aprovado na Meta.
- O teto de 200 envios por hora por número e o "parar" valem também para os modelos.
- A Meta cobra pelas mensagens de modelo (o preço depende da categoria e do país). Preço: conferir na página oficial de preços do WhatsApp Business antes da piloto ([A DEFINIR]).
