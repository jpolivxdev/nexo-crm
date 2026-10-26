import { describe, expect, it } from 'vitest';
import { DEFAULT_PIPELINE, pipelineTemplateFor } from './pipeline-templates.js';

describe('pipelineTemplateFor', () => {
  it('usa o funil de agendamento para estúdio de cílios', () => {
    const names = pipelineTemplateFor('cilios').stages.map((s) => s.name);
    expect(names).toEqual([
      'Novo contato',
      'Pediu informação',
      'Agendou',
      'Atendido',
      'Voltou',
      'Não seguiu',
    ]);
  });

  it('ignora maiúsculas e espaços no nicho', () => {
    expect(pipelineTemplateFor('  Cilios ')).toBe(pipelineTemplateFor('cilios'));
  });

  it('cai no funil padrão para nicho sem modelo', () => {
    expect(pipelineTemplateFor('consultoria')).toBe(DEFAULT_PIPELINE);
  });

  it('todo modelo começa em "Novo contato" e tem etapa de ganho e de perda', () => {
    for (const niche of ['cilios', 'consultoria']) {
      const kinds = pipelineTemplateFor(niche).stages.map((s) => s.kind);
      expect(pipelineTemplateFor(niche).stages[0]?.name).toBe('Novo contato');
      expect(kinds).toContain('WON');
      expect(kinds).toContain('LOST');
    }
  });
});
