import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, withTenant } from '../src/database/prisma.js';
import {
  ContactNotFoundError,
  InvalidAppointmentStateError,
  SlotUnavailableError,
} from '../src/scheduling/scheduling.errors.js';
import { SchedulingService } from '../src/scheduling/scheduling.service.js';
import { createDemoTenant, DEMO_TENANTS, type DemoTenant } from '../src/seed/demo-tenant.js';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://nexo_app:nexo_app@localhost:5432/nexo';

const prisma = createPrismaClient(DATABASE_URL);
const scheduling = new SchedulingService({
  withTenant: (tenantId, fn) => withTenant(prisma, tenantId, fn),
});

// "Agora" fixo, bem antes das datas testadas. Terça, 07/01/2031, fuso de São Paulo (UTC-3).
const NOW = new Date('2031-01-01T12:00:00Z');
const TUESDAY = '2031-01-07';
/** Horário local de São Paulo (UTC-3, sem horário de verão) convertido para UTC. */
const at = (hhmm: string, date = TUESDAY) => new Date(`${date}T${hhmm}:00-03:00`);
const actor = { type: 'contact' as const };

describe('agenda: horários livres e agendamento', () => {
  let t: DemoTenant;

  beforeEach(async () => {
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!, NOW);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const book = (startsAt: Date, contact = 0) =>
    scheduling.book(t.tenantId, {
      contactId: t.contactIds[contact]!,
      serviceId: t.serviceIds[0]!,
      startsAt,
      source: 'WHATSAPP',
      actor,
      now: NOW,
    });

  const slots = (date = TUESDAY) =>
    scheduling.listSlots(t.tenantId, { serviceId: t.serviceIds[0]!, date, now: NOW });

  it('lista os horários livres do dia no expediente da profissional', async () => {
    const free = await slots();
    expect(free).toHaveLength(14);
    expect(free[0]!.startsAt).toEqual(at('09:00'));
    expect(free.at(-1)!.startsAt).toEqual(at('17:00'));
  });

  it('marca um horário livre, registra o evento e tira o horário da lista', async () => {
    const appointment = await book(at('10:00'));
    expect(appointment.endsAt).toEqual(at('11:00'));
    expect(appointment.professionalId).toBe(t.professionalId);

    const starts = (await slots()).map((s) => s.startsAt.getTime());
    expect(starts).not.toContain(at('10:00').getTime());
    expect(starts).not.toContain(at('09:30').getTime());
    expect(starts).not.toContain(at('10:30').getTime());

    const events = await withTenant(prisma, t.tenantId, (tx) =>
      tx.event.findMany({ where: { entityId: appointment.id } }),
    );
    expect(events.map((e) => e.type)).toEqual(['appointment.created']);
  });

  it('recusa horário fora da lista (atravessa o almoço)', async () => {
    await expect(book(at('11:30'))).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it('em dois pedidos simultâneos para o mesmo horário, só um vence', async () => {
    const results = await Promise.allSettled([book(at('14:00'), 1), book(at('14:00'), 2)]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(SlotUnavailableError);
  });

  it('remarca: libera o horário antigo e ocupa o novo', async () => {
    const appointment = await book(at('09:00'));
    await scheduling.setStatus(t.tenantId, appointment.id, 'CONFIRMED', actor);
    const moved = await scheduling.reschedule(t.tenantId, appointment.id, {
      startsAt: at('15:00'),
      actor,
      now: NOW,
    });
    expect(moved.startsAt).toEqual(at('15:00'));
    expect(moved.status).toBe('SCHEDULED');

    const starts = (await slots()).map((s) => s.startsAt.getTime());
    expect(starts).toContain(at('09:00').getTime());
    expect(starts).not.toContain(at('15:00').getTime());
  });

  it('remarca para um horário que cruza o próprio horário atual', async () => {
    const appointment = await book(at('13:00'));
    const moved = await scheduling.reschedule(t.tenantId, appointment.id, {
      startsAt: at('13:30'),
      actor,
      now: NOW,
    });
    expect(moved.startsAt).toEqual(at('13:30'));
  });

  it('cancela e libera o horário; cancelar de novo é recusado', async () => {
    const appointment = await book(at('16:00'));
    await scheduling.setStatus(t.tenantId, appointment.id, 'CANCELLED', actor);
    expect((await slots()).map((s) => s.startsAt.getTime())).toContain(at('16:00').getTime());
    await expect(
      scheduling.setStatus(t.tenantId, appointment.id, 'CANCELLED', actor),
    ).rejects.toBeInstanceOf(InvalidAppointmentStateError);
  });

  it('realizado e faltou podem ser corrigidos entre si, mas não cancelados', async () => {
    const appointment = await book(at('10:00'));
    const owner = { type: 'user' as const };
    await scheduling.setStatus(t.tenantId, appointment.id, 'DONE', owner);
    await scheduling.setStatus(t.tenantId, appointment.id, 'NO_SHOW', owner);
    await expect(
      scheduling.setStatus(t.tenantId, appointment.id, 'CANCELLED', owner),
    ).rejects.toBeInstanceOf(InvalidAppointmentStateError);
  });

  it('folga do negócio inteiro fecha o dia', async () => {
    await withTenant(prisma, t.tenantId, (tx) =>
      tx.timeOff.create({
        data: {
          tenantId: t.tenantId,
          startsAt: at('00:00'),
          endsAt: at('23:59'),
          reason: 'Feriado (demo)',
        },
      }),
    );
    expect(await slots()).toEqual([]);
  });

  it('com duas profissionais, oferece o horário enquanto uma delas estiver livre', async () => {
    const second = await withTenant(prisma, t.tenantId, async (tx) => {
      const p = await tx.professional.create({
        data: { tenantId: t.tenantId, name: 'Segunda Profissional (demo)' },
      });
      await tx.professionalService.create({
        data: { tenantId: t.tenantId, professionalId: p.id, serviceId: t.serviceIds[0]! },
      });
      await tx.availability.create({
        data: {
          tenantId: t.tenantId,
          professionalId: p.id,
          weekday: 2,
          startMinute: 540,
          endMinute: 720,
        },
      });
      return p;
    });

    const first = await book(at('09:00'), 0);
    expect(first.professionalId).toBe(t.professionalId);

    const free = await slots();
    const nine = free.find((s) => s.startsAt.getTime() === at('09:00').getTime());
    expect(nine?.professionalIds).toEqual([second.id]);

    const other = await book(at('09:00'), 1);
    expect(other.professionalId).toBe(second.id);
    await expect(book(at('09:00'), 2)).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it('não marca horário para cliente de outro negócio', async () => {
    const other = await createDemoTenant(prisma, DEMO_TENANTS[1]!, NOW);
    await expect(
      scheduling.book(t.tenantId, {
        contactId: other.contactIds[0]!,
        serviceId: t.serviceIds[0]!,
        startsAt: at('10:00'),
        source: 'PANEL',
        actor,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ContactNotFoundError);
  });
});

describe('agenda: etapas automáticas e aviso em tempo real', () => {
  let t: DemoTenant;
  const notices: { tenantId: string; type: string }[] = [];
  const live = new SchedulingService(
    { withTenant: (tenantId, fn) => withTenant(prisma, tenantId, fn) },
    { publish: (tenantId, notice) => notices.push({ tenantId, type: notice.type }) },
  );

  beforeEach(async () => {
    notices.length = 0;
    t = await createDemoTenant(prisma, DEMO_TENANTS[0]!, NOW);
  });

  const stageOf = async (contactId: string) =>
    withTenant(prisma, t.tenantId, async (tx) => {
      const deal = await tx.deal.findFirstOrThrow({
        where: { contactId, closedAt: null },
        include: { stage: true },
      });
      return deal.stage.key;
    });

  const book = (startsAt: Date, contact: number) =>
    live.book(t.tenantId, {
      contactId: t.contactIds[contact]!,
      serviceId: t.serviceIds[0]!,
      startsAt,
      source: 'WHATSAPP',
      actor,
      now: NOW,
    });

  it('cliente sem atendimento ganha um ao marcar e vai para "Agendou"', async () => {
    const contactId = t.contactIds[2]!;
    await book(at('10:00'), 2);
    expect(await stageOf(contactId)).toBe('scheduled');
  });

  it('realizado leva para "Atendido", e o segundo realizado para "Voltou"', async () => {
    const contactId = t.contactIds[2]!;
    const first = await book(at('10:00'), 2);
    await live.setStatus(t.tenantId, first.id, 'DONE', { type: 'user' });
    expect(await stageOf(contactId)).toBe('attended');

    const second = await book(at('15:00'), 2);
    expect(await stageOf(contactId)).toBe('attended');
    await live.setStatus(t.tenantId, second.id, 'DONE', { type: 'user' });
    expect(await stageOf(contactId)).toBe('returned');

    const changes = await withTenant(prisma, t.tenantId, (tx) =>
      tx.event.count({ where: { type: 'deal.stage_changed' } }),
    );
    expect(changes).toBeGreaterThanOrEqual(3);
  });

  it('avisa o painel só quando a mudança foi gravada', async () => {
    await book(at('10:00'), 1);
    await expect(book(at('10:00'), 2)).rejects.toBeInstanceOf(SlotUnavailableError);
    expect(notices).toEqual([{ tenantId: t.tenantId, type: 'agenda.changed' }]);
  });

  it('respeita o intervalo entre horários configurado no negócio', async () => {
    await withTenant(prisma, t.tenantId, (tx) =>
      tx.tenant.update({ where: { id: t.tenantId }, data: { slotStepMinutes: 60 } }),
    );
    const free = await live.listSlots(t.tenantId, {
      serviceId: t.serviceIds[0]!,
      date: TUESDAY,
      now: NOW,
    });
    expect(free.map((s) => s.startsAt)).toEqual(
      ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'].map((h) => at(h)),
    );
  });
});
