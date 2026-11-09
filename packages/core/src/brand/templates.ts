/**
 * Modelos de mensagem (Premium): textos prontos de WhatsApp e e-mail com campos entre chaves.
 * Campo desconhecido é recusado ao salvar, para a cliente nunca receber "{nme}".
 */
export const TEMPLATE_FIELDS = {
  nome: 'Nome da cliente',
  primeiro_nome: 'Primeiro nome da cliente',
  negocio: 'Nome do negócio',
  servico: 'Serviço do próximo horário',
  data: 'Data do próximo horário',
  hora: 'Hora do próximo horário',
} as const;
export type TemplateField = keyof typeof TEMPLATE_FIELDS;

const FIELD = /\{([a-z_]+)\}/g;

export function templateFields(body: string): string[] {
  return [...new Set([...body.matchAll(FIELD)].map((m) => m[1]!))];
}

export function unknownFields(body: string): string[] {
  return templateFields(body).filter((f) => !(f in TEMPLATE_FIELDS));
}

/** Troca os campos pelos valores; campo sem valor vira um traço para a pessoa completar. */
export function fillTemplate(
  body: string,
  values: Partial<Record<TemplateField, string | null | undefined>>,
): string {
  return body.replace(FIELD, (whole, key: string) => {
    if (!(key in TEMPLATE_FIELDS)) return whole;
    const v = values[key as TemplateField];
    return v && v.trim() ? v : '___';
  });
}
