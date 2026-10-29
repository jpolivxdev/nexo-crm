import { useState } from 'react';
import { Banner } from '../components/ui';
import { api, ApiError } from '../lib/api';

/** Nome do arquivo: "dados-maria-silva-2031-01-15.json" (sem acento e sem espaço). */
export function exportFileName(name: string, today: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `dados-${slug || 'cliente'}-${today}.json`;
}

function download(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Direitos da cliente (LGPD): baixar tudo o que o negócio guarda sobre ela e excluir os dados.
 * Excluir pede uma segunda confirmação, porque não dá para desfazer.
 */
export function ContactPrivacy({
  id,
  name,
  onErased,
}: {
  id: string;
  name: string;
  onErased: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function exportData() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const data = await api<unknown>(`/panel/contacts/${id}/export`);
      download(data, exportFileName(name, new Date().toISOString().slice(0, 10)));
      setStatus('Arquivo baixado. Você pode mandar para a cliente se ela pedir.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível baixar os dados.');
    } finally {
      setBusy(false);
    }
  }

  async function erase() {
    setBusy(true);
    setError(null);
    try {
      await api(`/panel/contacts/${id}/erase`, { method: 'POST', body: { confirm: true } });
      onErased();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível excluir.');
      setBusy(false);
    }
  }

  return (
    <section className="section privacy" aria-labelledby="dados-cliente">
      <h2 id="dados-cliente">Dados da cliente</h2>
      <p className="muted small">
        Se a cliente pedir, você pode mandar para ela tudo o que fica guardado aqui ou apagar os
        dados dela.
      </p>
      {error && <Banner>{error}</Banner>}
      {status && <p role="status">{status}</p>}

      {!confirming ? (
        <div className="row privacy__actions">
          <button
            type="button"
            className="button button--small button--ghost"
            disabled={busy}
            onClick={exportData}
          >
            Baixar dados
          </button>
          <button
            type="button"
            className="button button--small button--ghost"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            Excluir dados
          </button>
        </div>
      ) : (
        <div className="privacy__confirm" role="group" aria-labelledby="excluir-titulo">
          <h3 id="excluir-titulo">Excluir os dados de {name}?</h3>
          <ul className="small">
            <li>Some o nome, o telefone, as anotações e todas as conversas.</li>
            <li>Os horários marcados para frente são cancelados e ficam livres.</li>
            <li>Os horários que já passaram continuam nos números, sem o nome dela.</li>
          </ul>
          <p className="small">
            <strong>Não dá para desfazer.</strong> Se quiser guardar uma cópia, baixe os dados
            antes.
          </p>
          <div className="row privacy__actions">
            <button type="button" className="button button--small" disabled={busy} onClick={erase}>
              {busy ? 'Excluindo…' : 'Sim, excluir para sempre'}
            </button>
            <button
              type="button"
              className="button button--small button--ghost"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
