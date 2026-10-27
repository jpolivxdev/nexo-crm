import { planReminders } from '@nexo/core';
import type { TenantTx } from '../database/prisma.js';
import type { Appointment } from '../generated/prisma/client.js';

/**
 * Agenda (ou reagenda) os lembretes de um horário, na mesma transação que marcou ou remarcou.
 * Lembrete que já não cabe (horário marcado em cima da hora) fica cancelado.
 */
export async function syncReminders(
  tx: TenantTx,
  tenantId: string,
  appointment: Pick<Appointment, 'id' | 'startsAt'>,
  now: Date,
): Promise<void> {
  const plan = planReminders(appointment.startsAt, now);
  for (const kind of ['BEFORE_24H', 'BEFORE_1H'] as const) {
    const planned = plan.find((p) => p.kind === kind);
    const where = { appointmentId_kind: { appointmentId: appointment.id, kind } };
    if (planned) {
      await tx.reminder.upsert({
        where,
        create: { tenantId, appointmentId: appointment.id, kind, sendAt: planned.sendAt },
        update: { sendAt: planned.sendAt, status: 'PENDING', sentAt: null },
      });
    } else {
      await tx.reminder.updateMany({
        where: { appointmentId: appointment.id, kind, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    }
  }
}

/** Horário cancelado, realizado ou com falta: lembretes pendentes não saem mais. */
export async function cancelReminders(tx: TenantTx, appointmentId: string): Promise<void> {
  await tx.reminder.updateMany({
    where: { appointmentId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
}
