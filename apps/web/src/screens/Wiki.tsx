import { parseDoc, type WikiBlock, type WikiSpan } from '@nexo/core';
import {
  Archive,
  ArrowLeft,
  BookOpen,
  Bold,
  Eye,
  FileText,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  Quote,
  Tags,
  Trash2,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Banner, Empty, Loading, Sheet } from '../components/ui';
import { api, ApiError, uploadFile } from '../lib/api';
import { BUSINESS_TZ_FALLBACK, dateTime } from '../lib/format';
import { useLoad } from '../lib/hooks';

interface Category {
  id: string;
  name: string;
  count: number;
}

interface WikiList {
  canEdit: boolean;
  categories: Category[];
  total: number;
  articles: {
    id: string;
    title: string;
    categoryId: string | null;
    pinned: boolean;
    updatedAt: string;
    updatedByName: string;
    excerpt: string;
  }[];
  usage: { bytes: number; max: number };
}

interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  image: boolean;
}

interface Article {
  id: string;
  title: string;
  body: string;
  categoryId: string | null;
  pinned: boolean;
  updatedAt: string;
  updatedByName: string;
  canEdit: boolean;
  attachments: Attachment[];
}

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const fileUrl = (id: string) => `/api/panel/wiki/attachments/${id}`;
const when = (iso: string) => dateTime(iso, BUSINESS_TZ_FALLBACK);

export function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Wiki do negócio (Premium): passo a passo, regras e combinados da equipe.
 * Rotas: /wiki, /wiki/novo, /wiki/:id e /wiki/:id/editar.
 */
export function Wiki({ route, go }: { route: string; go: (to: string) => void }) {
  const parts = route.split('?')[0]!.split('/').filter(Boolean); // ['wiki', id?, 'editar'?]
  const id = parts[1] && /^([0-9a-f-]{36}|demo-[a-z0-9-]+)$/.test(parts[1]) ? parts[1] : null;
  const creating = parts[1] === 'novo';
  const editing = Boolean(id) && parts[2] === 'editar';

  return (
    <>
      <PageHeader
        Icon={BookOpen}
        title="Wiki"
        subtitle="Passo a passo, regras e combinados do negócio, num lugar só para a equipe."
      />
      {creating ? (
        <Editor go={go} />
      ) : id && editing ? (
        <EditExisting id={id} go={go} />
      ) : id ? (
        <ArticleView id={id} go={go} />
      ) : (
        <Library go={go} />
      )}
    </>
  );
}

function Library({ go }: { go: (to: string) => void }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const query = new URLSearchParams();
  if (q.trim()) query.set('q', q.trim());
  if (category) query.set('categoryId', category);
  const qs = query.toString();
  const list = useLoad(() => api<WikiList>(`/panel/wiki${qs ? `?${qs}` : ''}`), `wiki?${qs}`);
  const data = list.data;
  const catName = (cid: string | null) => data?.categories.find((c) => c.id === cid)?.name;

  return (
    <section className="card wiki" aria-label="Artigos da Wiki">
      <div className="wiki__bar">
        <label className="search wiki__search">
          <span className="sr-only">Buscar na Wiki</span>
          <input
            type="search"
            placeholder="Buscar por título ou texto"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        {data?.canEdit && (
          <button type="button" className="button button--small" onClick={() => go('/wiki/novo')}>
            <Plus aria-hidden="true" size={16} /> Novo artigo
          </button>
        )}
      </div>
      {data && (
        <div className="inbox__tabs wiki__cats" role="group" aria-label="Categorias">
          <button
            type="button"
            aria-pressed={category === null}
            className={category === null ? 'on' : ''}
            onClick={() => setCategory(null)}
          >
            Todas ({data.total})
          </button>
          {data.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              className={category === c.id ? 'on' : ''}
              onClick={() => setCategory(c.id)}
            >
              {c.name} ({c.count})
            </button>
          ))}
          {data.canEdit && (
            <button type="button" onClick={() => setManaging(true)}>
              <Tags aria-hidden="true" size={14} /> Categorias
            </button>
          )}
        </div>
      )}
      {list.loading && !data ? (
        <Loading />
      ) : list.error && !data ? (
        <Banner>{list.error}</Banner>
      ) : data && data.articles.length === 0 ? (
        q.trim() || category ? (
          <p className="muted inbox__empty">Nenhum artigo com essa busca.</p>
        ) : (
          <Empty title="A Wiki está vazia" icon={<BookOpen size={24} />}>
            {data.canEdit
              ? 'Escreva o primeiro artigo: como abrir o estúdio, cuidados com o material, combinados com as clientes.'
              : 'Quando a dona ou o gestor escreverem um artigo, ele aparece aqui.'}
          </Empty>
        )
      ) : data ? (
        <ul className="wiki__list">
          {data.articles.map((a) => (
            <li key={a.id}>
              <a href={`#/wiki/${a.id}`} className="wiki__item">
                <span className="wiki__item-top">
                  <strong>{a.title}</strong>
                  {a.pinned && (
                    <span className="tag">
                      <Pin aria-hidden="true" size={12} /> Fixado
                    </span>
                  )}
                </span>
                {a.excerpt && <span className="muted small wiki__excerpt">{a.excerpt}</span>}
                <span className="muted small">
                  {catName(a.categoryId) ? `${catName(a.categoryId)} · ` : ''}
                  Atualizado por {a.updatedByName} em {when(a.updatedAt)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {data?.canEdit && (
        <p className="muted small wiki__usage">
          Anexos: {size(data.usage.bytes)} de {size(data.usage.max)} usados.
        </p>
      )}
      {managing && data && (
        <Categories
          categories={data.categories}
          onClose={() => setManaging(false)}
          onChange={() => {
            void list.reload();
            setCategory(null);
          }}
        />
      )}
    </section>
  );
}

function Categories({
  categories,
  onClose,
  onChange,
}: {
  categories: Category[];
  onClose: () => void;
  onChange: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange();
      return true;
    } catch (e) {
      setError(errorText(e, 'Não foi possível salvar.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (await run(() => api('/panel/wiki/categories', { method: 'POST', body: { name } }))) {
      setName('');
    }
  }

  return (
    <Sheet title="Categorias da Wiki" onClose={onClose}>
      <form className="form" onSubmit={add}>
        <label>
          Nova categoria
          <input
            value={name}
            maxLength={40}
            placeholder="Ex.: Procedimentos"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button type="submit" className="button" disabled={busy || name.trim().length < 2}>
          Adicionar
        </button>
      </form>
      {error && <Banner>{error}</Banner>}
      {categories.length > 0 && (
        <ul className="wiki__cat-list">
          {categories.map((c) => (
            <li key={c.id}>
              <span>
                {c.name} <span className="muted small">({c.count})</span>
              </span>
              <button
                type="button"
                className="icon-button icon-button--plain"
                aria-label={`Renomear ${c.name}`}
                disabled={busy}
                onClick={() => {
                  const next = window.prompt('Novo nome da categoria', c.name);
                  if (next && next.trim() !== c.name) {
                    void run(() =>
                      api(`/panel/wiki/categories/${c.id}`, {
                        method: 'PUT',
                        body: { name: next },
                      }),
                    );
                  }
                }}
              >
                <Pencil aria-hidden="true" size={16} />
              </button>
              <button
                type="button"
                className="icon-button icon-button--plain"
                aria-label={`Tirar ${c.name}`}
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Tirar a categoria ${c.name}? Os artigos dela ficam, só sem categoria.`,
                    )
                  ) {
                    void run(() => api(`/panel/wiki/categories/${c.id}`, { method: 'DELETE' }));
                  }
                }}
              >
                <Trash2 aria-hidden="true" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function useArticle(id: string) {
  return useLoad(() => api<Article>(`/panel/wiki/articles/${id}`), `wiki-${id}`);
}

function ArticleView({ id, go }: { id: string; go: (to: string) => void }) {
  const { data, error, loading } = useArticle(id);
  const cats = useLoad(() => api<WikiList>('/panel/wiki'), 'wiki-cats');
  const [actionError, setActionError] = useState<string | null>(null);

  async function archive() {
    if (!window.confirm('Arquivar este artigo? Ele sai da Wiki, mas fica guardado.')) return;
    try {
      await api(`/panel/wiki/articles/${id}/archive`, { method: 'POST' });
      go('/wiki');
    } catch (e) {
      setActionError(errorText(e, 'Não foi possível arquivar.'));
    }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <Banner>{error}</Banner>;
  if (!data) return null;
  const category = cats.data?.categories.find((c) => c.id === data.categoryId)?.name;
  const files = data.attachments;

  return (
    <article className="card wiki-article" aria-labelledby="wiki-title">
      <div className="inbox__head">
        <button
          type="button"
          className="icon-button icon-button--plain"
          aria-label="Voltar para a Wiki"
          onClick={() => go('/wiki')}
        >
          <ArrowLeft aria-hidden="true" size={20} />
        </button>
        <div className="inbox__who">
          <h2 id="wiki-title">{data.title}</h2>
          <span className="muted small">
            {category ? `${category} · ` : ''}Atualizado por {data.updatedByName} em{' '}
            {when(data.updatedAt)}
          </span>
        </div>
        {data.canEdit && (
          <>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => go(`/wiki/${id}/editar`)}
            >
              <Pencil aria-hidden="true" size={16} /> Editar
            </button>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => void archive()}
            >
              <Archive aria-hidden="true" size={16} /> Arquivar
            </button>
          </>
        )}
      </div>
      {actionError && <Banner>{actionError}</Banner>}
      {data.body.trim() ? (
        <DocView source={data.body} files={files} />
      ) : (
        <p className="muted">Este artigo ainda não tem texto.</p>
      )}
      {files.length > 0 && (
        <section className="wiki-files" aria-label="Anexos">
          <h3>Anexos</h3>
          <ul>
            {files.map((f) => (
              <li key={f.id}>
                <a
                  href={fileUrl(f.id)}
                  target="_blank"
                  rel="noreferrer"
                  download={f.image ? undefined : f.name}
                >
                  <Paperclip aria-hidden="true" size={16} /> {f.name}
                </a>
                <span className="muted small">{size(f.size)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

/** Desenha o texto do artigo com elementos próprios (nada de HTML vindo do texto). */
export function DocView({ source, files }: { source: string; files: Attachment[] }) {
  const blocks = parseDoc(source);
  return (
    <div className="wiki-doc">
      {blocks.map((b, i) => (
        <Block key={i} block={b} files={files} />
      ))}
    </div>
  );
}

function Block({ block: b, files }: { block: WikiBlock; files: Attachment[] }) {
  switch (b.type) {
    case 'heading':
      return b.level === 2 ? (
        <h3>
          <Spans spans={b.spans} />
        </h3>
      ) : (
        <h4>
          <Spans spans={b.spans} />
        </h4>
      );
    case 'paragraph':
      return (
        <p>
          <Spans spans={b.spans} />
        </p>
      );
    case 'quote':
      return (
        <blockquote>
          <Spans spans={b.spans} />
        </blockquote>
      );
    case 'list': {
      const items = b.items.map((spans, k) => (
        <li key={k}>
          <Spans spans={spans} />
        </li>
      ));
      return b.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
    case 'image': {
      const file = files.find((f) => f.id === b.attachmentId && f.image);
      return file ? (
        <figure>
          <img src={fileUrl(file.id)} alt={b.alt || file.name} loading="lazy" />
          {b.alt && <figcaption className="muted small">{b.alt}</figcaption>}
        </figure>
      ) : (
        <p className="muted small">[imagem removida]</p>
      );
    }
  }
}

function Spans({ spans }: { spans: WikiSpan[] }) {
  return (
    <>
      {spans.map((s, i): ReactNode => {
        switch (s.type) {
          case 'bold':
            return <strong key={i}>{s.text}</strong>;
          case 'italic':
            return <em key={i}>{s.text}</em>;
          case 'code':
            return <code key={i}>{s.text}</code>;
          case 'link':
            return s.href.startsWith('#/') ? (
              <a key={i} href={s.href}>
                {s.text}
              </a>
            ) : (
              <a key={i} href={s.href} target="_blank" rel="noreferrer noopener">
                {s.text}
              </a>
            );
          default:
            return <span key={i}>{s.text}</span>;
        }
      })}
    </>
  );
}

function EditExisting({ id, go }: { id: string; go: (to: string) => void }) {
  const { data, error, loading, reload } = useArticle(id);
  if (loading && !data) return <Loading />;
  if (error && !data) return <Banner>{error}</Banner>;
  if (!data) return null;
  return <Editor key={id} article={data} go={go} onFiles={() => void reload()} />;
}

const TOOLS: {
  label: string;
  Icon: typeof Bold;
  apply: (sel: string) => { text: string; block?: boolean };
}[] = [
  {
    label: 'Título de seção',
    Icon: Heading2,
    apply: (s) => ({ text: `## ${s || 'Título'}`, block: true }),
  },
  {
    label: 'Subtítulo',
    Icon: Heading3,
    apply: (s) => ({ text: `### ${s || 'Subtítulo'}`, block: true }),
  },
  { label: 'Negrito', Icon: Bold, apply: (s) => ({ text: `**${s || 'texto'}**` }) },
  { label: 'Itálico', Icon: Italic, apply: (s) => ({ text: `_${s || 'texto'}_` }) },
  {
    label: 'Lista',
    Icon: List,
    apply: (s) => ({
      text: (s || 'item')
        .split('\n')
        .map((l) => `- ${l}`)
        .join('\n'),
      block: true,
    }),
  },
  {
    label: 'Lista numerada',
    Icon: ListOrdered,
    apply: (s) => ({
      text: (s || 'item')
        .split('\n')
        .map((l, i) => `${i + 1}. ${l}`)
        .join('\n'),
      block: true,
    }),
  },
  { label: 'Destaque', Icon: Quote, apply: (s) => ({ text: `> ${s || 'Atenção'}`, block: true }) },
  {
    label: 'Link',
    Icon: Link2,
    apply: (s) => ({ text: `[${s || 'texto do link'}](https://)` }),
  },
];

function Editor({
  article,
  go,
  onFiles,
}: {
  article?: Article;
  go: (to: string) => void;
  onFiles?: () => void;
}) {
  const cats = useLoad(() => api<WikiList>('/panel/wiki'), 'wiki-cats');
  const [title, setTitle] = useState(article?.title ?? '');
  const [body, setBody] = useState(article?.body ?? '');
  const [categoryId, setCategoryId] = useState(article?.categoryId ?? '');
  const [pinned, setPinned] = useState(article?.pinned ?? false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function insert(text: string, block = false) {
    const el = area.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const before = body.slice(0, start);
    const pad = block && before && !before.endsWith('\n') ? '\n' : '';
    const next = `${before}${pad}${text}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      const at = start + pad.length + text.length;
      el?.setSelectionRange(at, at);
    });
  }

  function tool(apply: (typeof TOOLS)[number]['apply']) {
    const el = area.current;
    const sel = el ? body.slice(el.selectionStart, el.selectionEnd) : '';
    const out = apply(sel);
    insert(out.text, out.block);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { title, body, categoryId: categoryId || null, pinned };
    try {
      const res = article
        ? await api<{ id: string }>(`/panel/wiki/articles/${article.id}`, {
            method: 'PUT',
            body: payload,
          })
        : await api<{ id: string }>('/panel/wiki/articles', { method: 'POST', body: payload });
      go(`/wiki/${res.id}`);
    } catch (e) {
      setError(errorText(e, 'Não foi possível salvar.'));
    } finally {
      setBusy(false);
    }
  }

  async function attach(file: File) {
    if (!article) return;
    setBusy(true);
    setError(null);
    try {
      const res = await uploadFile<{ id: string; name: string; image: boolean }>(
        `/panel/wiki/articles/${article.id}/attachments`,
        file,
      );
      if (res.image) insert(`![${res.name.replace(/[[\]]/g, '')}](anexo:${res.id})`, true);
      onFiles?.();
    } catch (e) {
      setError(errorText(e, 'Não foi possível anexar.'));
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(f: Attachment) {
    if (!window.confirm(`Remover o anexo ${f.name}?`)) return;
    try {
      await api(`/panel/wiki/attachments/${f.id}`, { method: 'DELETE' });
      onFiles?.();
    } catch (e) {
      setError(errorText(e, 'Não foi possível remover.'));
    }
  }

  return (
    <section className="card wiki-editor" aria-label={article ? 'Editar artigo' : 'Novo artigo'}>
      <div className="inbox__head">
        <button
          type="button"
          className="icon-button icon-button--plain"
          aria-label="Voltar sem salvar"
          onClick={() => go(article ? `/wiki/${article.id}` : '/wiki')}
        >
          <ArrowLeft aria-hidden="true" size={20} />
        </button>
        <h2 className="inbox__who">{article ? 'Editar artigo' : 'Novo artigo'}</h2>
      </div>
      <form className="form" onSubmit={save}>
        <label>
          Título
          <input
            value={title}
            maxLength={120}
            required
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="wiki-editor__row">
          <label>
            Categoria
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {cats.data?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            Fixar no topo da Wiki
          </label>
        </div>
        <div className="wiki-editor__tools" role="toolbar" aria-label="Formatação">
          {TOOLS.map((t) => (
            <button
              key={t.label}
              type="button"
              className="icon-button icon-button--plain"
              aria-label={t.label}
              disabled={preview}
              onClick={() => tool(t.apply)}
            >
              <t.Icon aria-hidden="true" size={18} />
            </button>
          ))}
          <button
            type="button"
            className={preview ? 'button button--small' : 'button button--ghost button--small'}
            aria-pressed={preview}
            onClick={() => setPreview((p) => !p)}
          >
            <Eye aria-hidden="true" size={16} /> Ver como fica
          </button>
        </div>
        {preview ? (
          <div className="wiki-editor__preview">
            {body.trim() ? (
              <DocView source={body} files={article?.attachments ?? []} />
            ) : (
              <p className="muted">Nada escrito ainda.</p>
            )}
          </div>
        ) : (
          <label>
            <span className="sr-only">Texto do artigo</span>
            <textarea
              ref={area}
              rows={14}
              maxLength={50000}
              value={body}
              placeholder="Escreva o passo a passo. Use a barra acima para títulos, listas e destaques."
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
        )}
        <section className="wiki-files" aria-label="Anexos">
          <h3>Anexos</h3>
          {article ? (
            <>
              {article.attachments.length > 0 && (
                <ul>
                  {article.attachments.map((f) => (
                    <li key={f.id}>
                      <span>
                        {f.image ? (
                          <ImagePlus aria-hidden="true" size={16} />
                        ) : (
                          <FileText aria-hidden="true" size={16} />
                        )}{' '}
                        {f.name}
                      </span>
                      <span className="muted small">{size(f.size)}</span>
                      {f.image && (
                        <button
                          type="button"
                          className="link"
                          onClick={() => insert(`![${f.name}](anexo:${f.id})`, true)}
                        >
                          Pôr no texto
                        </button>
                      )}
                      <button
                        type="button"
                        className="icon-button icon-button--plain"
                        aria-label={`Remover ${f.name}`}
                        onClick={() => void removeFile(f)}
                      >
                        <Trash2 aria-hidden="true" size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                ref={fileInput}
                type="file"
                className="sr-only"
                aria-label="Escolher arquivo"
                accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.docx,.xlsx,.pptx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void attach(f);
                }}
              />
              <button
                type="button"
                className="button button--ghost button--small"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip aria-hidden="true" size={16} /> Anexar arquivo
              </button>
              <p className="muted small">
                Imagem, PDF, texto ou Office, até 5 MB. Imagem anexada já entra no texto.
              </p>
            </>
          ) : (
            <p className="muted small">Salve o artigo primeiro; depois dá para anexar arquivos.</p>
          )}
        </section>
        {error && <Banner>{error}</Banner>}
        <button type="submit" className="button" disabled={busy || title.trim().length < 2}>
          Salvar artigo
        </button>
      </form>
    </section>
  );
}
