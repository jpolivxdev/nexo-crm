import { describe, expect, it } from 'vitest';
import { classify } from './classification.js';
import { DEFAULT_PIPELINE, pipelineTemplateFor } from './pipeline-templates.js';

const stagesOf = (niche: string) =>
  pipelineTemplateFor(niche).stages.map((s, position) => ({ id: s.key, key: s.key, position }));

const beauty = stagesOf('cilios');

describe('classify (etapas por regra)', () => {
  it('cliente novo entra em "Novo contato"', () => {
    expect(
      classify({ event: 'contact.created', stages: beauty, currentStageId: null, doneCount: 0 }),
    ).toBe('new');
  });

  it('dúvida leva a "Pediu informação"; marcar leva a "Agendou"', () => {
    expect(
      classify({ event: 'faq.viewed', stages: beauty, currentStageId: 'new', doneCount: 0 }),
    ).toBe('asked_info');
    expect(
      classify({
        event: 'appointment.created',
        stages: beauty,
        currentStageId: 'asked_info',
        doneCount: 0,
      }),
    ).toBe('scheduled');
  });

  it('primeiro atendimento realizado vai para "Atendido"; o segundo, para "Voltou"', () => {
    expect(
      classify({
        event: 'appointment.done',
        stages: beauty,
        currentStageId: 'scheduled',
        doneCount: 1,
      }),
    ).toBe('attended');
    expect(
      classify({
        event: 'appointment.done',
        stages: beauty,
        currentStageId: 'attended',
        doneCount: 2,
      }),
    ).toBe('returned');
  });

  it('só anda para frente: marcar de novo não tira de "Atendido"', () => {
    expect(
      classify({
        event: 'appointment.created',
        stages: beauty,
        currentStageId: 'attended',
        doneCount: 1,
      }),
    ).toBeNull();
  });

  it('não mexe em quem o dono marcou como perdido', () => {
    expect(
      classify({
        event: 'appointment.created',
        stages: beauty,
        currentStageId: 'lost',
        doneCount: 0,
      }),
    ).toBeNull();
  });

  it('falta e cancelamento não mudam a etapa', () => {
    expect(
      classify({
        event: 'appointment.no_show',
        stages: beauty,
        currentStageId: 'scheduled',
        doneCount: 0,
      }),
    ).toBeNull();
    expect(
      classify({
        event: 'appointment.cancelled',
        stages: beauty,
        currentStageId: 'scheduled',
        doneCount: 0,
      }),
    ).toBeNull();
  });

  it('no funil padrão, agendar vira "Qualificado" e realizar vira "Fechado"', () => {
    const def = DEFAULT_PIPELINE.stages.map((s, position) => ({ id: s.key, key: s.key, position }));
    expect(
      classify({ event: 'appointment.created', stages: def, currentStageId: 'new', doneCount: 0 }),
    ).toBe('qualified');
    expect(
      classify({
        event: 'appointment.done',
        stages: def,
        currentStageId: 'qualified',
        doneCount: 1,
      }),
    ).toBe('won');
  });
});
