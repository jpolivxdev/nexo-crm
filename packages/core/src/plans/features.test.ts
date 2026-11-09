import { describe, expect, it } from 'vitest';
import { featuresOf, hasFeature } from './features.js';

describe('recursos por plano', () => {
  it('Grátis só tem o CRM básico; CRM ganha resultados; Completo tem tudo', () => {
    expect(featuresOf('FREE')).toEqual([]);
    expect(featuresOf('CRM')).toEqual(['report']);
    expect(featuresOf('COMPLETE')).toEqual(['report', 'agenda', 'bot', 'reminders']);
    expect(featuresOf('PREMIUM')).toEqual(['report', 'agenda', 'bot', 'reminders', 'team_roles']);
  });

  it('recurso liberado à parte soma ao plano; nome desconhecido é ignorado', () => {
    expect(featuresOf('CRM', ['agenda', 'qualquer-coisa'])).toEqual(['report', 'agenda']);
    expect(hasFeature('FREE', ['bot'], 'bot')).toBe(true);
    expect(hasFeature('FREE', [], 'agenda')).toBe(false);
  });
});
