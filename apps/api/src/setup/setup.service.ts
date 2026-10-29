import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { readFaq } from '../conversation/tenant-bot-config.js';
import type { TenantTx } from '../database/prisma.js';
import { PrismaService } from '../database/prisma.service.js';
import type { z } from 'zod';
import type { businessBody, faqBody, hoursBody, servicesBody } from './setup.schemas.js';

/**
 * Assistente de configuração do negócio: dados do negócio, serviços, horários e dúvidas.
 * Fase 1: uma profissional principal (a dona); o modelo já aceita mais de uma.
 */
@Injectable()
export class SetupService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  get(tenantId: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const professional = await this.primaryProfessional(tx, tenantId, tenant.attendantName);
      const services = await tx.service.findMany({
        where: { active: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, durationMinutes: true, priceCents: true },
      });
      const windows = await tx.availability.findMany({
        where: { professionalId: professional.id },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
        select: { weekday: true, startMinute: true, endMinute: true },
      });
      return {
        business: {
          name: tenant.name,
          attendantName: tenant.attendantName,
          timezone: tenant.timezone,
          slotStepMinutes: tenant.slotStepMinutes,
          minNoticeMinutes: tenant.minNoticeMinutes,
        },
        services,
        windows,
        faq: readFaq(tenant.faq),
        onboardingCompletedAt: tenant.onboardingCompletedAt,
      };
    });
  }

  async saveBusiness(tenantId: string, input: z.infer<typeof businessBody>) {
    await this.db.withTenant(tenantId, async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: input });
      const professional = await this.primaryProfessional(tx, tenantId, input.attendantName);
      await tx.professional.update({
        where: { id: professional.id },
        data: { name: input.attendantName },
      });
    });
    return this.get(tenantId);
  }

  /** Salva a lista: atualiza os que vieram com id, cria os novos e desativa os que saíram. */
  async saveServices(tenantId: string, input: z.infer<typeof servicesBody>) {
    await this.db.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const professional = await this.primaryProfessional(tx, tenantId, tenant.attendantName);
      const existing = await tx.service.findMany({ select: { id: true } });
      const known = new Set(existing.map((s) => s.id));
      const kept = new Set<string>();

      for (const s of input.services) {
        const data = {
          name: s.name,
          durationMinutes: s.durationMinutes,
          priceCents: s.priceCents ?? null,
        };
        if (s.id && known.has(s.id)) {
          await tx.service.update({ where: { id: s.id }, data: { ...data, active: true } });
          kept.add(s.id);
        } else {
          const created = await tx.service.create({ data: { tenantId, ...data } });
          kept.add(created.id);
        }
      }
      // Desativa em vez de apagar: horários antigos continuam apontando para o serviço.
      await tx.service.updateMany({
        where: { id: { notIn: [...kept] } },
        data: { active: false },
      });
      const linked = await tx.professionalService.findMany({
        where: { professionalId: professional.id },
        select: { serviceId: true },
      });
      const linkedIds = new Set(linked.map((l) => l.serviceId));
      const missing = [...kept].filter((id) => !linkedIds.has(id));
      if (missing.length) {
        await tx.professionalService.createMany({
          data: missing.map((serviceId) => ({
            tenantId,
            professionalId: professional.id,
            serviceId,
          })),
        });
      }
    });
    return this.get(tenantId);
  }

  async saveHours(tenantId: string, input: z.infer<typeof hoursBody>) {
    const byDay = new Map<number, { startMinute: number; endMinute: number }[]>();
    for (const w of input.windows) byDay.set(w.weekday, [...(byDay.get(w.weekday) ?? []), w]);
    for (const list of byDay.values()) {
      list.sort((a, b) => a.startMinute - b.startMinute);
      for (let i = 1; i < list.length; i++) {
        if (list[i]!.startMinute < list[i - 1]!.endMinute) {
          throw new BadRequestException('Há horários que se sobrepõem no mesmo dia.');
        }
      }
    }
    await this.db.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const professional = await this.primaryProfessional(tx, tenantId, tenant.attendantName);
      await tx.availability.deleteMany({ where: { professionalId: professional.id } });
      if (input.windows.length) {
        await tx.availability.createMany({
          data: input.windows.map((w) => ({ tenantId, professionalId: professional.id, ...w })),
        });
      }
    });
    return this.get(tenantId);
  }

  async saveFaq(tenantId: string, input: z.infer<typeof faqBody>) {
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { faq: input.items } }),
    );
    return this.get(tenantId);
  }

  /** Fecha o cronômetro do onboarding. Precisa de pelo menos um serviço e um horário. */
  async complete(tenantId: string, now = new Date()) {
    const current = await this.get(tenantId);
    if (current.services.length === 0)
      throw new BadRequestException('Cadastre pelo menos um serviço.');
    if (current.windows.length === 0)
      throw new BadRequestException('Cadastre os horários de atendimento.');
    if (!current.onboardingCompletedAt) {
      await this.db.withTenant(tenantId, (tx) =>
        tx.tenant.update({ where: { id: tenantId }, data: { onboardingCompletedAt: now } }),
      );
    }
    return this.get(tenantId);
  }

  private async primaryProfessional(tx: TenantTx, tenantId: string, name: string) {
    const found = await tx.professional.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    });
    return found ?? tx.professional.create({ data: { tenantId, name } });
  }
}
