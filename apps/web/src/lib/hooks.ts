import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError } from './api';

/**
 * Carrega dados, guarda erro e permite recarregar (ex.: quando chega aviso em tempo real).
 * `key` muda quando o que se carrega muda (ex.: o id da cliente ou o dia da agenda).
 */
export function useLoad<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível carregar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [key, reload]);

  return { data, error, loading, reload };
}

export interface Notice {
  type: 'agenda.changed' | 'conversation.updated' | 'handoff.requested' | 'contact.updated';
  id?: string;
  /** Mudança feita pela cliente no WhatsApp que merece aviso para a dona. */
  alert?: 'booked' | 'rescheduled' | 'cancelled';
}

// Uma conexão só para o painel inteiro, dividida entre as telas abertas.
const listeners = new Set<(notice: Notice) => void>();
let source: EventSource | null = null;

function subscribe(listener: (notice: Notice) => void): () => void {
  listeners.add(listener);
  if (!source) {
    source = new EventSource('/api/panel/events');
    source.addEventListener('notice', (event) => {
      let notice: Notice;
      try {
        notice = JSON.parse((event as MessageEvent<string>).data) as Notice;
      } catch {
        return; // aviso malformado: ignora
      }
      for (const l of [...listeners]) l(notice);
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      source?.close();
      source = null;
    }
  };
}

/** Ouve os avisos em tempo real do painel (Server-Sent Events). */
export function useRealtime(onNotice: (notice: Notice) => void): void {
  const handler = useRef(onNotice);
  useLayoutEffect(() => {
    handler.current = onNotice;
  });

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    return subscribe((notice) => handler.current(notice));
  }, []);
}

/** Hash da URL como rota simples: #/hoje, #/clientes/123 ... Funciona sem servidor de rotas. */
export function useRoute(): [string, (to: string) => void] {
  const read = () => window.location.hash.replace(/^#/, '') || '/hoje';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const go = useCallback((to: string) => {
    window.location.hash = to;
  }, []);
  return [route, go];
}
