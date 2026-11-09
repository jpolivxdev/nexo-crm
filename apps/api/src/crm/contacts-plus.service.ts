import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  averageInterval,
  checkImport,
  checkPortfolioRules,
  portfolioRulesOf,
  portfolioStatus,
  toCsv,
  type ImportRow,
  type PortfolioRules,
  type PortfolioStatus,
} from '@nexo/core';
import { AuditService } from '../auth/audit.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { TenantTx } from '../database/prisma.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import type { CrmActor } from './crm.service.js';

const SOURCE_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  PANEL: 'Painel',
  PUBLIC_LINK: 'Link de agendamento',
  IMPORT: 'Planilha',
};

function summary(rows: ImportRow[]) {
  const count = (s: ImportRow['status']) => rows.filter((r) => r.status === s).length;
  return {
    total: rows.length,
    new: count('new'),
    existing: count('existing'),
    duplicate: count('duplicate'),
    invalid: count('invalid'),
  };
}

/**
 * Premium: importar e exportar clientes e a Carteira (quem volta, quem está em risco).
 * Sempre no negócio da sessão (withTenant + RLS).
 */
@Injectable()
export class ContactsPlusService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  private async knownPhones(tx: TenantTx): Promise<Set<string>> {
    const rows = await tx.contact.findMany({ select: { phone: true } });
    return new Set(rows.map((r) => r.phone));
  }

  /** Conferência: nada é salvo. A tela mostra cada linha e o que vai acontecer com ela. */
  checkImport(tenantId: string, csv: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const rows = checkImport(csv, await this.knownPhones(tx));
      return { rows, summary: summary(rows) };
    });
  }

  /**
   * Salva o que a conferência aprovou. A planilha é conferida de novo aqui (não confia no que a
   * tela mandou). Novas entram no funil principal, na primeira etapa. Já cadastradas só ganham as
   * etiquetas novas, se a pessoa pediu; telefone de cliente que pediu exclusão não volta.
   */
  async import(tenantId: string, csv: string, updateExisting: boolean, actor: CrmActor) {
    const result = await this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.contact.findMany({
        select: { id: true, phone: true, tags: true, erasedAt: true },
      });
      const rows = checkImport(csv, new Set(existing.map((c) => c.phone)));
      const fresh = rows.filter((r) => r.status === 'new');
      if (fresh.length > 0) {
        await tx.contact.createMany({
          data: fresh.map((r) => ({
            tenantId,
            name: r.name,
            phone: r.phone!,
            tags: r.tags,
            source: 'IMPORT' as const,
          })),
        });
        const created = await tx.contact.findMany({
          where: { phone: { in: fresh.map((r) => r.phone!) } },
          select: { id: true },
        });
        const pipeline = await tx.pipeline.findFirst({
          where: { isDefault: true },
          select: {
            id: true,
            stages: { orderBy: { position: 'asc' }, take: 1, select: { id: true } },
          },
        });
        const first = pipeline?.stages[0];
        if (pipeline && first) {
          await tx.deal.createMany({
            data: created.map((c) => ({
              tenantId,
              contactId: c.id,
              pipelineId: pipeline.id,
              stageId: first.id,
            })),
          });
        }
        await tx.event.createMany({
          data: created.map((c) => ({
            tenantId,
            type: 'contact.created',
            entityType: 'contact',
            entityId: c.id,
            actorType: 'user',
            actorId: actor.userId,
            payload: { contactId: c.id, channel: 'import' },
          })),
        });
      }
      let updated = 0;
      if (updateExisting) {
        for (const r of rows.filter((x) => x.status === 'existing' && x.tags.length > 0)) {
          const c = existing.find((e) => e.phone === r.phone);
          if (!c || c.erasedAt) continue;
          const tags = [...new Set([...c.tags, ...r.tags])].slice(0, 20);
          if (tags.length === c.tags.length) continue;
          await tx.contact.update({ where: { id: c.id }, data: { tags } });
          updated += 1;
        }
      }
      return { created: fresh.length, updated, skipped: rows.length - fresh.length - updated };
    });
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'contacts.imported',
      ip: actor.ip,
      metadata: result,
    });
    this.bus.publish(tenantId, { type: 'contact.updated' });
    return result;
  }

  /** Planilha de clientes (dados pessoais). Fica na auditoria. */
  async exportCsv(tenantId: string, actor: CrmActor) {
    const { csv, count } = await this.db.withTenant(tenantId, async (tx) => {
      const contacts = await tx.contact.findMany({
        where: { erasedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          name: true,
          phone: true,
          tags: true,
          source: true,
          optedOutAt: true,
          createdAt: true,
          deals: {
            where: { closedAt: null, pipeline: { isDefault: true } },
            take: 1,
            select: { stage: { select: { name: true } } },
          },
          appointments: {
            where: { status: 'DONE' },
            orderBy: { startsAt: 'desc' },
            select: { startsAt: true },
          },
        },
      });
      const header = [
        'Nome',
        'Telefone',
        'Etiquetas',
        'Origem',
        'Etapa',
        'Atendimentos realizados',
        'Último atendimento',
        'Não quer mensagens',
        'Cliente desde',
      ];
      const rows = contacts.map((c) => [
        c.name,
        c.phone,
        c.tags.join(', '),
        SOURCE_LABEL[c.source] ?? c.source,
        c.deals[0]?.stage.name ?? null,
        c.appointments.length,
        c.appointments[0]?.startsAt.toISOString().slice(0, 10) ?? null,
        c.optedOutAt ? 'sim' : 'não',
        c.createdAt.toISOString().slice(0, 10),
      ]);
      return { csv: toCsv([header, ...rows]), count: rows.length };
    });
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'contacts.exported',
      ip: actor.ip,
      metadata: { rows: count },
    });
    return csv;
  }

  /** Carteira: quem já foi atendida, com a situação da volta. Pior situação primeiro. */
  portfolio(tenantId: string, now = new Date()) {
    return this.db.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { portfolioRules: true },
      });
      const rules = portfolioRulesOf(tenant.portfolioRules);
      const done = await tx.appointment.findMany({
        where: { status: 'DONE', contact: { erasedAt: null } },
        select: {
          contactId: true,
          startsAt: true,
          service: { select: { priceCents: true } },
        },
      });
      const next = await tx.appointment.findMany({
        where: { status: { in: ['SCHEDULED', 'CONFIRMED'] }, startsAt: { gt: now } },
        orderBy: { startsAt: 'asc' },
        select: { contactId: true, startsAt: true },
      });
      const byContact = new Map<string, { dates: Date[]; totalCents: number }>();
      for (const a of done) {
        const entry = byContact.get(a.contactId) ?? { dates: [], totalCents: 0 };
        entry.dates.push(a.startsAt);
        entry.totalCents += a.service.priceCents ?? 0;
        byContact.set(a.contactId, entry);
      }
      const contacts = await tx.contact.findMany({
        where: { id: { in: [...byContact.keys()] } },
        select: { id: true, name: true, phone: true, tags: true, optedOutAt: true },
      });
      const order: Record<PortfolioStatus, number> = { lost: 0, risk: 1, attention: 2, ok: 3 };
      const list = contacts
        .map((c) => {
          const entry = byContact.get(c.id)!;
          const last = new Date(Math.max(...entry.dates.map((d) => d.getTime())));
          const nextAt = next.find((n) => n.contactId === c.id)?.startsAt ?? null;
          const avgIntervalDays = averageInterval(entry.dates);
          const { status, daysSince } = portfolioStatus({
            lastDoneAt: last,
            hasNext: nextAt !== null,
            avgIntervalDays,
            now,
            rules,
          });
          return {
            ...c,
            status,
            daysSince,
            visits: entry.dates.length,
            totalCents: entry.totalCents,
            avgIntervalDays,
            lastDoneAt: last,
            nextAt,
          };
        })
        .sort((a, b) => order[a.status] - order[b.status] || b.totalCents - a.totalCents);
      const count = (s: PortfolioStatus) => list.filter((c) => c.status === s).length;
      return {
        rules,
        summary: {
          total: list.length,
          ok: count('ok'),
          attention: count('attention'),
          risk: count('risk'),
          lost: count('lost'),
          totalCents: list.reduce((sum, c) => sum + c.totalCents, 0),
        },
        clients: list,
      };
    });
  }

  async saveRules(tenantId: string, rules: PortfolioRules, actor: CrmActor) {
    const problem = checkPortfolioRules(rules);
    if (problem) throw new BadRequestException(problem);
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { portfolioRules: { ...rules } } }),
    );
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'portfolio.rules_updated',
      ip: actor.ip,
      metadata: { ...rules },
    });
    return rules;
  }
}
