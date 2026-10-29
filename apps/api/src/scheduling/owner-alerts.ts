import { Logger } from '@nestjs/common';
import { localWhen } from '@nexo/core';
import type { OwnerNotifier } from '../conversation/owner-notifier.js';
import type { TenantTx } from '../database/prisma.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { Mailer } from '../mail/mailer.js';
import type { OwnerAlert } from '../realtime/realtime.bus.js';

const FOOTER = ['', 'Para parar estes e-mails: Conta → Avisos, no painel.', '— feito pela nexo'];

const SUBJECT: Record<OwnerAlert, string> = {
  booked: 'Horário novo',
  rescheduled: 'Horário remarcado',
  cancelled: 'Horário cancelado',
};

const VERB: Record<OwnerAlert, string> = {
  booked: 'marcou',
  rescheduled: 'remarcou',
  cancelled: 'cancelou',
};

/** Texto do e-mail. Sem nome nem telefone da cliente: o e-mail sai do sistema; o resto fica no painel. */
export function alertEmail(
  alert: OwnerAlert,
  input: { businessName: string; serviceName: string; startsAt: Date; timeZone: string },
): { subject: string; text: string } {
  const { data, hora } = localWhen(input.startsAt, input.timeZone);
  return {
    subject: `${SUBJECT[alert]}: ${data} às ${hora}`,
    text: [
      `Uma cliente ${VERB[alert]} pelo WhatsApp: ${input.serviceName}, ${data} às ${hora}.`,
      '',
      `Veja quem é e a agenda do dia no painel do ${input.businessName}.`,
      ...FOOTER,
    ].join('\n'),
  };
}

/**
 * Aviso por e-mail para a dona quando a cliente mexe na agenda pelo WhatsApp ou pede para
 * falar com ela. Desligado por padrão; ela liga em Conta → Avisos. Melhor esforço: falha de
 * envio só vai para o log e nunca desfaz o horário nem trava o robô.
 */
export class OwnerAlerts implements OwnerNotifier {
  private readonly logger = new Logger(OwnerAlerts.name);

  constructor(
    private readonly db: Pick<PrismaService, 'withTenant' | 'client'>,
    private readonly mailer: Mailer,
  ) {}

  appointmentChanged(tenantId: string, appointmentId: string, alert: OwnerAlert): Promise<void> {
    return this.send(tenantId, async (tx, tenant) => {
      const appointment = await tx.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: { startsAt: true, service: { select: { name: true } } },
      });
      return alertEmail(alert, {
        businessName: tenant.name,
        serviceName: appointment.service.name,
        startsAt: appointment.startsAt,
        timeZone: tenant.timezone,
      });
    });
  }

  handoffRequested(tenantId: string): Promise<void> {
    return this.send(tenantId, (_tx, tenant) =>
      Promise.resolve({
        subject: 'Uma cliente quer falar com você',
        text: [
          'Uma cliente pediu para falar com você pelo WhatsApp. O robô ficou em pausa nessa conversa.',
          '',
          `Responda pelo painel do ${tenant.name} (Hoje → Clientes esperando resposta).`,
          ...FOOTER,
        ].join('\n'),
      }),
    );
  }

  private async send(
    tenantId: string,
    build: (
      tx: TenantTx,
      tenant: { name: string; timezone: string },
    ) => Promise<{ subject: string; text: string }>,
  ): Promise<void> {
    if (!this.mailer.enabled) return;
    try {
      const message = await this.db.withTenant(tenantId, async (tx) => {
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { name: true, timezone: true, notifyEmail: true },
        });
        return tenant.notifyEmail ? build(tx, tenant) : null;
      });
      if (!message) return;
      // Logins ficam fora do RLS: busca presa ao negócio.
      const owners = await this.db.client.user.findMany({
        where: { tenantId, role: 'OWNER', emailVerifiedAt: { not: null } },
        select: { email: true },
      });
      for (const { email } of owners) await this.mailer.send({ to: email, ...message });
    } catch (error) {
      this.logger.error(`Aviso por e-mail não enviado: ${(error as Error).name}`);
    }
  }
}
