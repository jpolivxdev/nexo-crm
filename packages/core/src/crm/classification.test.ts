import { describe, expect, it } from 'vitest';
import { classify, defaultStageFor } from './classification.js';
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

describe('regras da dona ("se X, colocar em Y")', () => {
  const base = { stages: beauty, doneCount: 0 };

  it('vale antes da padrão e pode mover para trás ou para "Não seguiu"', () => {
    const rules = [{ event: 'appointment.no_show' as const, stageId: 'lost' }];
    expect(
      classify({ ...base, event: 'appointment.no_show', currentStageId: 'scheduled', rules }),
    ).toBe('lost');
    const back = [{ event: 'appointment.cancelled' as const, stageId: 'asked_info' }];
    expect(
      classify({
        ...base,
        event: 'appointment.cancelled',
        currentStageId: 'scheduled',
        rules: back,
      }),
    ).toBe('asked_info');
  });

  it('"não mexer na etapa" desliga a regra padrão', () => {
    const rules = [{ event: 'faq.viewed' as const, stageId: null }];
    expect(classify({ ...base, event: 'faq.viewed', currentStageId: 'new', rules })).toBeNull();
  });

  it('"voltou" usa a regra própria; sem ela, a de "foi atendida"', () => {
    const done = [{ event: 'appointment.done' as const, stageId: 'attended' }];
    expect(
      classify({
        ...base,
        event: 'appointment.done',
        doneCount: 3,
        currentStageId: 'new',
        rules: done,
      }),
    ).toBe('attended');
    const returned = [...done, { event: 'appointment.returned' as const, stageId: 'returned' }];
    expect(
      classify({
        ...base,
        event: 'appointment.done',
        doneCount: 3,
        currentStageId: 'attended',
        rules: returned,
      }),
    ).toBe('returned');
  });

  it('regra para etapa que não existe mais segue a padrão; mesma etapa não move', () => {
    const rules = [{ event: 'appointment.created' as const, stageId: 'sumiu' }];
    expect(classify({ ...base, event: 'appointment.created', currentStageId: 'new', rules })).toBe(
      'scheduled',
    );
    const same = [{ event: 'appointment.created' as const, stageId: 'scheduled' }];
    expect(
      classify({ ...base, event: 'appointment.created', currentStageId: 'scheduled', rules: same }),
    ).toBeNull();
  });

  it('mostra a etapa padrão de cada acontecimento', () => {
    expect(defaultStageFor('appointment.created', beauty)).toBe('scheduled');
    expect(defaultStageFor('appointment.returned', beauty)).toBe('returned');
    expect(defaultStageFor('appointment.no_show', beauty)).toBeNull();
    expect(defaultStageFor('appointment.returned', stagesOf('outro'))).toBe('won');
  });
});
