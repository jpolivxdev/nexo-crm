import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { TenantTx } from '../database/prisma.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';

/** Assuntos do chamado (lista fechada, para a nexo separar o que chega). */
export const SUPPORT_TOPICS = [
  'duvida',
  'problema',
  'pedido',
  'whatsapp',
  'conta',
  'outro',
] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export type SupportStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';

interface Author {
  id: string;
  name: string;
}

const LIST_SELECT = {
  id: true,
  topic: true,
  subject: true,
  status: true,
  ownerUnread: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Chamados de suporte entre o negócio e a nexo. A dona abre e acompanha os do próprio negócio
 * (RLS por negócio). O painel da nexo lê e responde todos com `app.support_admin` ligado só na
 * transação: nada além destas duas tabelas fica visível por esse caminho.
 */
@Injectable()
export class SupportService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  /** Transação do painel de suporte da nexo. */
  private asSupport<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return this.db.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.support_admin', 'on', true)`;
      return fn(tx);
    });
  }

  // ---------- Lado do negócio ----------

  list(tenantId: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.supportTicket.findMany({ orderBy: { updatedAt: 'desc' }, take: 50, select: LIST_SELECT }),
    );
  }

  /** Respostas da nexo que a dona ainda não abriu (para o sino). */
  unread(tenantId: string) {
    return this.db.withTenant(tenantId, async (tx) => ({
      count: await tx.supportTicket.count({ where: { ownerUnread: true } }),
    }));
  }

  async open(
    tenantId: string,
    author: Author,
    input: { topic: SupportTopic; subject: string; description: string },
  ) {
    const ticket = await this.db.withTenant(tenantId, async (tx) => {
      const created = await tx.supportTicket.create({
        data: { tenantId, createdById: author.id, ...input },
        select: LIST_SELECT,
      });
      await tx.supportMessage.create({
        data: {
          tenantId,
          ticketId: created.id,
          authorType: 'owner',
          authorId: author.id,
          authorName: author.name,
          body: input.description,
        },
      });
      return created;
    });
    return ticket;
  }

  /** Abre o chamado: marca a resposta da nexo como vista. */
  one(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const ticket = await this.ticket(tx, id);
      if (ticket.ownerUnread) {
        await tx.supportTicket.update({ where: { id }, data: { ownerUnread: false } });
      }
      return { ...ticket, ownerUnread: false };
    });
  }

  ownerReply(tenantId: string, id: string, author: Author, body: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const ticket = await this.ticket(tx, id);
      await tx.supportMessage.create({
        data: {
          tenantId,
          ticketId: id,
          authorType: 'owner',
          authorId: author.id,
          authorName: author.name,
          body,
        },
      });
      // Escrever de novo reabre o chamado para a nexo.
      await tx.supportTicket.update({ where: { id: ticket.id }, data: { status: 'OPEN' } });
      return this.ticket(tx, id);
    });
  }

  close(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      await this.ticket(tx, id);
      await tx.supportTicket.update({
        where: { id },
        data: { status: 'CLOSED', ownerUnread: false },
      });
      return this.ticket(tx, id);
    });
  }

  // ---------- Painel da nexo ----------

  adminList(status?: SupportStatus) {
    return this.asSupport(async (tx) => {
      const rows = await tx.supportTicket.findMany({
        where: status ? { status } : {},
        orderBy: { updatedAt: 'desc' },
        take: 100,
        select: { ...LIST_SELECT, tenantId: true },
      });
      const counts = await tx.supportTicket.groupBy({ by: ['status'], _count: { _all: true } });
      const names = await this.tenantNames(
        tx,
        rows.map((r) => r.tenantId),
      );
      return {
        tickets: rows.map((t) => ({ ...t, tenantName: names.get(t.tenantId) ?? 'Negócio' })),
        counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      };
    });
  }

  adminOne(id: string) {
    return this.asSupport(async (tx) => {
      const ticket = await this.ticket(tx, id);
      const { tenantId } = await tx.supportTicket.findUniqueOrThrow({
        where: { id },
        select: { tenantId: true },
      });
      const names = await this.tenantNames(tx, [tenantId]);
      return { ...ticket, tenantId, tenantName: names.get(tenantId) ?? 'Negócio' };
    });
  }

  async adminReply(id: string, author: Author, body: string) {
    const result = await this.asSupport(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({
        where: { id },
        select: { id: true, tenantId: true, status: true },
      });
      if (!ticket) throw new NotFoundException('Chamado não encontrado.');
      if (ticket.status === 'CLOSED') {
        throw new ConflictException('Chamado encerrado. A dona pode reabrir escrevendo de novo.');
      }
      await tx.supportMessage.create({
        data: {
          tenantId: ticket.tenantId,
          ticketId: id,
          authorType: 'nexo',
          authorId: author.id,
          authorName: author.name,
          body,
        },
      });
      await tx.supportTicket.update({
        where: { id },
        data: { status: 'ANSWERED', ownerUnread: true },
      });
      return { tenantId: ticket.tenantId, ticket: await this.ticket(tx, id) };
    });
    this.bus.publish(result.tenantId, { type: 'support.updated', id });
    return result.ticket;
  }

  async adminStatus(id: string, status: SupportStatus) {
    const result = await this.asSupport(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({
        where: { id },
        select: { tenantId: true },
      });
      if (!ticket) throw new NotFoundException('Chamado não encontrado.');
      await tx.supportTicket.update({ where: { id }, data: { status } });
      return { tenantId: ticket.tenantId, ticket: await this.ticket(tx, id) };
    });
    this.bus.publish(result.tenantId, { type: 'support.updated', id });
    return result.ticket;
  }

  /** Nome do negócio pelo diretório (a tabela de negócios fica fechada pelo RLS). */
  private async tenantNames(tx: TenantTx, ids: string[]) {
    const rows = await tx.tenantDirectory.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private async ticket(tx: TenantTx, id: string) {
    const ticket = await tx.supportTicket.findUnique({
      where: { id },
      select: {
        ...LIST_SELECT,
        description: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 200,
          select: { id: true, authorType: true, authorName: true, body: true, createdAt: true },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Chamado não encontrado.');
    return ticket;
  }
}
