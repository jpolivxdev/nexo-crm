import { randomUUID } from 'node:crypto';
import { pipelineTemplateFor } from '@nexo/core';
import { type PrismaClient, withTenant } from '../database/prisma.js';

export interface DemoTenantInput {
  name: string;
  niche: string;
  services: { name: string; durationMinutes: number }[];
  /** Prefixo dos telefones fictícios. DDD 00 não existe, então nunca é número real. */
  phonePrefix: string;
}

export interface DemoTenant {
  tenantId: string;
  professionalId: string;
  serviceIds: string[];
  contactIds: string[];
  appointmentId: string;
}

/**
 * Cria um negócio de demonstração completo, com dados fictícios marcados como "(demo)".
 * Nunca usar dados reais de pessoas aqui (CLAUDE.md, seção 12).
 */
export async function createDemoTenant(
  prisma: PrismaClient,
  input: DemoTenantInput,
  now: Date = new Date(),
): Promise<DemoTenant> {
  const tenantId = randomUUID();

  return withTenant(prisma, tenantId, async (tx) => {
    await tx.tenant.create({ data: { id: tenantId, name: input.name, niche: input.niche } });

    const professional = await tx.professional.create({
      data: { tenantId, name: 'Profissional Exemplo (demo)' },
    });

    const services = [];
    for (const service of input.services) {
      services.push(await tx.service.create({ data: { tenantId, ...service } }));
    }
    await tx.professionalService.createMany({
      data: services.map((s) => ({ tenantId, professionalId: professional.id, serviceId: s.id })),
    });

    // Terça a sábado, 9h às 12h e 13h às 18h (pausa para almoço).
    const availability = [];
    for (let weekday = 2; weekday <= 6; weekday++) {
      availability.push(
        { tenantId, professionalId: professional.id, weekday, startMinute: 540, endMinute: 720 },
        { tenantId, professionalId: professional.id, weekday, startMinute: 780, endMinute: 1080 },
      );
    }
    await tx.availability.createMany({ data: availability });

    const template = pipelineTemplateFor(input.niche);
    const pipeline = await tx.pipeline.create({
      data: {
        tenantId,
        name: template.name,
        isDefault: true,
        stages: {
          create: template.stages.map((stage, position) => ({ tenantId, position, ...stage })),
        },
      },
      include: { stages: { orderBy: { position: 'asc' } } },
    });

    const contacts = [];
    for (let i = 1; i <= 3; i++) {
      contacts.push(
        await tx.contact.create({
          data: {
            tenantId,
            name: `Cliente Exemplo ${i} (demo)`,
            phone: `${input.phonePrefix}${String(i).padStart(4, '0')}`,
            source: 'WHATSAPP',
          },
        }),
      );
    }

    const firstContact = contacts[0]!;
    const firstService = services[0]!;
    const scheduledStage = pipeline.stages.find((s) => s.name === 'Agendou') ?? pipeline.stages[0]!;
    await tx.deal.create({
      data: {
        tenantId,
        contactId: firstContact.id,
        pipelineId: pipeline.id,
        stageId: scheduledStage.id,
      },
    });

    // Amanhã às 13h UTC (10h em São Paulo).
    const startsAt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 13, 0),
    );
    const appointment = await tx.appointment.create({
      data: {
        tenantId,
        contactId: firstContact.id,
        serviceId: firstService.id,
        professionalId: professional.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + firstService.durationMinutes * 60_000),
        source: 'WHATSAPP',
      },
    });

    await tx.event.create({
      data: {
        tenantId,
        type: 'appointment.created',
        entityType: 'appointment',
        entityId: appointment.id,
        actorType: 'system',
        payload: { seed: true },
      },
    });

    return {
      tenantId,
      professionalId: professional.id,
      serviceIds: services.map((s) => s.id),
      contactIds: contacts.map((c) => c.id),
      appointmentId: appointment.id,
    };
  });
}

/** Os dois negócios de demonstração do projeto. */
export const DEMO_TENANTS: DemoTenantInput[] = [
  {
    name: 'Estúdio Exemplo (demo)',
    niche: 'cilios',
    // Durações de referência; os serviços reais da piloto estão em PENDENCIAS.md.
    services: [
      { name: 'Aplicação de cílios (demo)', durationMinutes: 60 },
      { name: 'Manutenção de cílios (demo)', durationMinutes: 60 },
    ],
    phonePrefix: '5500900000',
  },
  {
    name: 'Barbearia Teste (demo)',
    niche: 'barbearia',
    services: [{ name: 'Corte (demo)', durationMinutes: 30 }],
    phonePrefix: '5500900001',
  },
];
