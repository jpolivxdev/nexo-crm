/** Chamadas à API. Mesma origem (/api), cookie de sessão HttpOnly e token CSRF no cabeçalho. */
import { isDemo } from './demo/mode';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown = null,
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

const FALLBACK = 'Algo deu errado. Tente de novo em instantes.';

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  // Demonstração: responde na memória do navegador, sem servidor (lib/demo).
  if (isDemo()) {
    const { demoRequest } = await import('./demo/server');
    return (await demoRequest(method, path, options.query, options.body)) as T;
  }
  const query = options.query ? `?${new URLSearchParams(options.query)}` : '';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken;

  let res: Response;
  try {
    res = await fetch(`/api${path}${query}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'Sem conexão. Confira a internet e tente de novo.');
  }

  const text = await res.text();
  const data: unknown = text ? safeJson(text) : null;
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : FALLBACK;
    throw new ApiError(res.status, res.status >= 500 ? FALLBACK : message, data);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Envia um arquivo cru (anexos da Wiki). O nome vai codificado no cabeçalho x-file-name. */
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  if (isDemo()) throw new ApiError(400, 'Na demonstração não dá para anexar arquivos.');
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/octet-stream',
    'x-file-name': encodeURIComponent(file.name),
  };
  if (csrfToken) headers['x-csrf-token'] = csrfToken;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body: file,
    });
  } catch {
    throw new ApiError(0, 'Sem conexão. Confira a internet e tente de novo.');
  }
  const text = await res.text();
  const data: unknown = text ? safeJson(text) : null;
  if (!res.ok) {
    const message =
      res.status === 413
        ? 'O arquivo passa de 5 MB. Diminua e tente de novo.'
        : data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
          ? data.message
          : FALLBACK;
    throw new ApiError(res.status, res.status >= 500 ? FALLBACK : message, data);
  }
  return data as T;
}
