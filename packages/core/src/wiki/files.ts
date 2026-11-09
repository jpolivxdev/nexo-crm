/**
 * Anexos da Wiki: só tipos comuns de documento e imagem, conferidos pelo conteúdo (não só pelo
 * nome). SVG e HTML ficam fora porque podem levar script.
 */
export const WIKI_FILE_MAX_BYTES = 5 * 1024 * 1024;
/** Limite provisório de anexos por negócio, até o Coca definir os limites dos planos. */
export const WIKI_TENANT_MAX_BYTES = 100 * 1024 * 1024;

export const WIKI_FILE_TYPES = {
  'image/png': { ext: ['png'], image: true },
  'image/jpeg': { ext: ['jpg', 'jpeg'], image: true },
  'image/webp': { ext: ['webp'], image: true },
  'image/gif': { ext: ['gif'], image: true },
  'application/pdf': { ext: ['pdf'], image: false },
  'text/plain': { ext: ['txt'], image: false },
  'text/csv': { ext: ['csv'], image: false },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: ['docx'],
    image: false,
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    ext: ['xlsx'],
    image: false,
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    ext: ['pptx'],
    image: false,
  },
} as const;

export type WikiFileType = keyof typeof WIKI_FILE_TYPES;

const starts = (bytes: Uint8Array, sig: number[], offset = 0) =>
  sig.every((b, i) => bytes[offset + i] === b);

function sniff(bytes: Uint8Array): WikiFileType | 'zip' | 'text' | null {
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (starts(bytes, [0x52, 0x49, 0x46, 0x46]) && starts(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  if (starts(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (starts(bytes, [0x50, 0x4b, 0x03, 0x04])) return 'zip';
  if (bytes.includes(0)) return null;
  return validUtf8(bytes) ? 'text' : null;
}

/** UTF-8 bem formado (sem depender de TextDecoder, que o pacote não tipa). */
function validUtf8(bytes: Uint8Array): boolean {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    const extra = b < 0x80 ? 0 : b >> 5 === 0x6 ? 1 : b >> 4 === 0xe ? 2 : b >> 3 === 0x1e ? 3 : -1;
    if (extra < 0 || (extra > 0 && b < 0xc2 && extra === 1)) return false;
    for (let k = 1; k <= extra; k++) {
      if (((bytes[i + k] ?? 0) & 0xc0) !== 0x80) return false;
    }
    i += extra + 1;
  }
  return true;
}

export type FileCheck =
  { ok: true; type: WikiFileType; name: string; image: boolean } | { ok: false; error: string };

/** Tipo do arquivo pela extensão do nome, conferido pelos primeiros bytes. */
export function checkWikiFile(name: string, bytes: Uint8Array): FileCheck {
  const clean = name
    .replace(/[\\/]/g, '_')
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, 120);
  if (!clean) return { ok: false, error: 'O arquivo precisa de um nome.' };
  if (bytes.length === 0) return { ok: false, error: 'O arquivo está vazio.' };
  if (bytes.length > WIKI_FILE_MAX_BYTES) {
    return { ok: false, error: 'O arquivo passa de 5 MB. Diminua e tente de novo.' };
  }
  const ext = clean.split('.').pop()?.toLowerCase() ?? '';
  const entry = (
    Object.entries(WIKI_FILE_TYPES) as [WikiFileType, { ext: readonly string[] }][]
  ).find(([, v]) => v.ext.includes(ext));
  if (!entry) {
    return {
      ok: false,
      error: 'Tipo de arquivo não aceito. Use imagem (PNG, JPG, WEBP, GIF), PDF, texto ou Office.',
    };
  }
  const [type] = entry;
  const found = sniff(bytes);
  const office = type.startsWith('application/vnd.openxmlformats');
  const text = type === 'text/plain' || type === 'text/csv';
  const matches = office ? found === 'zip' : text ? found === 'text' : found === type;
  if (!matches) return { ok: false, error: 'O conteúdo do arquivo não bate com o tipo do nome.' };
  return { ok: true, type, name: clean, image: WIKI_FILE_TYPES[type].image };
}
