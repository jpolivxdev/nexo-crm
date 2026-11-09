import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { TenantTx } from '../database/prisma.js';
import type { Role } from '../generated/prisma/client.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';

/** Quem está no chat. O nome vem da sessão; o negócio, também. */
export interface ChatActor {
  userId: string;
  name: string;
  role: Role;
}

const TEAM_ROLES: readonly Role[] = ['OWNER', 'MANAGER', 'CONSULTANT', 'STAFF'];
/** O canal "Geral" usa uma chave fixa: assim nasce uma vez só, mesmo com duas telas abertas. */
const GENERAL_KEY = 'geral';
const PAGE = 50;

export const directKey = (a: string, b: string) => [a, b].sort().join(':');

/**
 * Chat interno da equipe (Premium). Canais são de toda a equipe; a conversa direta é só das duas
 * pessoas (quem participa fica em chat_reads). Admin nexo, mesmo dentro do negócio, não entra:
 * é conversa da equipe. Mensagem apagada perde o texto, mas fica registrada.
 */
@Injectable()
export class ChatService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  private check(actor: ChatActor) {
    if (!TEAM_ROLES.includes(actor.role)) {
      throw new ForbiddenException('O chat é só da equipe do negócio.');
    }
  }

  private team(tx: TenantTx, tenantId: string) {
    return tx.user.findMany({
      where: { tenantId, role: { in: [...TEAM_ROLES] } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true },
    });
  }

  /** Canal que a pessoa pode ver: canal da equipe, ou conversa direta em que ela participa. */
  private async channelFor(tx: TenantTx, channelId: string, userId: string) {
    const channel = await tx.chatChannel.findFirst({
      where: {
        id: channelId,
        OR: [{ kind: 'channel' }, { kind: 'direct', reads: { some: { userId } } }],
      },
    });
    if (!channel) throw new NotFoundException('Conversa não encontrada.');
    return channel;
  }

  private markRead(tx: TenantTx, tenantId: string, channelId: string, userId: string) {
    const lastReadAt = new Date();
    return tx.chatRead.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { tenantId, channelId, userId, lastReadAt },
      update: { lastReadAt },
    });
  }

  /** Lista de canais e conversas diretas, com o que falta ler. Cria o "Geral" na primeira vez. */
  list(tenantId: string, actor: ChatActor) {
    this.check(actor);
    return this.db.withTenant(tenantId, async (tx) => {
      await tx.chatChannel.upsert({
        where: { tenantId_directKey: { tenantId, directKey: GENERAL_KEY } },
        create: {
          tenantId,
          kind: 'channel',
          name: 'Geral',
          directKey: GENERAL_KEY,
          createdById: actor.userId,
        },
        update: {},
      });
      const [people, channels, reads] = await Promise.all([
        this.team(tx, tenantId),
        tx.chatChannel.findMany({
          where: {
            archivedAt: null,
            OR: [
              { kind: 'channel' },
              { kind: 'direct', reads: { some: { userId: actor.userId } } },
            ],
          },
          include: { reads: { select: { userId: true } } },
        }),
        tx.chatRead.findMany({ where: { userId: actor.userId } }),
      ]);
      const readAt = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));
      const items = await Promise.all(
        channels.map(async (c) => {
          const since = readAt.get(c.id) ?? null;
          const [unread, last] = await Promise.all([
            tx.chatMessage.count({
              where: {
                channelId: c.id,
                deletedAt: null,
                authorId: { not: actor.userId },
                ...(since ? { createdAt: { gt: since } } : {}),
              },
            }),
            tx.chatMessage.findFirst({
              where: { channelId: c.id },
              orderBy: { createdAt: 'desc' },
              select: { authorName: true, body: true, createdAt: true },
            }),
          ]);
          const otherId = c.reads.map((r) => r.userId).find((id) => id !== actor.userId);
          const other = c.kind === 'direct' ? people.find((p) => p.id === otherId) : undefined;
          return {
            id: c.id,
            kind: c.kind as 'channel' | 'direct',
            name: c.kind === 'direct' ? (other?.name ?? 'Login removido') : (c.name ?? ''),
            general: c.directKey === GENERAL_KEY,
            withUserId: c.kind === 'direct' ? (otherId ?? null) : null,
            createdById: c.createdById,
            unread,
            last: last
              ? { authorName: last.authorName, body: last.body, at: last.createdAt.toISOString() }
              : null,
            lastMessageAt: (c.lastMessageAt ?? c.createdAt).toISOString(),
          };
        }),
      );
      const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
      const channelsOut = items
        .filter((i) => i.kind === 'channel')
        .sort((a, b) => (a.general === b.general ? byName(a, b) : a.general ? -1 : 1));
      const directs = items
        .filter((i) => i.kind === 'direct')
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
      return {
        me: actor.userId,
        channels: channelsOut,
        directs,
        people: people.filter((p) => p.id !== actor.userId),
        unread: items.reduce((sum, i) => sum + i.unread, 0),
      };
    });
  }

  async createChannel(tenantId: string, name: string, actor: ChatActor) {
    this.check(actor);
    const clean = name.trim().replace(/\s+/g, ' ');
    const channel = await this.db.withTenant(tenantId, async (tx) => {
      const same = await tx.chatChannel.findFirst({
        where: { kind: 'channel', archivedAt: null, name: { equals: clean, mode: 'insensitive' } },
      });
      if (same) throw new BadRequestException('Já existe um canal com esse nome.');
      return tx.chatChannel.create({
        data: { tenantId, kind: 'channel', name: clean, createdById: actor.userId },
      });
    });
    this.bus.publish(tenantId, { type: 'chat.updated', id: channel.id });
    return { id: channel.id };
  }

  /** Arquiva um canal (some da lista; as mensagens ficam). O Geral não sai. */
  async archiveChannel(tenantId: string, channelId: string, actor: ChatActor) {
    this.check(actor);
    await this.db.withTenant(tenantId, async (tx) => {
      const channel = await this.channelFor(tx, channelId, actor.userId);
      if (channel.kind !== 'channel') throw new BadRequestException('Só canais são arquivados.');
      if (channel.directKey === GENERAL_KEY) {
        throw new BadRequestException('O canal Geral não pode ser arquivado.');
      }
      const canManage = actor.role === 'OWNER' || actor.role === 'MANAGER';
      if (!canManage && channel.createdById !== actor.userId) {
        throw new ForbiddenException('Só quem criou o canal, a dona ou o gestor arquivam.');
      }
      await tx.chatChannel.update({ where: { id: channel.id }, data: { archivedAt: new Date() } });
    });
    this.bus.publish(tenantId, { type: 'chat.updated', id: channelId });
    return { ok: true };
  }

  /** Abre (ou cria) a conversa direta com outra pessoa da equipe. */
  async direct(tenantId: string, withUserId: string, actor: ChatActor) {
    this.check(actor);
    if (withUserId === actor.userId) {
      throw new BadRequestException('Escolha outra pessoa da equipe.');
    }
    const channel = await this.db.withTenant(tenantId, async (tx) => {
      const other = await tx.user.findFirst({
        where: { id: withUserId, tenantId, role: { in: [...TEAM_ROLES] } },
        select: { id: true },
      });
      if (!other) throw new NotFoundException('Pessoa não encontrada na equipe.');
      const key = directKey(actor.userId, other.id);
      const found = await tx.chatChannel.upsert({
        where: { tenantId_directKey: { tenantId, directKey: key } },
        create: { tenantId, kind: 'direct', directKey: key, createdById: actor.userId },
        update: { archivedAt: null },
      });
      await tx.chatRead.createMany({
        data: [actor.userId, other.id].map((userId) => ({
          tenantId,
          channelId: found.id,
          userId,
        })),
        skipDuplicates: true,
      });
      return found;
    });
    return { id: channel.id };
  }

  /** Últimas mensagens (de 50 em 50). Sem `before`, marca a conversa como lida. */
  messages(tenantId: string, channelId: string, before: Date | undefined, actor: ChatActor) {
    this.check(actor);
    return this.db.withTenant(tenantId, async (tx) => {
      await this.channelFor(tx, channelId, actor.userId);
      const rows = await tx.chatMessage.findMany({
        where: { channelId, ...(before ? { createdAt: { lt: before } } : {}) },
        orderBy: { createdAt: 'desc' },
        take: PAGE + 1,
      });
      if (!before) await this.markRead(tx, tenantId, channelId, actor.userId);
      const page = rows.slice(0, PAGE).reverse();
      return {
        more: rows.length > PAGE,
        messages: page.map((m) => ({
          id: m.id,
          authorId: m.authorId,
          authorName: m.authorName,
          body: m.body,
          deleted: m.deletedAt !== null,
          mine: m.authorId === actor.userId,
          at: m.createdAt.toISOString(),
        })),
      };
    });
  }

  async send(tenantId: string, channelId: string, body: string, actor: ChatActor) {
    this.check(actor);
    const text = body.trim();
    if (!text) throw new BadRequestException('Escreva a mensagem.');
    const message = await this.db.withTenant(tenantId, async (tx) => {
      const channel = await this.channelFor(tx, channelId, actor.userId);
      if (channel.archivedAt) throw new BadRequestException('Este canal foi arquivado.');
      const created = await tx.chatMessage.create({
        data: {
          tenantId,
          channelId,
          authorId: actor.userId,
          authorName: actor.name,
          body: text,
        },
      });
      await tx.chatChannel.update({
        where: { id: channelId },
        data: { lastMessageAt: created.createdAt },
      });
      await this.markRead(tx, tenantId, channelId, actor.userId);
      return created;
    });
    this.bus.publish(tenantId, { type: 'chat.updated', id: channelId });
    return { id: message.id, at: message.createdAt.toISOString() };
  }

  /** Apaga a própria mensagem: o texto sai, fica "mensagem apagada". */
  async remove(tenantId: string, channelId: string, messageId: string, actor: ChatActor) {
    this.check(actor);
    await this.db.withTenant(tenantId, async (tx) => {
      await this.channelFor(tx, channelId, actor.userId);
      const message = await tx.chatMessage.findFirst({ where: { id: messageId, channelId } });
      if (!message) throw new NotFoundException('Mensagem não encontrada.');
      if (message.authorId !== actor.userId) {
        throw new ForbiddenException('Só quem escreveu apaga a mensagem.');
      }
      await tx.chatMessage.update({
        where: { id: messageId },
        data: { body: null, deletedAt: message.deletedAt ?? new Date() },
      });
    });
    this.bus.publish(tenantId, { type: 'chat.updated', id: channelId });
    return { ok: true };
  }

  async read(tenantId: string, channelId: string, actor: ChatActor) {
    this.check(actor);
    await this.db.withTenant(tenantId, async (tx) => {
      await this.channelFor(tx, channelId, actor.userId);
      await this.markRead(tx, tenantId, channelId, actor.userId);
    });
    return { ok: true };
  }
}
