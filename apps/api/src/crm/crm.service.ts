import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  checkFieldValues,
  DEFAULT_PIPELINE,
  toCsv,
  type CustomFieldDef,
  type CustomFieldType,
} from '@nexo/core';
import type { z } from 'zod';
import { AuditService } from '../auth/audit.service.js';
import type { TenantTx } from '../database/prisma.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import { readStageRules } from './stage-rules.js';
import type {
  campaignBody,
  customFieldBody,
  dealBody,
  newDealBody,
  pipelineBody,
  pipelineUpdateBody,
  stageInput,
  taskBody,
} from './crm.schemas.js';

export interface CrmActor {
  userId: string;
  role: string;
  ip: string | null;
}

/** Chance padrão de cada etapa do modelo (o dono muda em Funis). */
const DEFAULT_PROBABILITY: Record<string, number> = {
  new: 10,
  asked_info: 20,
  qualified: 30,
  scheduled: 60,
  proposal: 50,
  negotiation: 70,
  won: 100,
  attended: 100,
  returned: 100,
  lost: 0,
};

const TEAM_LOGIN_ROLES = ['OWNER', 'MANAGER', 'CONSULTANT', 'STAFF'] as const;

const dateOrNull = (d: string | null | undefined) =>
  d === undefined ? undefined : d === null ? null : new Date(`${d}T00:00:00Z`);

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function asFields(raw: unknown): Record<string, string | number> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, string | number>)
    : {};
}

/**
 * CRM completo (Premium): funis, campanhas, campos próprios, atendimentos com dono e previsão,
 * tarefas da equipe e exportação. Sempre no negócio da sessão (withTenant + RLS).
 */
@Injectable()
export class CrmService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  // ---------- Funis ----------

  pipelines(tenantId: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const list = await tx.pipeline.findMany({
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          isDefault: true,
          stages: {
            orderBy: { position: 'asc' },
            select: { id: true, name: true, kind: true, probability: true, key: true },
          },
          _count: { select: { deals: { where: { closedAt: null } } } },
        },
      });
      return list.map(({ _count, ...p }) => ({ ...p, openDeals: _count.deals }));
    });
  }

  async createPipeline(tenantId: string, input: z.infer<typeof pipelineBody>, actor: CrmActor) {
    const pipeline = await this.db.withTenant(tenantId, (tx) =>
      this.insertPipeline(tx, tenantId, input.name, input.stages),
    );
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'crm.pipeline_created',
      ip: actor.ip,
      metadata: { pipelineId: pipeline.id },
    });
    return pipeline;
  }

  private async insertPipeline(
    tx: TenantTx,
    tenantId: string,
    name: string,
    stages?: z.infer<typeof stageInput>[],
  ) {
    const list =
      stages ??
      DEFAULT_PIPELINE.stages.map((s) => ({
        name: s.name,
        kind: s.kind,
        probability: DEFAULT_PROBABILITY[s.key] ?? null,
        key: s.key,
      }));
    checkStages(list);
    const pipeline = await tx.pipeline.create({ data: { tenantId, name, isDefault: false } });
    await tx.stage.createMany({
      data: list.map((s, position) => ({
        tenantId,
        pipelineId: pipeline.id,
        name: s.name,
        kind: s.kind,
        probability: s.probability ?? null,
        key: 'key' in s ? (s.key as string) : null,
        position,
      })),
    });
    return { id: pipeline.id, name: pipeline.name };
  }

  /**
   * Troca nome e etapas do funil. Etapa que saiu da lista só é apagada se nunca teve
   * atendimento; a chave das etapas que ficam não muda (as regras continuam valendo).
   */
  async updatePipeline(
    tenantId: string,
    id: string,
    input: z.infer<typeof pipelineUpdateBody>,
    actor: CrmActor,
  ) {
    checkStages(input.stages);
    await this.db.withTenant(tenantId, async (tx) => {
      const pipeline = await tx.pipeline.findUnique({
        where: { id },
        select: { id: true, rules: true, stages: { select: { id: true, name: true } } },
      });
      if (!pipeline) throw new NotFoundException('Funil não encontrado.');
      const keep = new Set(input.stages.map((s) => s.id).filter(Boolean));
      for (const s of input.stages) {
        if (s.id && !pipeline.stages.some((p) => p.id === s.id))
          throw new BadRequestException('Essa etapa não é deste funil.');
      }
      const removed = pipeline.stages.filter((s) => !keep.has(s.id));
      for (const stage of removed) {
        const used = await tx.deal.count({ where: { stageId: stage.id } });
        if (used > 0)
          throw new ConflictException(
            `Mova os atendimentos de "${stage.name}" para outra etapa antes de tirar a etapa.`,
          );
      }
      // Posições temporárias negativas, para não bater na regra de posição única.
      for (const [i, stage] of pipeline.stages.entries()) {
        await tx.stage.update({ where: { id: stage.id }, data: { position: -1 - i } });
      }
      if (removed.length > 0) {
        await tx.stage.deleteMany({ where: { id: { in: removed.map((s) => s.id) } } });
        const gone = new Set(removed.map((s) => s.id));
        const rules = readStageRules(pipeline.rules).filter(
          (r) => !r.stageId || !gone.has(r.stageId),
        );
        await tx.pipeline.update({
          where: { id },
          data: { rules: rules as unknown as Prisma.InputJsonArray },
        });
      }
      for (const [position, s] of input.stages.entries()) {
        const data = {
          name: s.name,
          kind: s.kind,
          probability: s.probability ?? null,
          position,
        };
        if (s.id) await tx.stage.update({ where: { id: s.id }, data });
        else await tx.stage.create({ data: { ...data, tenantId, pipelineId: id } });
      }
      await tx.pipeline.update({ where: { id }, data: { name: input.name } });
    });
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'crm.pipeline_updated',
      ip: actor.ip,
      metadata: { pipelineId: id },
    });
    this.bus.publish(tenantId, { type: 'contact.updated' });
    return { ok: true };
  }

  /** Só funil extra e vazio (nunca teve atendimento). O padrão não sai. */
  async deletePipeline(tenantId: string, id: string, actor: CrmActor) {
    await this.db.withTenant(tenantId, async (tx) => {
      const pipeline = await tx.pipeline.findUnique({
        where: { id },
        select: { isDefault: true, _count: { select: { deals: true } } },
      });
      if (!pipeline) throw new NotFoundException('Funil não encontrado.');
      if (pipeline.isDefault) throw new ConflictException('O funil principal não pode sair.');
      if (pipeline._count.deals > 0)
        throw new ConflictException('Esse funil já tem atendimentos. Ele fica guardado.');
      await tx.campaign.updateMany({ where: { pipelineId: id }, data: { pipelineId: null } });
      await tx.stage.deleteMany({ where: { pipelineId: id } });
      await tx.pipeline.delete({ where: { id } });
    });
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'crm.pipeline_deleted',
      ip: actor.ip,
      metadata: { pipelineId: id },
    });
    return { ok: true };
  }

  // ---------- Atendimentos ----------

  /**
   * Novo atendimento pelo CRM. A cliente é achada pelo telefone ou cadastrada agora. Uma cliente
   * tem no máximo um atendimento em aberto por funil.
   */
  async createDeal(tenantId: string, input: z.infer<typeof newDealBody>, actor: CrmActor) {
    const deal = await this.db.withTenant(tenantId, async (tx) => {
      const stage = await tx.stage.findFirst({
        where: input.stageId
          ? { id: input.stageId, pipelineId: input.pipelineId }
          : { pipelineId: input.pipelineId },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      if (!stage) throw new NotFoundException('Funil ou etapa não encontrados.');
      const { ownerUserId, ...extra } = await this.dealData(tx, tenantId, input, {});

      let contact = await tx.contact.findUnique({
        where: { tenantId_phone: { tenantId, phone: input.phone } },
        select: { id: true, erasedAt: true },
      });
      if (contact?.erasedAt)
        throw new ConflictException('Os dados desse telefone foram excluídos a pedido da cliente.');
      if (!contact) {
        contact = await tx.contact.create({
          data: { tenantId, name: input.name, phone: input.phone, source: 'PANEL' },
          select: { id: true, erasedAt: true },
        });
        await event(tx, tenantId, 'contact.created', 'contact', contact.id, actor, {
          contactId: contact.id,
          channel: 'panel',
        });
      }
      const open = await tx.deal.findFirst({
        where: { contactId: contact.id, pipelineId: input.pipelineId, closedAt: null },
        select: { id: true },
      });
      if (open) throw new ConflictException('Essa cliente já tem um atendimento neste funil.');

      const created = await tx.deal.create({
        data: {
          tenantId,
          contactId: contact.id,
          pipelineId: input.pipelineId,
          stageId: stage.id,
          // Sem responsável escolhido, fica com quem cadastrou.
          ownerUserId:
            ownerUserId !== undefined
              ? ownerUserId
              : actor.role === 'NEXO_ADMIN'
                ? null
                : actor.userId,
          ...extra,
        },
        select: { id: true, contactId: true },
      });
      await event(tx, tenantId, 'deal.created', 'deal', created.id, actor, {
        contactId: contact.id,
        pipelineId: input.pipelineId,
      });
      return created;
    });
    this.bus.publish(tenantId, { type: 'contact.updated', id: deal.contactId });
    return deal;
  }

  async updateDeal(tenantId: string, id: string, input: z.infer<typeof dealBody>, actor: CrmActor) {
    const deal = await this.db.withTenant(tenantId, async (tx) => {
      const found = await tx.deal.findUnique({
        where: { id },
        select: { id: true, contactId: true, fields: true, ownerUserId: true },
      });
      if (!found) throw new NotFoundException('Atendimento não encontrado.');
      const data = await this.dealData(tx, tenantId, input, asFields(found.fields));
      await tx.deal.update({ where: { id }, data });
      if (data.ownerUserId !== undefined && data.ownerUserId !== found.ownerUserId) {
        await event(tx, tenantId, 'deal.owner_changed', 'deal', id, actor, {
          contactId: found.contactId,
          from: found.ownerUserId,
          to: data.ownerUserId,
        });
      }
      return found;
    });
    this.bus.publish(tenantId, { type: 'contact.updated', id: deal.contactId });
    return { ok: true };
  }

  /** Confere dono, campanha e campos do atendimento e monta o que vai para o banco. */
  private async dealData(
    tx: TenantTx,
    tenantId: string,
    input: z.infer<typeof dealBody>,
    current: Record<string, string | number>,
  ) {
    if (input.ownerUserId) await this.assertTeamUser(tx, tenantId, input.ownerUserId);
    if (input.campaignId) {
      const c = await tx.campaign.findUnique({
        where: { id: input.campaignId },
        select: { id: true },
      });
      if (!c) throw new NotFoundException('Campanha não encontrada.');
    }
    let fields: Prisma.InputJsonObject | undefined;
    if (input.fields) {
      const defs = await this.fieldDefs(tx);
      const checked = checkFieldValues(defs, input.fields);
      if (!checked.ok) throw new BadRequestException(checked.message);
      const merged: Record<string, string | number> = { ...current };
      for (const [k, v] of Object.entries(checked.values)) {
        if (v === null) delete merged[k];
        else merged[k] = v;
      }
      fields = merged;
    }
    return {
      title: input.title === undefined ? undefined : input.title || null,
      valueCents: input.valueCents,
      ownerUserId: input.ownerUserId,
      campaignId: input.campaignId,
      expectedCloseOn: dateOrNull(input.expectedCloseOn),
      fields,
    };
  }

  private async assertTeamUser(tx: TenantTx, tenantId: string, userId: string) {
    const user = await tx.user.findFirst({
      where: { id: userId, tenantId, role: { in: [...TEAM_LOGIN_ROLES] } },
      select: { id: true },
    });
    if (!user) throw new BadRequestException('Essa pessoa não tem acesso ao painel.');
  }

  private async fieldDefs(tx: TenantTx): Promise<CustomFieldDef[]> {
    const rows = await tx.customField.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, label: true, type: true, options: true },
    });
    return rows.map((r) => ({ ...r, type: r.type as CustomFieldType }));
  }

  /** Pessoas com acesso ao painel, para escolher o responsável. */
  people(tenantId: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.user.findMany({
        where: { tenantId, role: { in: [...TEAM_LOGIN_ROLES] } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, role: true },
      }),
    );
  }

  // ---------- Campanhas ----------

  campaigns(tenantId: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const list = await tx.campaign.findMany({
        orderBy: [{ archivedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
        select: {
          id: true,
          name: true,
          channel: true,
          startsOn: true,
          endsOn: true,
          budgetCents: true,
          archivedAt: true,
          pipeline: { select: { id: true, name: true } },
          deals: {
            select: { valueCents: true, closedAt: true, stage: { select: { kind: true } } },
          },
        },
      });
      return list.map(({ deals, startsOn, endsOn, ...c }) => ({
        ...c,
        startsOn: isoDay(startsOn),
        endsOn: isoDay(endsOn),
        deals: deals.length,
        won: deals.filter((d) => d.stage.kind === 'WON').length,
        wonCents: deals
          .filter((d) => d.stage.kind === 'WON')
          .reduce((sum, d) => sum + (d.valueCents ?? 0), 0),
      }));
    });
  }

  async saveCampaign(
    tenantId: string,
    id: string | null,
    input: z.infer<typeof campaignBody>,
    actor: CrmActor,
  ) {
    const campaign = await this.db.withTenant(tenantId, async (tx) => {
      let pipelineId = input.pipelineId ?? null;
      if (input.newPipelineName) {
        pipelineId = (await this.insertPipeline(tx, tenantId, input.newPipelineName)).id;
      } else if (pipelineId) {
        const p = await tx.pipeline.findUnique({ where: { id: pipelineId }, select: { id: true } });
        if (!p) throw new NotFoundException('Funil não encontrado.');
      }
      const data = {
        name: input.name,
        channel: input.channel || null,
        pipelineId,
        startsOn: dateOrNull(input.startsOn) ?? null,
        endsOn: dateOrNull(input.endsOn) ?? null,
        budgetCents: input.budgetCents ?? null,
      };
      if (!id) return tx.campaign.create({ data: { ...data, tenantId }, select: { id: true } });
      const found = await tx.campaign.findUnique({ where: { id }, select: { id: true } });
      if (!found) throw new NotFoundException('Campanha não encontrada.');
      return tx.campaign.update({ where: { id }, data, select: { id: true } });
    });
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: id ? 'crm.campaign_updated' : 'crm.campaign_created',
      ip: actor.ip,
      metadata: { campaignId: campaign.id },
    });
    return campaign;
  }

  async archiveCampaign(tenantId: string, id: string, archived: boolean) {
    await this.db.withTenant(tenantId, async (tx) => {
      const found = await tx.campaign.findUnique({ where: { id }, select: { id: true } });
      if (!found) throw new NotFoundException('Campanha não encontrada.');
      await tx.campaign.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
      });
    });
    return { ok: true };
  }

  // ---------- Campos próprios ----------

  fields(tenantId: string) {
    return this.db.withTenant(tenantId, (tx) => this.fieldDefs(tx));
  }

  async saveField(
    tenantId: string,
    id: string | null,
    input: z.infer<typeof customFieldBody>,
    actor: CrmActor,
  ) {
    const field = await this.db.withTenant(tenantId, async (tx) => {
      const data = {
        label: input.label,
        type: input.type,
        options: input.type === 'select' ? [...new Set(input.options ?? [])] : [],
      };
      if (!id) {
        const count = await tx.customField.count();
        if (count >= 20) throw new ConflictException('No máximo 20 campos próprios.');
        return tx.customField.create({
          data: { ...data, tenantId, position: count },
          select: { id: true },
        });
      }
      const found = await tx.customField.findUnique({ where: { id }, select: { type: true } });
      if (!found) throw new NotFoundException('Campo não encontrado.');
      if (found.type !== input.type)
        throw new BadRequestException('O tipo do campo não muda. Crie outro campo.');
      return tx.customField.update({ where: { id }, data, select: { id: true } });
    });
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: id ? 'crm.field_updated' : 'crm.field_created',
      ip: actor.ip,
      metadata: { fieldId: field.id },
    });
    return field;
  }

  /** Tira o campo da tela. O que já foi preenchido fica guardado no atendimento. */
  async deleteField(tenantId: string, id: string, actor: CrmActor) {
    await this.db.withTenant(tenantId, async (tx) => {
      const found = await tx.customField.findUnique({ where: { id }, select: { id: true } });
      if (!found) throw new NotFoundException('Campo não encontrado.');
      await tx.customField.delete({ where: { id } });
    });
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'crm.field_deleted',
      ip: actor.ip,
      metadata: { fieldId: id },
    });
    return { ok: true };
  }

  // ---------- Tarefas ----------

  /**
   * Minhas tarefas: as que estão comigo. A dona também vê as sem responsável (as que o sistema
   * cria sozinho, como "chamar de volta quem faltou").
   */
  tasks(tenantId: string, actor: CrmActor, scope: 'mine' | 'all', done: boolean) {
    return this.db.withTenant(tenantId, async (tx) => {
      const mine =
        actor.role === 'OWNER' || actor.role === 'NEXO_ADMIN'
          ? { OR: [{ assigneeUserId: actor.userId }, { assigneeUserId: null }] }
          : { assigneeUserId: actor.userId };
      const list = await tx.task.findMany({
        where: { doneAt: done ? { not: null } : null, ...(scope === 'mine' ? mine : {}) },
        orderBy: done
          ? [{ doneAt: 'desc' }]
          : [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        take: 200,
        select: {
          id: true,
          title: true,
          kind: true,
          dueAt: true,
          doneAt: true,
          assigneeUserId: true,
          dealId: true,
          contact: { select: { id: true, name: true, phone: true } },
        },
      });
      const people = await tx.user.findMany({
        where: { tenantId, id: { in: list.map((t) => t.assigneeUserId).filter(isString) } },
        select: { id: true, name: true },
      });
      return list.map(({ assigneeUserId, ...t }) => ({
        ...t,
        assignee: people.find((p) => p.id === assigneeUserId) ?? null,
      }));
    });
  }

  async createTask(tenantId: string, input: z.infer<typeof taskBody>, actor: CrmActor) {
    const task = await this.db.withTenant(tenantId, async (tx) => {
      const assignee =
        input.assigneeUserId === undefined
          ? actor.role === 'NEXO_ADMIN'
            ? null
            : actor.userId
          : input.assigneeUserId;
      if (assignee) await this.assertTeamUser(tx, tenantId, assignee);
      let contactId = input.contactId ?? null;
      if (input.dealId) {
        const deal = await tx.deal.findUnique({
          where: { id: input.dealId },
          select: { contactId: true },
        });
        if (!deal) throw new NotFoundException('Atendimento não encontrado.');
        contactId = deal.contactId;
      } else if (contactId) {
        const c = await tx.contact.findFirst({
          where: { id: contactId, erasedAt: null },
          select: { id: true },
        });
        if (!c) throw new NotFoundException('Cliente não encontrada.');
      }
      return tx.task.create({
        data: {
          tenantId,
          title: input.title,
          kind: input.kind,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          contactId,
          dealId: input.dealId ?? null,
          assigneeUserId: assignee,
        },
        select: { id: true, contactId: true },
      });
    });
    this.bus.publish(tenantId, { type: 'contact.updated', id: task.contactId ?? undefined });
    return { id: task.id };
  }

  async reopenTask(tenantId: string, id: string) {
    await this.db.withTenant(tenantId, async (tx) => {
      const found = await tx.task.findUnique({ where: { id }, select: { id: true } });
      if (!found) throw new NotFoundException('Tarefa não encontrada.');
      await tx.task.update({ where: { id }, data: { doneAt: null } });
    });
    return { ok: true };
  }

  // ---------- Exportar ----------

  /** Planilha do funil (dados pessoais: só quem tem a área de privacidade). Fica na auditoria. */
  async exportCsv(tenantId: string, pipelineId: string | undefined, actor: CrmActor) {
    const { csv, count, id } = await this.db.withTenant(tenantId, async (tx) => {
      const pipeline = await tx.pipeline.findFirst({
        where: pipelineId ? { id: pipelineId } : { isDefault: true },
        select: { id: true },
      });
      if (!pipeline) throw new NotFoundException('Funil não encontrado.');
      const defs = await this.fieldDefs(tx);
      const deals = await tx.deal.findMany({
        where: { pipelineId: pipeline.id, closedAt: null, contact: { erasedAt: null } },
        orderBy: [{ stage: { position: 'asc' } }, { updatedAt: 'desc' }],
        select: {
          title: true,
          valueCents: true,
          ownerUserId: true,
          expectedCloseOn: true,
          fields: true,
          updatedAt: true,
          stage: { select: { name: true } },
          campaign: { select: { name: true } },
          contact: { select: { name: true, phone: true, source: true, tags: true } },
        },
      });
      const people = await tx.user.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      });
      const header = [
        'Cliente',
        'Telefone',
        'Atendimento',
        'Etapa',
        'Valor (R$)',
        'Responsável',
        'Campanha',
        'Previsão de fechamento',
        'Etiquetas',
        'Na etapa desde',
        ...defs.map((d) => d.label),
      ];
      const rows = deals.map((d) => {
        const values = asFields(d.fields);
        return [
          d.contact.name,
          d.contact.phone,
          d.title,
          d.stage.name,
          d.valueCents == null ? null : (d.valueCents / 100).toFixed(2).replace('.', ','),
          people.find((p) => p.id === d.ownerUserId)?.name ?? null,
          d.campaign?.name ?? null,
          isoDay(d.expectedCloseOn),
          d.contact.tags.join(', '),
          d.updatedAt.toISOString().slice(0, 10),
          ...defs.map((f) => values[f.id] ?? null),
        ];
      });
      return { csv: toCsv([header, ...rows]), count: rows.length, id: pipeline.id };
    });
    await this.audit.record({
      tenantId,
      actorUserId: actor.userId,
      action: 'crm.exported',
      ip: actor.ip,
      metadata: { pipelineId: id, rows: count },
    });
    return csv;
  }
}

const isString = (v: string | null): v is string => v !== null;

function checkStages(stages: readonly { kind: string; name: string }[]) {
  if (stages[0]?.kind !== 'OPEN')
    throw new BadRequestException('A primeira etapa precisa ser de andamento.');
  const names = stages.map((s) => s.name.toLowerCase());
  if (new Set(names).size !== names.length)
    throw new BadRequestException('Duas etapas com o mesmo nome. Troque um deles.');
}

async function event(
  tx: TenantTx,
  tenantId: string,
  type: string,
  entityType: string,
  entityId: string,
  actor: CrmActor,
  payload: Prisma.InputJsonObject,
) {
  await tx.event.create({
    data: {
      tenantId,
      type,
      entityType,
      entityId,
      actorType: 'user',
      actorId: actor.userId,
      payload,
    },
  });
}
