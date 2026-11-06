import { Bell as BellIcon, History } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useRealtime } from '../lib/hooks';
import type { Today } from '../lib/types';
import { Activity } from '../screens/Today';
import { alertText } from './OwnerToasts';
import { Empty, Loading } from './ui';

/**
 * Sino de avisos: o que as clientes fizeram por último (a mesma lista de "O que aconteceu").
 * O ponto aparece quando chega um aviso novo com o painel aberto e some ao abrir o sino.
 */
export function Bell({ go }: { go: (to: string) => void }) {
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useRealtime((notice) => {
    if (alertText(notice)) setFresh(true);
    if (open) void load();
  });

  async function load() {
    try {
      setData(await api<Today>('/panel/today'));
      setError(false);
    } catch {
      setError(true);
    }
  }

  function toggle() {
    if (!open) {
      setFresh(false);
      void load();
    }
    setOpen((v) => !v);
  }

  // Fecha ao tocar fora ou com Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const goAndClose = (to: string) => {
    setOpen(false);
    go(to);
  };

  return (
    <div className="bell" ref={wrap}>
      <button
        type="button"
        className="icon-button"
        aria-label={fresh ? 'Avisos (tem aviso novo)' : 'Avisos'}
        aria-expanded={open}
        aria-controls={panelId}
        data-tour="avisos"
        onClick={toggle}
      >
        <BellIcon aria-hidden="true" size={22} />
        {fresh && <span className="bell__dot" aria-hidden="true" />}
      </button>
      {open && (
        <div id={panelId} className="bell__panel" role="region" aria-label="Avisos">
          <p className="bell__title">O que aconteceu</p>
          {error ? (
            <p className="muted">Não foi possível carregar os avisos agora.</p>
          ) : !data ? (
            <Loading />
          ) : data.activity.length === 0 ? (
            <Empty title="Nada por aqui ainda" icon={<History size={24} />}>
              Cada horário marcado, remarcado ou cancelado pelo WhatsApp aparece aqui.
            </Empty>
          ) : (
            <ol className="activity">
              {data.activity.map((item) => (
                <Activity key={item.id} item={item} timeZone={data.timeZone} go={goAndClose} />
              ))}
            </ol>
          )}
          <button type="button" className="link bell__more" onClick={() => goAndClose('/hoje')}>
            Ver o dia de hoje
          </button>
        </div>
      )}
    </div>
  );
}
