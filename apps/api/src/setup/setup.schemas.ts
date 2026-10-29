import { z } from 'zod';

/** Entradas do assistente de configuração. Limites pensados para o WhatsApp e para o painel. */
export const businessBody = z.object({
  name: z.string().trim().min(2).max(120),
  attendantName: z.string().trim().min(2).max(60),
  slotStepMinutes: z
    .number()
    .int()
    .refine((v) => [15, 20, 30, 45, 60].includes(v), {
      message: 'Intervalo entre horários: 15, 20, 30, 45 ou 60 minutos.',
    }),
  minNoticeMinutes: z
    .number()
    .int()
    .min(0)
    .max(7 * 24 * 60),
});

export const servicesBody = z.object({
  services: z
    .array(
      z.object({
        id: z.uuid().optional(),
        name: z.string().trim().min(2).max(60),
        durationMinutes: z
          .number()
          .int()
          .min(10)
          .max(8 * 60),
        priceCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
      }),
    )
    .min(1, 'Cadastre pelo menos um serviço.')
    .max(30),
});

export const hoursBody = z.object({
  windows: z
    .array(
      z
        .object({
          weekday: z.number().int().min(0).max(6),
          startMinute: z
            .number()
            .int()
            .min(0)
            .max(24 * 60),
          endMinute: z
            .number()
            .int()
            .min(0)
            .max(24 * 60),
        })
        .refine((w) => w.endMinute > w.startMinute, 'O fim precisa ser depois do início.'),
    )
    .max(7 * 6),
});

export const faqBody = z.object({
  items: z
    .array(
      z.object({
        question: z.string().trim().min(3).max(60),
        answer: z.string().trim().min(2).max(1000),
      }),
    )
    .max(9),
});

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const clock = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no formato 09:30.')
  .transform((v) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3)));

/** Folga ou bloqueio. Sem horas = dia todo. Sem profissional = o negócio inteiro fecha. */
export const timeOffBody = z
  .object({
    startDate: localDate,
    endDate: localDate,
    startTime: clock.nullable().optional(),
    endTime: clock.nullable().optional(),
    professionalId: z.uuid().nullable().optional(),
    reason: z.string().trim().max(80).nullable().optional(),
  })
  .refine((v) => (v.startTime == null) === (v.endTime == null), {
    message: 'Informe as duas horas, ou marque o dia todo.',
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'O fim precisa ser depois do início.' });

/** Mensagens do robô. Regras de cada uma (tamanho, variáveis, aviso de "parar") no @nexo/core. */
export const messagesBody = z.object({
  messages: z.record(z.string().max(40), z.string().max(2000)),
});

const windowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z
      .number()
      .int()
      .min(0)
      .max(24 * 60),
    endMinute: z
      .number()
      .int()
      .min(0)
      .max(24 * 60),
  })
  .refine((w) => w.endMinute > w.startMinute, 'O fim precisa ser depois do início.');

/** Equipe: nova profissional (os serviços e horários começam iguais aos da dona). */
export const newProfessionalBody = z.object({ name: z.string().trim().min(2).max(60) });

export const professionalBody = z.object({
  name: z.string().trim().min(2).max(60),
  active: z.boolean(),
  serviceIds: z.array(z.uuid()).max(30),
  windows: z.array(windowSchema).max(7 * 6),
});

export const staffLoginBody = z.object({ email: z.email().max(200) });

/** Conta → Avisos: e-mail para a dona e prazo do "oferecer o próximo horário". */
export const alertsBody = z.object({
  notifyEmail: z.boolean(),
  nextVisitDays: z.number().int().min(0).max(180).nullable(),
});
