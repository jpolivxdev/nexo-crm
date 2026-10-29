import { describe, expect, it } from 'vitest';
import { planReminders, reminderMessage, reminderStillUseful } from './reminders.js';

const H = 60 * 60 * 1000;
const startsAt = new Date('2026-11-03T12:00:00Z'); // terça, 09:00 em São Paulo
const ctx = {
  businessName: 'Estúdio Exemplo (demo)',
  ownerName: 'Ana',
  timeZone: 'America/Sao_Paulo',
};

describe('lembretes de horário', () => {
  it('marcado com antecedência: lembra 24 horas e 1 hora antes', () => {
    const plan = planReminders(startsAt, new Date(startsAt.getTime() - 72 * H));
    expect(plan).toEqual([
      { kind: 'BEFORE_24H', sendAt: new Date(startsAt.getTime() - 24 * H) },
      { kind: 'BEFORE_1H', sendAt: new Date(startsAt.getTime() - H) },
    ]);
  });

  it('marcado no mesmo dia: só o de 1 hora; em cima da hora: nenhum', () => {
    expect(
      planReminders(startsAt, new Date(startsAt.getTime() - 5 * H)).map((r) => r.kind),
    ).toEqual(['BEFORE_1H']);
    expect(planReminders(startsAt, new Date(startsAt.getTime() - 30 * 60 * 1000))).toEqual([]);
  });

  it('não manda lembrete atrasado demais nem de horário que já passou', () => {
    const sendAt = new Date(startsAt.getTime() - H);
    expect(reminderStillUseful(sendAt, startsAt, new Date(sendAt.getTime() + 10 * 60 * 1000))).toBe(
      true,
    );
    expect(reminderStillUseful(sendAt, startsAt, new Date(sendAt.getTime() + 40 * 60 * 1000))).toBe(
      false,
    );
    expect(reminderStillUseful(sendAt, startsAt, new Date(startsAt.getTime() + 1))).toBe(false);
  });

  it('24 horas: texto com dia e hora no fuso do negócio e 3 botões curtos', () => {
    const msg = reminderMessage(
      'BEFORE_24H',
      { id: 'a1', serviceName: 'Aplicação de cílios', startsAt },
      ctx,
    );
    expect(msg.type).toBe('buttons');
    if (msg.type !== 'buttons') return;
    expect(msg.body).toBe(
      'Oi! Passando para lembrar do seu horário no Estúdio Exemplo (demo): Aplicação de cílios, amanhã (terça, 03/11) às 09:00. Você confirma?',
    );
    expect(msg.buttons).toEqual([
      { id: 'rem:confirm:a1', title: 'Confirmar' },
      { id: 'rem:reschedule:a1', title: 'Remarcar' },
      { id: 'rem:cancel:a1', title: 'Cancelar' },
    ]);
  });

  it('1 hora: confirmar ou cancelar, e respeita texto editado pela dona', () => {
    const msg = reminderMessage(
      'BEFORE_1H',
      { id: 'a1', serviceName: 'Aplicação de cílios', startsAt },
      { ...ctx, messages: { reminder1h: 'Te espero às {hora}!' } },
    );
    expect(msg.body).toBe('Te espero às 09:00!');
    expect(msg.type === 'buttons' && msg.buttons.map((b) => b.id)).toEqual([
      'rem:confirm:a1',
      'rem:cancel:a1',
    ]);
  });
});
