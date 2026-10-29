import { type FormEvent, useState } from 'react';
import { deviceAlertsOn, setDeviceAlerts } from '../components/OwnerToasts';
import { Banner, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useLoad } from '../lib/hooks';

interface AlertSettings {
  notifyEmail: boolean;
  nextVisitDays: number | null;
  emailAvailable: boolean;
}

/** Conta → Avisos: como a dona fica sabendo do que acontece e quando lembrar do próximo horário. */
export function Alerts({ go }: { go: (to: string) => void }) {
  const { data, error, loading } = useLoad(
    () => api<AlertSettings>('/panel/setup/alerts'),
    'alerts',
  );
  if (loading && !data) return <Loading />;
  if (error && !data) return <Banner>{error}</Banner>;
  if (!data) return null;
  return <AlertsForm initial={data} go={go} />;
}

function AlertsForm({ initial, go }: { initial: AlertSettings; go: (to: string) => void }) {
  const [notifyEmail, setNotifyEmail] = useState(initial.notifyEmail);
  const [offer, setOffer] = useState(initial.nextVisitDays !== null);
  const [days, setDays] = useState(initial.nextVisitDays ?? 10);
  const [device, setDevice] = useState(deviceAlertsOn);
  const [deviceNote, setDeviceNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function toggleDevice(on: boolean) {
    setDeviceNote(null);
    if (!on) {
      setDeviceAlerts(false);
      setDevice(false);
      return;
    }
    if (typeof Notification === 'undefined') {
      setDeviceNote('Este navegador não mostra notificações. Os avisos continuam no painel.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setDeviceNote('O navegador não deixou. Dá para liberar nas configurações do site.');
      return;
    }
    setDeviceAlerts(true);
    setDevice(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await api('/panel/setup/alerts', {
        method: 'PUT',
        body: { notifyEmail, nextVisitDays: offer ? days : null },
      });
      setStatus({ ok: true, text: 'Avisos salvos.' });
    } catch (e) {
      setStatus({
        ok: false,
        text: e instanceof ApiError ? e.message : 'Não foi possível salvar.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="link back" onClick={() => go('/conta')}>
        ‹ Conta
      </button>
      <header className="page-header">
        <h1>Avisos</h1>
        <p className="muted">
          Com o painel aberto, um aviso aparece no topo sempre que uma cliente marca, remarca ou
          cancela pelo WhatsApp, ou pede para falar com você.
        </p>
      </header>

      <section className="card section" aria-labelledby="aparelho">
        <h2 id="aparelho">Neste aparelho</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={device}
            onChange={(e) => void toggleDevice(e.target.checked)}
          />
          Mostrar notificação quando o painel estiver aberto em segundo plano
        </label>
        <p className="muted small">
          Vale só neste aparelho. A notificação não mostra o nome da cliente.
        </p>
        {deviceNote && <Banner>{deviceNote}</Banner>}
      </section>

      <form className="form section" onSubmit={submit}>
        <section className="card" aria-labelledby="por-email">
          <h2 id="por-email">Por e-mail</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.checked)}
            />
            Mandar um e-mail para mim a cada horário marcado, remarcado ou cancelado pelo WhatsApp
          </label>
          <p className="muted small">
            O e-mail diz o serviço, o dia e a hora. Quem é a cliente fica só no painel.
          </p>
          {!initial.emailAvailable && (
            <p className="banner banner--warn" role="note">
              O envio de e-mail ainda não está ligado neste sistema. Pode deixar marcado: começa a
              chegar quando a nexo ligar.
            </p>
          )}
        </section>

        <section className="card" aria-labelledby="proximo">
          <h2 id="proximo">Oferecer o próximo horário</h2>
          <label className="check">
            <input type="checkbox" checked={offer} onChange={(e) => setOffer(e.target.checked)} />
            Quando eu marcar um atendimento como realizado e a cliente não tiver outro horário,
            criar um lembrete para oferecer o próximo
          </label>
          {offer && (
            <label>
              Quantos dias depois do atendimento
              <input
                type="number"
                min={0}
                max={180}
                required
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </label>
          )}
          <p className="muted small">
            O lembrete aparece em Hoje, no dia certo. Se a cliente marcar antes, ele some sozinho.
          </p>
        </section>

        <div className="sticky-save">
          {status && <Banner kind={status.ok ? 'ok' : 'error'}>{status.text}</Banner>}
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </>
  );
}
