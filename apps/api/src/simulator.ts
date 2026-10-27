import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import type { BotInput, Choice, OutgoingMessage } from '@nexo/core';
import { ChannelRegistry } from './channel/channel.registry.js';
import { SimulatorChannel } from './channel/simulator.channel.js';
import { loadEnv } from './config/env.js';
import { ConversationService } from './conversation/conversation.service.js';
import { PanelOnlyOwnerNotifier } from './conversation/owner-notifier.js';
import { createPrismaClient, withTenant } from './database/prisma.js';
import type { PrismaService } from './database/prisma.service.js';
import { RealtimeBus } from './realtime/realtime.bus.js';
import { SchedulingService } from './scheduling/scheduling.service.js';
import { createDemoTenant, DEMO_TENANTS } from './seed/demo-tenant.js';

/**
 * Conversa com o robô pelo terminal, como se fosse o WhatsApp, usando o banco local.
 * Digite o número de uma opção para "tocar" nela, ou escreva livremente. "sair" encerra.
 * Só para desenvolvimento: usa telefone fictício e nunca fala com a Meta.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  if (env.NODE_ENV === 'production') throw new Error('O simulador não roda em produção.');

  const prisma = createPrismaClient(env.DATABASE_URL);
  const db: Pick<PrismaService, 'withTenant'> = {
    withTenant: (tenantId, fn) => withTenant(prisma, tenantId, fn),
  };
  let tenantId = process.env.SIMULATOR_TENANT_ID;
  if (!tenantId) {
    tenantId = (await createDemoTenant(prisma, DEMO_TENANTS[0]!)).tenantId;
    console.log(
      `Criei um negócio de demonstração. Para reusar, rode com SIMULATOR_TENANT_ID=${tenantId}`,
    );
  }
  const phone = process.env.SIMULATOR_PHONE ?? '5500999990001';

  let options: Choice[] = [];
  const registry = new ChannelRegistry({});
  registry.registerSimulator(
    'terminal',
    new SimulatorChannel((_to, message) => {
      options = print(message);
    }),
  );
  const bus = new RealtimeBus();
  const conversations = new ConversationService(
    db,
    new SchedulingService(db, bus),
    registry,
    bus,
    new PanelOnlyOwnerNotifier(),
  );

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(
    `\nSimulador nexo: você é a cliente ${phone}. Escreva "oi" para começar ("sair" encerra).\n`,
  );
  try {
    rl.setPrompt('você › ');
    rl.prompt();
    for await (const raw of rl) {
      const line = raw.trim();
      if (line === 'sair') break;
      if (!line) {
        rl.prompt();
        continue;
      }
      const picked = /^\d+$/.test(line) ? options[Number(line) - 1] : undefined;
      const input: BotInput = picked
        ? { kind: 'choice', id: picked.id }
        : { kind: 'text', text: line };
      if (picked) console.log(`        (tocou em "${picked.title}")`);
      await conversations.handleInbound(tenantId, {
        channel: 'simulator',
        businessExternalId: 'terminal',
        externalId: `sim-${randomUUID()}`,
        from: phone,
        profileName: 'Cliente do simulador',
        type: picked ? 'interactive' : 'text',
        input,
        body: picked ? picked.title : line,
        receivedAt: new Date().toISOString(),
      });
      rl.prompt();
    }
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

/** Mostra a resposta do robô e devolve as opções numeradas. */
function print(message: OutgoingMessage): Choice[] {
  console.log(`\nrobô › ${message.body}`);
  const choices =
    message.type === 'buttons' ? message.buttons : message.type === 'list' ? message.rows : [];
  choices.forEach((c, i) =>
    console.log(
      `   ${i + 1}. ${c.title}${'description' in c && c.description ? ` (${c.description})` : ''}`,
    ),
  );
  console.log('');
  return choices;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
