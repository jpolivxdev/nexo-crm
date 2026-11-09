import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { checkBoard, checkWikiFile, type BoardElement } from '@nexo/core';
import { PrismaService } from '../database/prisma.service.js';
import type { TenantTx } from '../database/prisma.js';
import type { Prisma, Role } from '../generated/prisma/client.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';

export interface BoardActor {
  userId: string;
  name: string;
  role: Role;
}

const TEAM_ROLES: readonly Role[] = ['OWNER', 'MANAGER', 'CONSULTANT', 'STAFF'];
/** Na lista, a miniatura só vem para quadros pequenos (o resto mostra só o nome). */
const THUMB_MAX = 400;

/**
 * Quadro branco (Premium): toda a equipe desenha nos quadros do negócio. Arquivar é de quem
 * criou, da dona ou do gestor. Cada salvamento sobe a versão; salvar por cima de uma versão
 * mais nova dá 409, para ninguém apagar sem querer o que a outra pessoa fez.
 */
@Injectable()
export class BoardService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  private check(actor: BoardActor) {
    if (!TEAM_ROLES.includes(actor.role)) {
      throw new ForbiddenException('O quadro branco é só da equipe do negócio.');
    }
  }

  private async board(tx: TenantTx, id: string) {
    const board = await tx.board.findFirst({ where: { id, archivedAt: null } });
    if (!board) throw new NotFoundException('Quadro não encontrado.');
    return board;
  }

  private canArchive(actor: BoardActor, createdById: string) {
    return actor.role === 'OWNER' || actor.role === 'MANAGER' || actor.userId === createdById;
  }

  list(tenantId: string, actor: BoardActor) {
    this.check(actor);
    return this.db.withTenant(tenantId, async (tx) => {
      const boards = await tx.board.findMany({
        where: { archivedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      });
      return {
        boards: boards.map((b) => {
          const elements = b.elements as unknown as BoardElement[];
          return {
            id: b.id,
            title: b.title,
            updatedAt: b.updatedAt.toISOString(),
            updatedByName: b.updatedByName,
            count: elements.length,
            preview: elements.length <= THUMB_MAX ? elements : null,
            canArchive: this.canArchive(actor, b.createdById),
          };
        }),
      };
    });
  }

  async create(tenantId: string, title: string, actor: BoardActor) {
    this.check(actor);
    const board = await this.db.withTenant(tenantId, (tx) =>
      tx.board.create({
        data: { tenantId, title, createdById: actor.userId, updatedByName: actor.name },
      }),
    );
    this.bus.publish(tenantId, { type: 'board.updated', id: board.id });
    return { id: board.id };
  }

  get(tenantId: string, id: string, actor: BoardActor) {
    this.check(actor);
    return this.db.withTenant(tenantId, async (tx) => {
      const b = await this.board(tx, id);
      return {
        id: b.id,
        title: b.title,
        elements: b.elements as unknown as BoardElement[],
        version: b.version,
        updatedAt: b.updatedAt.toISOString(),
        updatedByName: b.updatedByName,
        canArchive: this.canArchive(actor, b.createdById),
      };
    });
  }

  /** Salva o quadro inteiro (desenhos conferidos por checkBoard). */
  async save(
    tenantId: string,
    id: string,
    input: { title?: string; elements: unknown; version: number },
    actor: BoardActor,
  ) {
    this.check(actor);
    const checked = checkBoard(input.elements);
    if (!checked.ok) throw new BadRequestException(checked.error);
    const result = await this.db.withTenant(tenantId, async (tx) => {
      const b = await this.board(tx, id);
      if (checked.fileIds.length > 0) {
        const files = await tx.boardFile.count({
          where: { boardId: id, id: { in: checked.fileIds } },
        });
        if (files !== checked.fileIds.length) {
          throw new BadRequestException('Imagem que não é deste quadro.');
        }
      }
      // Só grava se ninguém salvou antes (versão igual à que a tela abriu).
      const updated = await tx.board.updateMany({
        where: { id: b.id, version: input.version },
        data: {
          elements: checked.elements as unknown as Prisma.InputJsonArray,
          version: { increment: 1 },
          updatedByName: actor.name,
          ...(input.title ? { title: input.title } : {}),
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'Outra pessoa mudou este quadro agora há pouco. Abra de novo para ver a versão nova.',
        );
      }
      return { version: input.version + 1 };
    });
    this.bus.publish(tenantId, { type: 'board.updated', id });
    return result;
  }

  async rename(tenantId: string, id: string, title: string, actor: BoardActor) {
    this.check(actor);
    await this.db.withTenant(tenantId, async (tx) => {
      await this.board(tx, id);
      await tx.board.update({ where: { id }, data: { title, updatedByName: actor.name } });
    });
    this.bus.publish(tenantId, { type: 'board.updated', id });
    return { ok: true };
  }

  async archive(tenantId: string, id: string, actor: BoardActor) {
    this.check(actor);
    await this.db.withTenant(tenantId, async (tx) => {
      const b = await this.board(tx, id);
      if (!this.canArchive(actor, b.createdById)) {
        throw new ForbiddenException('Só quem criou o quadro, a dona ou o gestor arquivam.');
      }
      await tx.board.update({ where: { id }, data: { archivedAt: new Date() } });
    });
    this.bus.publish(tenantId, { type: 'board.updated', id });
    return { ok: true };
  }

  /** Imagem colada no quadro: só PNG, JPG, WEBP ou GIF, conferida pelo conteúdo. */
  addFile(tenantId: string, id: string, name: string, data: Buffer, actor: BoardActor) {
    this.check(actor);
    const check = checkWikiFile(name || 'imagem', data);
    if (!check.ok) throw new BadRequestException(check.error);
    if (!check.image) throw new BadRequestException('No quadro só entram imagens.');
    return this.db.withTenant(tenantId, async (tx) => {
      await this.board(tx, id);
      const file = await tx.boardFile.create({
        data: {
          tenantId,
          boardId: id,
          mime: check.type,
          size: data.length,
          data: new Uint8Array(data),
          createdById: actor.userId,
        },
        select: { id: true },
      });
      return { id: file.id };
    });
  }

  file(tenantId: string, id: string, actor: BoardActor) {
    this.check(actor);
    return this.db.withTenant(tenantId, async (tx) => {
      const file = await tx.boardFile.findFirst({
        where: { id, board: { archivedAt: null } },
        select: { mime: true, data: true },
      });
      if (!file) throw new NotFoundException('Imagem não encontrada.');
      return file;
    });
  }
}
