import type { OutgoingMessage } from '@nexo/core';

/** Corpo do POST /{phone-number-id}/messages da Graph API para cada tipo de resposta do robô. */
export function toGraphPayload(to: string, message: OutgoingMessage): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  switch (message.type) {
    case 'text':
      return { ...base, type: 'text', text: { body: message.body, preview_url: false } };
    case 'buttons':
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: message.body },
          action: {
            buttons: message.buttons.map((b) => ({
              type: 'reply',
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      };
    case 'list':
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: message.body },
          action: {
            button: message.button,
            sections: [
              {
                title: 'Opções',
                rows: message.rows.map((r) => ({
                  id: r.id,
                  title: r.title,
                  ...(r.description ? { description: r.description } : {}),
                })),
              },
            ],
          },
        },
      };
  }
}
