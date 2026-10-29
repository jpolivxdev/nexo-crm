import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { z } from 'zod';
import { AuditService } from '../auth/audit.service.js';
import { hashPassword } from '../auth/password.js';
import type { TenantTx } from '../database/prisma.js';
import { PrismaService } from '../database/prisma.service.js';
import type { newProfessionalBody, professionalBody } from './setup.schemas.js';

type Window = { weekday: number; startMinute: number; endMinute: number };

/** Dois intervalos do mesmo dia não podem se sobrepor. */
export function overlapping(windows: Window[]): boolean {
  const byDay = new Map<number, Window[]>();
  for (const w of windows) byDay.set(w.weekday, [...(byDay.get(w.weekday) ?? []), w]);
  for (const list of byDay.values()) {
    list.sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < list.length; i++) {
      if (list[i]!.startMinute < list[i - 1]!.endMinute) return true;
    }
  }
  return false;
}

/**
 * Equipe do negócio: profissionais, o que cada uma faz, os horários de cada uma e o acesso
 * ao painel (só a própria agenda). A primeira profissional é a agenda da dona (assistente).
 */
@Injectable()
export class TeamService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(tenantId: string) {
    const data = await this.db.withTenant(tenantId, async (tx) => {
      const professionals = await tx.professional.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          active: true,
          userId: true,
          services: { select: { serviceId: true } },
          availability: {
            orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
            select: { weekday: true, startMinute: true, endMinute: true },
          },
        },
      });
      const services = await tx.service.findMany({
        where: { active: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
      });
      return { professionals, services };
    });
    // Logins ficam fora do RLS (o login vem antes do negócio): busca presa ao negócio da sessão.
    const userIds = data.professionals.map((p) => p.userId).filter((id) => id !== null);
    const users = userIds.length
      ? await this.db.client.user.findMany({
          where: { id: { in: userIds }, tenantId },
          select: { id: true, email: true },
        })
      : [];
    const ownerId = data.professionals.find((p) => p.active)?.id ?? null;
    return {
      services: data.services,
      professionals: data.professionals.map(({ userId, services, availability, ...p }) => ({
        ...p,
        isOwner: p.id === ownerId,
        serviceIds: services.map((s) => s.serviceId),
        windows: availability,
        login: users.find((u) => u.id === userId)?.email ?? null,
      })),
    };
  }

  /** Nova profissional: começa com os mesmos serviços e horários da dona, para ajustar depois. */
  async create(tenantId: string, input: z.infer<typeof newProfessionalBody>) {
    await this.db.withTenant(tenantId, async (tx) => {
      const owner = await this.ownerProfessional(tx);
      const created = await tx.professional.create({ data: { tenantId, name: input.name } });
      const services = await tx.service.findMany({ where: { active: true }, select: { id: true } });
      if (services.length) {
        await tx.professionalService.createMany({
          data: services.map((s) => ({ tenantId, professionalId: created.id, serviceId: s.id })),
        });
      }
      if (owner) {
        const windows = await tx.availability.findMany({
          where: { professionalId: owner.id },
          select: { weekday: true, startMinute: true, endMinute: true },
        });
        if (windows.length) {
          await tx.availability.createMany({
            data: windows.map((w) => ({ tenantId, professionalId: created.id, ...w })),
          });
        }
      }
    });
    return this.list(tenantId);
  }

  async update(tenantId: string, id: string, input: z.infer<typeof professionalBody>) {
    if (overlapping(input.windows)) {
      throw new BadRequestException('Há horários que se sobrepõem no mesmo dia.');
    }
    await this.db.withTenant(tenantId, async (tx) => {
      const professional = await tx.professional.findUnique({ where: { id } });
      if (!professional) throw new NotFoundException('Profissional não encontrada.');
      const owner = await this.ownerProfessional(tx);
      if (!input.active && owner?.id === id) {
        throw new BadRequestException('A agenda da dona não pode ser desativada.');
      }
      // Chave estrangeira não passa pelo RLS: confere pelo RLS que os serviços são deste negócio.
      const services = await tx.service.findMany({
        where: { id: { in: input.serviceIds } },
        select: { id: true },
      });
      if (services.length !== new Set(input.serviceIds).size) {
        throw new BadRequestException('Serviço não encontrado. Recarregue a página.');
      }
      await tx.professional.update({
        where: { id },
        data: { name: input.name, active: input.active },
      });
      await tx.professionalService.deleteMany({ where: { professionalId: id } });
      if (services.length) {
        await tx.professionalService.createMany({
          data: services.map((s) => ({ tenantId, professionalId: id, serviceId: s.id })),
        });
      }
      await tx.availability.deleteMany({ where: { professionalId: id } });
      if (input.windows.length) {
        await tx.availability.createMany({
          data: input.windows.map((w) => ({ tenantId, professionalId: id, ...w })),
        });
      }
    });
    return this.list(tenantId);
  }

  /** Cria o acesso da profissional com senha provisória, mostrada uma vez só para a dona. */
  async createLogin(
    tenantId: string,
    id: string,
    rawEmail: string,
    actor: { userId: string; ip: string | null },
  ) {
    const email = rawEmail.trim().toLowerCase();
    const professional = await this.db.withTenant(tenantId, (tx) =>
      tx.professional.findUnique({ where: { id }, select: { id: true, name: true, userId: true } }),
    );
    if (!professional) throw new NotFoundException('Profissional não encontrada.');
    if (professional.userId) throw new ConflictException('Ela já tem acesso.');
    if (await this.db.client.user.findUnique({ where: { email } })) {
      throw new ConflictException('Esse e-mail já tem acesso a um painel.');
    }
    const temporaryPassword = randomBytes(9).toString('base64url');
    const user = await this.db.client.user.create({
      data: {
        email,
        name: professional.name,
        role: 'STAFF',
        tenantId,
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
      },
      select: { id: true },
    });
    await this.db.withTenant(tenantId, (tx) =>
      tx.professional.update({ where: { id }, data: { userId: user.id } }),
    );
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'team.login_created',
      ip: actor.ip,
      metadata: { professionalId: id, userId: user.id },
    });
    return { email, temporaryPassword };
  }

  /** Tira o acesso: o login some (e as sessões abertas caem junto). A agenda dela fica. */
  async removeLogin(tenantId: string, id: string, actor: { userId: string; ip: string | null }) {
    const professional = await this.db.withTenant(tenantId, (tx) =>
      tx.professional.findUnique({ where: { id }, select: { id: true, userId: true } }),
    );
    if (!professional) throw new NotFoundException('Profissional não encontrada.');
    if (!professional.userId) return { ok: true };
    const userId = professional.userId;
    await this.db.withTenant(tenantId, (tx) =>
      tx.professional.update({ where: { id }, data: { userId: null } }),
    );
    await this.db.client.user.deleteMany({ where: { id: userId, tenantId, role: 'STAFF' } });
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'team.login_removed',
      ip: actor.ip,
      metadata: { professionalId: id, userId },
    });
    return { ok: true };
  }

  /** Agenda da dona: a profissional ativa mais antiga (a mesma que o assistente edita). */
  private ownerProfessional(tx: TenantTx) {
    return tx.professional.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
  }
}
