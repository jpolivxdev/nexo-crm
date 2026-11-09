import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { checkWikiFile, plainText, snippet, WIKI_TENANT_MAX_BYTES } from '@nexo/core';
import { PrismaService } from '../database/prisma.service.js';
import type { TenantTx } from '../database/prisma.js';
import type { Role } from '../generated/prisma/client.js';

export interface WikiActor {
  userId: string;
  name: string;
  role: Role;
}

export interface ArticleInput {
  title: string;
  body: string;
  categoryId: string | null;
  pinned: boolean;
}

const TEAM_ROLES: readonly Role[] = ['OWNER', 'MANAGER', 'CONSULTANT', 'STAFF'];
const EDITORS: readonly Role[] = ['OWNER', 'MANAGER'];

/**
 * Wiki do negócio (Premium): toda a equipe lê; a dona e o gestor escrevem. A nexo, numa entrada
 * de suporte, não entra (é material interno do negócio). Artigo arquivado e anexo removido
 * saem das telas, mas ficam no banco.
 */
@Injectable()
export class WikiService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  private reader(actor: WikiActor) {
    if (!TEAM_ROLES.includes(actor.role)) {
      throw new ForbiddenException('A Wiki é só da equipe do negócio.');
    }
  }

  private editor(actor: WikiActor) {
    this.reader(actor);
    if (!EDITORS.includes(actor.role)) {
      throw new ForbiddenException('Só a dona e o gestor escrevem na Wiki.');
    }
  }

  private async article(tx: TenantTx, id: string) {
    const article = await tx.wikiArticle.findFirst({ where: { id, archivedAt: null } });
    if (!article) throw new NotFoundException('Artigo não encontrado.');
    return article;
  }

  private async checkCategory(tx: TenantTx, categoryId: string | null) {
    if (!categoryId) return;
    const found = await tx.wikiCategory.findFirst({ where: { id: categoryId } });
    if (!found) throw new BadRequestException('Categoria não encontrada.');
  }

  private async usedBytes(tx: TenantTx) {
    const sum = await tx.wikiAttachment.aggregate({
      where: { deletedAt: null },
      _sum: { size: true },
    });
    return sum._sum.size ?? 0;
  }

  /** Lista (e busca) de artigos, com as categorias e quanto dos anexos já foi usado. */
  list(tenantId: string, q: string | undefined, categoryId: string | undefined, actor: WikiActor) {
    this.reader(actor);
    const term = q?.trim() ?? '';
    return this.db.withTenant(tenantId, async (tx) => {
      const [categories, counts, articles, used] = await Promise.all([
        tx.wikiCategory.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
        tx.wikiArticle.groupBy({
          by: ['categoryId'],
          where: { archivedAt: null },
          _count: { _all: true },
        }),
        tx.wikiArticle.findMany({
          where: {
            archivedAt: null,
            ...(categoryId ? { categoryId } : {}),
            ...(term
              ? {
                  OR: [
                    { title: { contains: term, mode: 'insensitive' as const } },
                    { body: { contains: term, mode: 'insensitive' as const } },
                  ],
                }
              : {}),
          },
          orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
          take: 200,
        }),
        this.usedBytes(tx),
      ]);
      const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      const inTitle = (title: string) => term !== '' && fold(title).includes(fold(term));
      const rows = articles.map((a) => ({
        id: a.id,
        title: a.title,
        categoryId: a.categoryId,
        pinned: a.pinned,
        updatedAt: a.updatedAt.toISOString(),
        updatedByName: a.updatedByName,
        excerpt: snippet(plainText(a.body), term),
      }));
      // Na busca, quem tem o termo no título vem antes.
      if (term) rows.sort((a, b) => Number(inTitle(b.title)) - Number(inTitle(a.title)));
      return {
        canEdit: EDITORS.includes(actor.role),
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          count: counts.find((n) => n.categoryId === c.id)?._count._all ?? 0,
        })),
        total: counts.reduce((sum, n) => sum + n._count._all, 0),
        articles: rows,
        usage: { bytes: used, max: WIKI_TENANT_MAX_BYTES },
      };
    });
  }

  get(tenantId: string, id: string, actor: WikiActor) {
    this.reader(actor);
    return this.db.withTenant(tenantId, async (tx) => {
      const a = await this.article(tx, id);
      const attachments = await tx.wikiAttachment.findMany({
        where: { articleId: id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, mime: true, size: true, createdAt: true },
      });
      return {
        id: a.id,
        title: a.title,
        body: a.body,
        categoryId: a.categoryId,
        pinned: a.pinned,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        updatedByName: a.updatedByName,
        canEdit: EDITORS.includes(actor.role),
        attachments: attachments.map((f) => ({
          ...f,
          image: f.mime.startsWith('image/'),
          createdAt: f.createdAt.toISOString(),
        })),
      };
    });
  }

  create(tenantId: string, input: ArticleInput, actor: WikiActor) {
    this.editor(actor);
    return this.db.withTenant(tenantId, async (tx) => {
      await this.checkCategory(tx, input.categoryId);
      const a = await tx.wikiArticle.create({
        data: {
          tenantId,
          title: input.title,
          body: input.body,
          categoryId: input.categoryId,
          pinned: input.pinned,
          createdById: actor.userId,
          updatedByName: actor.name,
        },
      });
      return { id: a.id };
    });
  }

  update(tenantId: string, id: string, input: ArticleInput, actor: WikiActor) {
    this.editor(actor);
    return this.db.withTenant(tenantId, async (tx) => {
      await this.article(tx, id);
      await this.checkCategory(tx, input.categoryId);
      await tx.wikiArticle.update({
        where: { id },
        data: {
          title: input.title,
          body: input.body,
          categoryId: input.categoryId,
          pinned: input.pinned,
          updatedByName: actor.name,
        },
      });
      return { id };
    });
  }

  archive(tenantId: string, id: string, actor: WikiActor) {
    this.editor(actor);
    return this.db.withTenant(tenantId, async (tx) => {
      await this.article(tx, id);
      await tx.wikiArticle.update({ where: { id }, data: { archivedAt: new Date() } });
      return { ok: true };
    });
  }

  // ---------- Categorias ----------

  createCategory(tenantId: string, name: string, actor: WikiActor) {
    this.editor(actor);
    return this.db.withTenant(tenantId, async (tx) => {
      await this.uniqueName(tx, name);
      const last = await tx.wikiCategory.aggregate({ _max: { position: true } });
      const c = await tx.wikiCategory.create({
        data: { tenantId, name, position: (last._max.position ?? -1) + 1 },
      });
      return { id: c.id };
    });
  }

  renameCategory(tenantId: string, id: string, name: string, actor: WikiActor) {
    this.editor(actor);
    return this.db.withTenant(tenantId, async (tx) => {
      const found = await tx.wikiCategory.findFirst({ where: { id } });
      if (!found) throw new NotFoundException('Categoria não encontrada.');
      await this.uniqueName(tx, name, id);
      await tx.wikiCategory.update({ where: { id }, data: { name } });
      return { id };
    });
  }

  /** Tira a categoria; os artigos dela ficam sem categoria (nenhum artigo some). */
  removeCategory(tenantId: string, id: string, actor: WikiActor) {
    this.editor(actor);
    return this.db.withTenant(tenantId, async (tx) => {
      const found = await tx.wikiCategory.findFirst({ where: { id } });
      if (!found) throw new NotFoundException('Categoria não encontrada.');
      await tx.wikiArticle.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
      await tx.wikiCategory.delete({ where: { id } });
      return { ok: true };
    });
  }

  private async uniqueName(tx: TenantTx, name: string, except?: string) {
    const same = await tx.wikiCategory.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(except ? { id: { not: except } } : {}),
      },
    });
    if (same) throw new BadRequestException('Já existe uma categoria com esse nome.');
  }

  // ---------- Anexos ----------

  attach(tenantId: string, articleId: string, name: string, data: Buffer, actor: WikiActor) {
    this.editor(actor);
    const check = checkWikiFile(name, data);
    if (!check.ok) throw new BadRequestException(check.error);
    return this.db.withTenant(tenantId, async (tx) => {
      await this.article(tx, articleId);
      if ((await this.usedBytes(tx)) + data.length > WIKI_TENANT_MAX_BYTES) {
        throw new BadRequestException(
          'O espaço de anexos da Wiki acabou. Remova anexos que não usa mais.',
        );
      }
      const file = await tx.wikiAttachment.create({
        data: {
          tenantId,
          articleId,
          name: check.name,
          mime: check.type,
          size: data.length,
          data: new Uint8Array(data),
          createdById: actor.userId,
        },
        select: { id: true },
      });
      await tx.wikiArticle.update({
        where: { id: articleId },
        data: { updatedByName: actor.name },
      });
      return { id: file.id, name: check.name, image: check.image };
    });
  }

  removeAttachment(tenantId: string, id: string, actor: WikiActor) {
    this.editor(actor);
    return this.db.withTenant(tenantId, async (tx) => {
      const file = await tx.wikiAttachment.findFirst({
        where: { id, deletedAt: null, article: { archivedAt: null } },
        select: { id: true },
      });
      if (!file) throw new NotFoundException('Anexo não encontrado.');
      await tx.wikiAttachment.update({ where: { id }, data: { deletedAt: new Date() } });
      return { ok: true };
    });
  }

  file(tenantId: string, id: string, actor: WikiActor) {
    this.reader(actor);
    return this.db.withTenant(tenantId, async (tx) => {
      const file = await tx.wikiAttachment.findFirst({
        where: { id, deletedAt: null, article: { archivedAt: null } },
        select: { name: true, mime: true, data: true },
      });
      if (!file) throw new NotFoundException('Anexo não encontrado.');
      return file;
    });
  }
}
