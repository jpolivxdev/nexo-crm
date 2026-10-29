import { randomUUID } from 'node:crypto';
import { pipelineTemplateFor } from '@nexo/core';
import { type PrismaClient, withTenant } from '../database/prisma.js';

/**
 * Cria um negócio vazio, pronto para o assistente de configuração: etapas do modelo do nicho
 * e uma profissional com o nome de quem atende. Serviços e horários a dona preenche.
 */
export async function createTenant(
  prisma: PrismaClient,
  input: { name: string; niche: string; timezone: string; attendantName: string },
  now = new Date(),
): Promise<{ tenantId: string; professionalId: string }> {
  const tenantId = randomUUID();
  return withTenant(prisma, tenantId, async (tx) => {
    await tx.tenant.create({
      data: {
        id: tenantId,
        name: input.name,
        niche: input.niche,
        timezone: input.timezone,
        attendantName: input.attendantName,
        onboardingStartedAt: now,
      },
    });
    const professional = await tx.professional.create({
      data: { tenantId, name: input.attendantName },
    });
    const template = pipelineTemplateFor(input.niche);
    await tx.pipeline.create({
      data: {
        tenantId,
        name: template.name,
        isDefault: true,
        stages: { create: template.stages.map((stage, position) => ({ position, ...stage })) },
      },
    });
    return { tenantId, professionalId: professional.id };
  });
}
