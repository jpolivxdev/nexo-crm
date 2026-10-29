import { BellRing, X } from 'lucide-react';
import { useState } from 'react';
import { type Notice, useRealtime } from '../lib/hooks';

const DEVICE_KEY = 'nexo.avisos-aparelho';

/** Texto do aviso. Sem nome da cliente: pode aparecer na tela bloqueada do celular. */
export function alertText(notice: Notice): { text: string; to: string } | null {
  if (notice.type === 'handoff.requested') {
    return { text: 'Uma cliente quer falar com você.', to: '/hoje' };
  }
  if (notice.type !== 'agenda.changed' || !notice.alert) return null;
  const verb = { booked: 'marcou', rescheduled: 'remarcou', cancelled: 'cancelou' }[notice.alert];
  return { text: `Uma cliente ${verb} um horário pelo WhatsApp.`, to: '/agenda' };
}

export function deviceAlertsOn(): boolean {
  try {
    return localStorage.getItem(DEVICE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDeviceAlerts(on: boolean) {
  try {
    if (on) localStorage.setItem(DEVICE_KEY, '1');
    else localStorage.removeItem(DEVICE_KEY);
  } catch {
    // aparelho sem armazenamento: o aviso na tela continua
  }
}

/** Notificação do aparelho, só com o painel em segundo plano e se a dona ligou neste aparelho. */
function notifyDevice(text: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!deviceAlertsOn() || document.visibilityState === 'visible') return;
  try {
    new Notification('Seu painel', { body: text, tag: 'nexo-aviso' });
  } catch {
    // alguns celulares só notificam pelo service worker: fica o aviso na tela
  }
}

/** Avisos da dona: aparecem no topo do painel quando a cliente mexe na agenda ou pede atendimento. */
export function OwnerToasts({ go }: { go: (to: string) => void }) {
  const [items, setItems] = useState<{ key: number; text: string; to: string }[]>([]);

  useRealtime((notice) => {
    const alert = alertText(notice);
    if (!alert) return;
    notifyDevice(alert.text);
    setItems((current) => [...current.slice(-2), { key: Date.now() + Math.random(), ...alert }]);
  });

  const close = (key: number) => setItems((current) => current.filter((i) => i.key !== key));
  if (items.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.key} className="toast">
          <BellRing aria-hidden="true" size={18} />
          <span>{item.text}</span>
          <button
            type="button"
            className="button button--small"
            onClick={() => {
              close(item.key);
              go(item.to);
            }}
          >
            Ver
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar aviso"
            onClick={() => close(item.key)}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}
