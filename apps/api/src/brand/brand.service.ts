import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BRAND_FONTS,
  checkBrandColor,
  checkWikiFile,
  DOMAIN_TXT_PREFIX,
  normalizeDomain,
  unknownFields,
  type BrandFont,
} from '@nexo/core';
import { AuditService } from '../auth/audit.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

export const LOGO_MAX_BYTES = 1024 * 1024;

export interface BrandActor {
  userId: string;
  role: string;
  ip: string | null;
}

/** Consulta de DNS isolada, para os testes não dependerem da internet. */
@Injectable()
export class DnsLookup {
  async txt(name: string): Promise<string[][]> {
    return resolveTxt(name);
  }
}

export interface TemplateInput {
  channel: 'whatsapp' | 'email';
  name: string;
  subject: string | null;
  body: string;
}

/**
 * Marca do negócio, domínio próprio e modelos de mensagem (Premium). Tudo dentro do negócio da
 * sessão (RLS). O domínio só vale depois de provado por um registro DNS com um código que só o
 * negócio vê; a ativação na hospedagem é da nexo.
 */
@Injectable()
export class BrandService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DnsLookup) private readonly dns: DnsLookup,
  ) {}

  /** O que o painel e o login usam para aplicar a marca. */
  async brandOf(tenantId: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const t = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, brandColor: true, brandFont: true },
      });
      const logo = await tx.brandLogo.findUnique({
        where: { tenantId },
        select: { updatedAt: true },
      });
      return {
        name: t?.name ?? '',
        color: t?.brandColor ?? null,
        font: (t?.brandFont as BrandFont | null) ?? null,
        logoVersion: logo ? logo.updatedAt.getTime() : null,
      };
    });
  }

  get(tenantId: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const t = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: {
          name: true,
          brandColor: true,
          brandFont: true,
          customDomain: true,
          domainToken: true,
          domainVerifiedAt: true,
        },
      });
      if (!t) throw new NotFoundException();
      const logo = await tx.brandLogo.findUnique({
        where: { tenantId },
        select: { updatedAt: true },
      });
      return {
        name: t.name,
        color: t.brandColor,
        font: t.brandFont,
        logoVersion: logo ? logo.updatedAt.getTime() : null,
        domain: t.customDomain
          ? {
              name: t.customDomain,
              verified: t.domainVerifiedAt !== null,
              verifiedAt: t.domainVerifiedAt?.toISOString() ?? null,
              txtName: `${DOMAIN_TXT_PREFIX}.${t.customDomain}`,
              txtValue: t.domainToken,
            }
          : null,
      };
    });
  }

  async saveLook(
    tenantId: string,
    input: { color: string | null; font: string | null },
    actor: BrandActor,
  ) {
    let color: string | null = null;
    if (input.color) {
      const checked = checkBrandColor(input.color);
      if (!checked.ok) throw new BadRequestException(checked.error);
      color = checked.color;
    }
    if (input.font && !(BRAND_FONTS as readonly string[]).includes(input.font)) {
      throw new BadRequestException('Fonte desconhecida.');
    }
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({
        where: { id: tenantId },
        data: { brandColor: color, brandFont: input.font === 'nexo' ? null : input.font },
      }),
    );
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'brand.updated',
      ip: actor.ip,
      metadata: { color, font: input.font },
    });
    return this.get(tenantId);
  }

  /** Logo: PNG, JPG ou WEBP até 1 MB (sem SVG), conferida pelo conteúdo. */
  async saveLogo(tenantId: string, name: string, data: Buffer, actor: BrandActor) {
    if (data.length > LOGO_MAX_BYTES) {
      throw new BadRequestException('A logo passa de 1 MB. Diminua e tente de novo.');
    }
    const check = checkWikiFile(name || 'logo', data);
    if (!check.ok) throw new BadRequestException(check.error);
    if (!check.image || check.type === 'image/gif') {
      throw new BadRequestException('Use uma imagem PNG, JPG ou WEBP.');
    }
    await this.db.withTenant(tenantId, (tx) =>
      tx.brandLogo.upsert({
        where: { tenantId },
        create: { tenantId, mime: check.type, data: new Uint8Array(data) },
        update: { mime: check.type, data: new Uint8Array(data) },
      }),
    );
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'brand.logo_updated',
      ip: actor.ip,
      metadata: { size: data.length },
    });
    return this.get(tenantId);
  }

  logo(tenantId: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const logo = await tx.brandLogo.findUnique({ where: { tenantId } });
      if (!logo) throw new NotFoundException('Sem logo.');
      return logo;
    });
  }

  // ---------- Domínio próprio ----------

  async setDomain(tenantId: string, value: string | null, actor: BrandActor) {
    let domain: string | null = null;
    if (value) {
      const checked = normalizeDomain(value);
      if (!checked.ok) throw new BadRequestException(checked.error);
      domain = checked.domain;
    }
    try {
      await this.db.withTenant(tenantId, (tx) =>
        tx.tenant.update({
          where: { id: tenantId },
          data: {
            customDomain: domain,
            domainToken: domain ? `nexo-${randomBytes(16).toString('hex')}` : null,
            domainVerifiedAt: null,
          },
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esse endereço já está cadastrado em outro negócio.');
      }
      throw error;
    }
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: domain ? 'brand.domain_set' : 'brand.domain_removed',
      ip: actor.ip,
      metadata: { domain },
    });
    return this.get(tenantId);
  }

  /** Confere o registro TXT no DNS. Sem o código certo, continua "aguardando". */
  async verifyDomain(tenantId: string, actor: BrandActor) {
    const current = await this.get(tenantId);
    if (!current.domain) throw new BadRequestException('Cadastre o endereço primeiro.');
    if (current.domain.verified) return current;
    const records = await this.dns.txt(current.domain.txtName).catch((): string[][] => []);
    const found = records.some((r) => r.join('') === current.domain!.txtValue);
    if (!found) {
      throw new BadRequestException(
        'Ainda não encontramos o registro. Depois de criar, o DNS pode levar algumas horas para atualizar.',
      );
    }
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { domainVerifiedAt: new Date() } }),
    );
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'brand.domain_verified',
      ip: actor.ip,
      metadata: { domain: current.domain.name },
    });
    return this.get(tenantId);
  }

  /** Negócio dono de um domínio verificado (tela de login no domínio próprio). */
  async tenantForHost(host: string): Promise<string | null> {
    const rows = await this.db.client.$queryRaw<{ id: string | null }[]>`
      SELECT tenant_for_domain(${host.toLowerCase()}) AS id`;
    return rows[0]?.id ?? null;
  }

  // ---------- Modelos de mensagem ----------

  templates(tenantId: string, channel?: 'whatsapp' | 'email') {
    return this.db.withTenant(tenantId, (tx) =>
      tx.messageTemplate.findMany({
        where: { archivedAt: null, ...(channel ? { channel } : {}) },
        orderBy: [{ channel: 'asc' }, { name: 'asc' }],
        select: { id: true, channel: true, name: true, subject: true, body: true, updatedAt: true },
      }),
    );
  }

  private checkTemplate(input: TemplateInput) {
    const unknown = unknownFields(`${input.subject ?? ''} ${input.body}`);
    if (unknown.length > 0) {
      throw new BadRequestException(`Campo desconhecido: {${unknown[0]}}. Use os campos da lista.`);
    }
    if (input.channel === 'email' && !input.subject?.trim()) {
      throw new BadRequestException('E-mail precisa de assunto.');
    }
  }

  createTemplate(tenantId: string, input: TemplateInput) {
    this.checkTemplate(input);
    return this.db.withTenant(tenantId, async (tx) => {
      const t = await tx.messageTemplate.create({
        data: {
          tenantId,
          channel: input.channel,
          name: input.name,
          subject: input.channel === 'email' ? input.subject : null,
          body: input.body,
        },
      });
      return { id: t.id };
    });
  }

  updateTemplate(tenantId: string, id: string, input: TemplateInput) {
    this.checkTemplate(input);
    return this.db.withTenant(tenantId, async (tx) => {
      const found = await tx.messageTemplate.findFirst({ where: { id, archivedAt: null } });
      if (!found) throw new NotFoundException('Modelo não encontrado.');
      await tx.messageTemplate.update({
        where: { id },
        data: {
          channel: input.channel,
          name: input.name,
          subject: input.channel === 'email' ? input.subject : null,
          body: input.body,
        },
      });
      return { id };
    });
  }

  archiveTemplate(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const found = await tx.messageTemplate.findFirst({ where: { id, archivedAt: null } });
      if (!found) throw new NotFoundException('Modelo não encontrado.');
      await tx.messageTemplate.update({ where: { id }, data: { archivedAt: new Date() } });
      return { ok: true };
    });
  }
}
