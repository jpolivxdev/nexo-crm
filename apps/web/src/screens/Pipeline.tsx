import { useState } from 'react';
import { Banner, Empty, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { contactName } from '../lib/format';
import { useLoad, useRealtime } from '../lib/hooks';
import type { Pipeline as PipelineData } from '../lib/types';

/** Etapas: atendimentos em andamento por etapa. Mover por toque (sem arrastar, bom no celular). */
export function Pipeline({ go }: { go: (to: string) => void }) {
  const { data, error, loading, reload } = useLoad(
    () => api<PipelineData>('/panel/pipeline'),
    'pipeline',
  );
  const [actionError, setActionError] = useState<string | null>(null);
  useRealtime(() => void reload());

  async function move(dealId: string, stageId: string) {
    setActionError(null);
    try {
      await api(`/panel/deals/${dealId}/stage`, { method: 'POST', body: { stageId } });
      await reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Não foi possível mover.');
    }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <Banner>{error}</Banner>;
  if (!data) return null;

  return (
    <>
      <header className="page-header">
        <div className="row row--between">
          <h1>Etapas</h1>
          <button type="button" className="button button--ghost" onClick={() => go('/regras')}>
            Regras automáticas
          </button>
        </div>
        <p className="muted">O robô move sozinho; você pode mudar a qualquer momento.</p>
      </header>
      {actionError && <Banner>{actionError}</Banner>}
      <div className="board">
        {data.stages.map((stage) => (
          <section key={stage.id} className="column" aria-labelledby={`etapa-${stage.id}`}>
            <h2 id={`etapa-${stage.id}`}>
              {stage.name} <span className="count">{stage.deals.length}</span>
            </h2>
            {stage.deals.length === 0 ? (
              <Empty title="Ninguém aqui" />
            ) : (
              stage.deals.map((deal) => (
                <article key={deal.id} className="card">
                  <button
                    type="button"
                    className="link"
                    onClick={() => go(`/clientes/${deal.contact.id}`)}
                  >
                    {contactName(deal.contact)}
                  </button>
                  <label className="move">
                    <span className="sr-only">Mover {contactName(deal.contact)} para</span>
                    <select value={stage.id} onChange={(e) => void move(deal.id, e.target.value)}>
                      {data.stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id === stage.id ? `Etapa: ${s.name}` : `Mover para ${s.name}`}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              ))
            )}
          </section>
        ))}
      </div>
    </>
  );
}
