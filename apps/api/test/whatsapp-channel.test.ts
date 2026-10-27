import { describe, expect, it, vi } from 'vitest';
import { isValidSignature } from '../src/channel/whatsapp/signature.js';
import { parseWebhook } from '../src/channel/whatsapp/webhook-payload.js';
import { toGraphPayload } from '../src/channel/whatsapp/graph-payload.js';
import {
  ChannelSendError,
  WhatsAppCloudChannel,
} from '../src/channel/whatsapp/whatsapp-cloud.channel.js';
import { APP_SECRET, buttonReply, metaWebhook, sign, textMessage } from './support/meta.js';

describe('assinatura do webhook (X-Hub-Signature-256)', () => {
  const raw = JSON.stringify(metaWebhook('111', [textMessage('oi')]));

  it('aceita a assinatura certa do corpo bruto', () => {
    expect(isValidSignature(Buffer.from(raw), sign(raw), APP_SECRET)).toBe(true);
  });

  it('recusa segredo errado, corpo alterado, cabeçalho ausente ou malformado', () => {
    expect(
      isValidSignature(Buffer.from(raw), sign(raw, 'outro-segredo-qualquer'), APP_SECRET),
    ).toBe(false);
    expect(isValidSignature(Buffer.from(`${raw} `), sign(raw), APP_SECRET)).toBe(false);
    expect(isValidSignature(Buffer.from(raw), undefined, APP_SECRET)).toBe(false);
    expect(isValidSignature(Buffer.from(raw), 'sha1=abc', APP_SECRET)).toBe(false);
    expect(isValidSignature(Buffer.from(raw), 'sha256=zz', APP_SECRET)).toBe(false);
    expect(isValidSignature(undefined, sign(raw), APP_SECRET)).toBe(false);
  });
});

describe('leitura do webhook', () => {
  it('traduz texto, botão e lista para o que o robô entende', () => {
    const list = {
      ...buttonReply('x', 'y'),
      interactive: { type: 'list_reply', list_reply: { id: 'svc:1', title: 'Volume russo' } },
    };
    const parsed = parseWebhook(
      metaWebhook('111', [textMessage('Oi!'), buttonReply('menu:book', 'Marcar horário'), list]),
    );
    expect(parsed?.messages.map((m) => m.input)).toEqual([
      { kind: 'text', text: 'Oi!' },
      { kind: 'choice', id: 'menu:book' },
      { kind: 'choice', id: 'svc:1' },
    ]);
    expect(parsed?.messages[0]).toMatchObject({
      channel: 'whatsapp',
      businessExternalId: '111',
      from: '5500900000001',
      profileName: 'Cliente Teste',
      body: 'Oi!',
      receivedAt: '2031-01-01T00:00:00.000Z',
    });
  });

  it('foto ou áudio vira texto vazio, sem conteúdo guardado', () => {
    const image = { ...textMessage('x'), type: 'image', text: undefined, image: { id: 'm1' } };
    const [m] = parseWebhook(metaWebhook('111', [image]))!.messages;
    expect(m).toMatchObject({ type: 'image', input: { kind: 'text', text: '' }, body: null });
  });

  it('lê as atualizações de entrega', () => {
    const parsed = parseWebhook(metaWebhook('111', [], [{ id: 'wamid.X', status: 'read' }]));
    expect(parsed?.statuses).toEqual([
      { channel: 'whatsapp', businessExternalId: '111', externalId: 'wamid.X', status: 'read' },
    ]);
  });

  it('recusa formato estranho e texto acima do limite', () => {
    expect(parseWebhook({ object: 'page', entry: [] })).toBeNull();
    expect(parseWebhook('lixo')).toBeNull();
    const huge = textMessage('a'.repeat(5000));
    expect(parseWebhook(metaWebhook('111', [huge]))?.messages).toEqual([]);
    const badPhone = textMessage('oi', '+55 (00) 9');
    expect(parseWebhook(metaWebhook('111', [badPhone]))?.messages).toEqual([]);
  });
});

describe('envio pela WhatsApp Cloud API', () => {
  it('monta botões e lista no formato da Graph API', () => {
    const buttons = toGraphPayload('5500900000001', {
      type: 'buttons',
      body: 'Confirma?',
      buttons: [
        { id: 'confirm:yes', title: 'Sim' },
        { id: 'confirm:no', title: 'Não' },
      ],
    });
    expect(buttons).toMatchObject({
      messaging_product: 'whatsapp',
      to: '5500900000001',
      type: 'interactive',
      interactive: {
        type: 'button',
        action: { buttons: [{ type: 'reply', reply: { id: 'confirm:yes', title: 'Sim' } }, {}] },
      },
    });
    const list = toGraphPayload('5500900000001', {
      type: 'list',
      body: 'Escolha',
      button: 'Ver horários',
      rows: [{ id: 'time:1', title: '09:00', description: 'terça' }],
    });
    expect(list).toMatchObject({
      interactive: {
        type: 'list',
        action: { button: 'Ver horários', sections: [{ rows: [{ id: 'time:1' }] }] },
      },
    });
  });

  it('envia com o token no cabeçalho e devolve o wamid', async () => {
    const fetch = vi.fn(async () => Response.json({ messages: [{ id: 'wamid.OUT1' }] }));
    const channel = new WhatsAppCloudChannel({
      phoneNumberId: '111',
      accessToken: 'token-de-teste-123456',
      fetch,
    });
    await expect(channel.send('5500900000001', { type: 'text', body: 'oi' })).resolves.toEqual({
      externalId: 'wamid.OUT1',
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v25.0/111/messages');
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer token-de-teste-123456',
    );
  });

  it('erro da Meta vira erro sem o conteúdo da resposta', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ error: { message: 'telefone 5500900000001' } }, { status: 400 }),
    );
    const channel = new WhatsAppCloudChannel({
      phoneNumberId: '111',
      accessToken: 'token-de-teste-123456',
      fetch,
    });
    const error = await channel.send('5500900000001', { type: 'text', body: 'oi' }).catch((e) => e);
    expect(error).toBeInstanceOf(ChannelSendError);
    expect(String(error.message)).not.toContain('5500900000001');
  });
});
