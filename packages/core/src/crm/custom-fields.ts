/** Campos próprios do negócio nos atendimentos (Premium). */
export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'select'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export interface CustomFieldDef {
  id: string;
  label: string;
  type: CustomFieldType;
  options: readonly string[];
}

export type FieldValue = string | number;

export const FIELD_TEXT_MAX = 200;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Confere os valores enviados contra os campos do negócio. Campo que não existe é recusado;
 * valor vazio (null ou "") apaga o campo. Devolve os valores limpos ou a primeira mensagem de erro.
 */
export function checkFieldValues(
  defs: readonly CustomFieldDef[],
  values: Record<string, unknown>,
): { ok: true; values: Record<string, FieldValue | null> } | { ok: false; message: string } {
  const out: Record<string, FieldValue | null> = {};
  for (const [id, raw] of Object.entries(values)) {
    const def = defs.find((d) => d.id === id);
    if (!def) return { ok: false, message: 'Esse campo não existe mais.' };
    if (raw === null || raw === '') {
      out[id] = null;
      continue;
    }
    switch (def.type) {
      case 'text': {
        if (typeof raw !== 'string') return { ok: false, message: `${def.label}: use texto.` };
        const text = raw.trim();
        if (text.length > FIELD_TEXT_MAX)
          return { ok: false, message: `${def.label}: no máximo ${FIELD_TEXT_MAX} letras.` };
        out[id] = text || null;
        break;
      }
      case 'number': {
        const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
        if (!Number.isFinite(n)) return { ok: false, message: `${def.label}: use um número.` };
        out[id] = n;
        break;
      }
      case 'date': {
        if (typeof raw !== 'string' || !DATE.test(raw) || Number.isNaN(Date.parse(raw)))
          return { ok: false, message: `${def.label}: use uma data válida.` };
        out[id] = raw;
        break;
      }
      case 'select': {
        if (typeof raw !== 'string' || !def.options.includes(raw))
          return { ok: false, message: `${def.label}: escolha uma das opções.` };
        out[id] = raw;
        break;
      }
    }
  }
  return { ok: true, values: out };
}
