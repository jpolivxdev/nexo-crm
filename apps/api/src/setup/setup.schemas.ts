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
