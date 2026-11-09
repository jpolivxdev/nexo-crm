import { BRAND_COLOR_SUGGESTIONS, contrastRatio } from '@nexo/core';
import { Check, Copy, Globe, ImageUp, Palette } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Banner, Loading } from '../components/ui';
import { api, ApiError, uploadFile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { logoUrl } from '../lib/brand';
import { useLoad } from '../lib/hooks';

interface BrandData {
  name: string;
  color: string | null;
  font: string | null;
  logoVersion: number | null;
  domain: {
    name: string;
    verified: boolean;
    verifiedAt: string | null;
    txtName: string;
    txtValue: string;
  } | null;
}

const FONT_OPTIONS = [
  { id: 'nexo', label: 'Padrão', hint: 'Moderna e fácil de ler' },
  { id: 'classica', label: 'Clássica', hint: 'Títulos com serifa, mais elegante' },
  { id: 'sistema', label: 'Do aparelho', hint: 'A mesma do celular ou computador' },
] as const;

const NEXO_COLOR = '#6A1FE8';
const HEX = /^#[0-9a-f]{6}$/i;
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/**
 * Marca do negócio (Premium): logo, cor dos botões e fonte do painel, e o domínio próprio.
 * O "feito pela nexo" continua no rodapé.
 */
export function BrandSettings() {
  const { refresh } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api<BrandData>('/panel/brand'), 'brand');
  if (loading && !data) return <Loading />;
  if (error && !data) return <Banner>{error}</Banner>;
  if (!data) return null;
  const done = async () => {
    await reload();
    await refresh();
  };
  return (
    <>
      <PageHeader
        Icon={Palette}
        title="Marca e domínio"
        subtitle="O painel e a tela de entrada com a cara do seu negócio."
      />
      <Look data={data} onSaved={done} />
      <Domain data={data} onSaved={done} />
    </>
  );
}

function Look({ data, onSaved }: { data: BrandData; onSaved: () => Promise<void> }) {
  const [color, setColor] = useState(data.color ?? NEXO_COLOR);
  const [font, setFont] = useState(data.font ?? 'nexo');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const valid = HEX.test(color);
  const ratio = valid ? contrastRatio(color, '#FFFFFF') : 0;
  const readable = ratio >= 4.5;

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await api('/panel/brand', {
        method: 'PUT',
        body: { color: color.toUpperCase() === NEXO_COLOR ? null : color, font },
      });
      await onSaved();
      setStatus({ ok: true, text: 'Marca salva. O painel já está com ela.' });
    } catch (e) {
      setStatus({ ok: false, text: errorText(e, 'Não foi possível salvar.') });
    } finally {
      setBusy(false);
    }
  }

  async function sendLogo(file: File) {
    setBusy(true);
    setStatus(null);
    try {
      await uploadFile('/panel/brand/logo', file);
      await onSaved();
      setStatus({ ok: true, text: 'Logo salva.' });
    } catch (e) {
      setStatus({ ok: false, text: errorText(e, 'Não foi possível salvar a logo.') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form brand-look" onSubmit={save} aria-labelledby="marca-visual">
      <h2 id="marca-visual">Logo, cor e fonte</h2>
      <div className="brand-look__logo">
        {data.logoVersion ? (
          <img src={logoUrl(data.logoVersion)} alt={`Logo de ${data.name}`} />
        ) : (
          <span className="brand-look__initial" aria-hidden="true">
            {data.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <button
            type="button"
            className="button button--ghost button--small"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <ImageUp aria-hidden="true" size={16} />{' '}
            {data.logoVersion ? 'Trocar logo' : 'Enviar logo'}
          </button>
          <p className="muted small">PNG, JPG ou WEBP, até 1 MB. Quadrada fica melhor.</p>
        </div>
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          aria-label="Escolher logo"
          accept=".png,.jpg,.jpeg,.webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void sendLogo(f);
          }}
        />
      </div>

      <fieldset className="brand-look__colors">
        <legend>Cor dos botões e destaques</legend>
        <div className="brand-look__swatches" role="radiogroup" aria-label="Sugestões de cor">
          {BRAND_COLOR_SUGGESTIONS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color.toUpperCase() === c}
              aria-label={c === NEXO_COLOR ? `${c} (da nexo)` : c}
              className={color.toUpperCase() === c ? 'board__color on' : 'board__color'}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <label className="brand-look__picker">
            <span className="sr-only">Escolher outra cor</span>
            <input
              type="color"
              value={valid ? color : NEXO_COLOR}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
            />
          </label>
        </div>
        <label>
          Código da cor
          <input
            value={color}
            maxLength={7}
            onChange={(e) => setColor(e.target.value.trim())}
            aria-describedby="contraste"
          />
        </label>
        <p id="contraste" className={readable ? 'muted small' : 'small brand-look__warn'}>
          {!valid
            ? 'Use o formato #RRGGBB.'
            : readable
              ? `Contraste com o texto branco: ${ratio.toFixed(1).replace('.', ',')} para 1. Boa leitura.`
              : `Contraste ${ratio.toFixed(1).replace('.', ',')} para 1: clara demais para botão com texto branco. Escolha um tom mais escuro.`}
        </p>
        <div className="brand-look__preview" aria-hidden="true">
          <span className="brand-look__button" style={{ background: valid ? color : NEXO_COLOR }}>
            Marcar horário
          </span>
          <span className="brand-look__tag" style={{ color: valid ? color : NEXO_COLOR }}>
            Exemplo de destaque
          </span>
        </div>
      </fieldset>

      <fieldset>
        <legend>Fonte do painel</legend>
        {FONT_OPTIONS.map((f) => (
          <label key={f.id} className="check">
            <input
              type="radio"
              name="fonte"
              value={f.id}
              checked={font === f.id}
              onChange={() => setFont(f.id)}
            />
            <span>
              <strong className={`brand-font brand-font--${f.id}`}>{f.label}</strong>{' '}
              <span className="muted small">{f.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {status &&
        (status.ok ? (
          <p className="muted small" role="status">
            {status.text}
          </p>
        ) : (
          <Banner>{status.text}</Banner>
        ))}
      <button type="submit" className="button" disabled={busy || !valid || !readable}>
        Salvar marca
      </button>
    </form>
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="brand-domain__line">
      <span className="muted small">{label}</span>
      <code>{value}</code>
      <button
        type="button"
        className="icon-button icon-button--plain"
        aria-label={`Copiar ${label.toLowerCase()}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => setCopied(true));
        }}
      >
        {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
      </button>
    </div>
  );
}

function Domain({ data, onSaved }: { data: BrandData; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(data.domain?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
      await onSaved();
      setStatus({ ok: true, text: ok });
    } catch (e) {
      setStatus({ ok: false, text: errorText(e, 'Não foi possível salvar.') });
    } finally {
      setBusy(false);
    }
  }

  const d = data.domain;
  return (
    <section className="card brand-domain" aria-labelledby="dominio">
      <h2 id="dominio">
        <Globe aria-hidden="true" size={18} /> Domínio próprio
      </h2>
      <p className="muted small">
        Para a equipe entrar pelo endereço do seu negócio (por exemplo, painel.seunegocio.com.br),
        com a sua logo na tela de entrada. O endereço precisa ser seu, registrado num site de
        domínios.
      </p>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () => api('/panel/brand/domain', { method: 'PUT', body: { domain: value } }),
            'Endereço salvo. Agora crie o registro abaixo no site do seu domínio.',
          );
        }}
      >
        <label>
          Endereço
          <input
            value={value}
            placeholder="painel.seunegocio.com.br"
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <div className="row">
          <button type="submit" className="button button--small" disabled={busy || !value.trim()}>
            Salvar endereço
          </button>
          {d && (
            <button
              type="button"
              className="button button--ghost button--small"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    'Tirar o domínio próprio? A equipe volta a entrar pelo endereço da nexo.',
                  )
                ) {
                  void run(
                    () => api('/panel/brand/domain', { method: 'PUT', body: { domain: null } }),
                    'Domínio retirado.',
                  );
                }
              }}
            >
              Tirar domínio
            </button>
          )}
        </div>
      </form>
      {d && (
        <div className="brand-domain__steps">
          {d.verified ? (
            <p className="brand-domain__ok" role="status">
              <Check aria-hidden="true" size={16} /> {d.name} é do seu negócio (verificado). Falta a
              nexo ligar o endereço na hospedagem; avisamos quando estiver no ar.
            </p>
          ) : (
            <>
              <p>
                <strong>1.</strong> No site onde você comprou o domínio, crie um registro do tipo{' '}
                <strong>TXT</strong>:
              </p>
              <CopyLine label="Nome" value={d.txtName} />
              <CopyLine label="Valor" value={d.txtValue} />
              <p>
                <strong>2.</strong> Depois de criar, toque em verificar. O DNS pode levar algumas
                horas para atualizar.
              </p>
              <button
                type="button"
                className="button button--small"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => api('/panel/brand/domain/verify', { method: 'POST' }),
                    'Domínio verificado.',
                  )
                }
              >
                Verificar agora
              </button>
              <p className="muted small">
                O segundo registro (que aponta o endereço para o painel) depende da hospedagem da
                nexo: [A DEFINIR]. A nexo passa esse dado quando for ligar.
              </p>
            </>
          )}
        </div>
      )}
      {status &&
        (status.ok ? (
          <p className="muted small" role="status">
            {status.text}
          </p>
        ) : (
          <Banner>{status.text}</Banner>
        ))}
    </section>
  );
}
