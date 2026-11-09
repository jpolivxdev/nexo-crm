/**
 * Importar clientes de uma planilha (Premium). Tudo aqui é conferência: nada é salvo antes de
 * a pessoa ver o resultado e confirmar.
 */

/** Lê CSV com ";" ou "," (o que aparecer mais na primeira linha), aspas e quebras do Windows. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Só dígitos, com 55 na frente quando vier só com DDD. Nulo se não parecer telefone. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  const full = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return /^\d{12,15}$/.test(full) ? full : null;
}

const NAME_HEADERS = ['nome', 'name', 'cliente', 'contato', 'nome completo'];
const PHONE_HEADERS = [
  'telefone',
  'phone',
  'celular',
  'whatsapp',
  'fone',
  'tel',
  'número',
  'numero',
];
const TAG_HEADERS = ['etiquetas', 'etiqueta', 'tags', 'tag'];

const plain = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export interface ImportColumns {
  name: number;
  phone: number;
  tags: number | null;
  /** A primeira linha é cabeçalho (e não entra). */
  header: boolean;
}

/** Acha as colunas pelo cabeçalho; sem cabeçalho, nome na primeira e telefone na segunda. */
export function detectColumns(first: readonly string[]): ImportColumns {
  const find = (names: string[]) => first.findIndex((c) => names.map(plain).includes(plain(c)));
  const name = find(NAME_HEADERS);
  const phone = find(PHONE_HEADERS);
  if (name >= 0 && phone >= 0) {
    const tags = find(TAG_HEADERS);
    return { name, phone, tags: tags >= 0 ? tags : null, header: true };
  }
  return { name: 0, phone: 1, tags: null, header: false };
}

export type ImportStatus = 'new' | 'existing' | 'duplicate' | 'invalid';

export interface ImportRow {
  /** Linha na planilha, contando de 1. */
  line: number;
  name: string;
  phone: string | null;
  tags: string[];
  status: ImportStatus;
  /** Por que a linha não entra (só em invalid e duplicate). */
  reason?: string;
}

export const IMPORT_MAX_ROWS = 2000;

/**
 * Confere as linhas: telefone válido, repetido na planilha e já cadastrado no negócio.
 * `existing` são os telefones que o negócio já tem.
 */
export function checkImport(text: string, existing: ReadonlySet<string>): ImportRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const cols = detectColumns(rows[0]!);
  const body = cols.header ? rows.slice(1) : rows;
  const offset = cols.header ? 2 : 1;
  const seen = new Set<string>();
  return body.slice(0, IMPORT_MAX_ROWS).map((r, i) => {
    const line = i + offset;
    const name = (r[cols.name] ?? '').trim().slice(0, 120);
    const phone = normalizePhone(r[cols.phone] ?? '');
    const tags =
      cols.tags === null
        ? []
        : [
            ...new Set(
              (r[cols.tags] ?? '')
                .split(/[,|]/)
                .map((t) => t.trim().slice(0, 40))
                .filter(Boolean),
            ),
          ].slice(0, 20);
    if (!phone)
      return { line, name, phone: null, tags, status: 'invalid', reason: 'Telefone inválido' };
    if (!name) return { line, name, phone, tags, status: 'invalid', reason: 'Sem nome' };
    if (seen.has(phone))
      return {
        line,
        name,
        phone,
        tags,
        status: 'duplicate',
        reason: 'Telefone repetido na planilha',
      };
    seen.add(phone);
    return { line, name, phone, tags, status: existing.has(phone) ? 'existing' : 'new' };
  });
}
