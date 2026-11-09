import { ChevronsLeft, CreditCard, Headset, LogOut, Settings, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

/**
 * Menu lateral do painel no computador (a partir de 1024 px). No celular, quem navega é a barra
 * de baixo. Inspirado no "dashboard with collapsible sidebar" do 21st.dev, refeito no CSS do
 * projeto, sem Tailwind. Recolhido, mostra só os ícones; o nome continua lido pelo leitor de tela.
 */

export interface SidebarItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  /** Grupo do menu (Atendimento, Gestão). Sem grupo, fica no topo. */
  group?: string;
  /** Uma linha sobre a seção, mostrada ao passar o mouse. */
  hint?: string;
}

const KEY = 'nexo-menu-recolhido';

/** Fica só neste aparelho, como o tema: é preferência visual. */
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function saveCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    // sem armazenamento: vale só até fechar a página
  }
}

const ACCOUNT: SidebarItem[] = [
  {
    to: '/conta',
    label: 'Configurações',
    Icon: Settings,
    hint: 'Perfil, segurança, equipe e mensagens do robô',
  },
  { to: '/assinatura', label: 'Plano e assinatura', Icon: CreditCard, hint: 'Seu plano atual' },
  { to: '/suporte', label: 'Suporte', Icon: Headset, hint: 'Abrir um chamado para a nexo' },
];

export function Sidebar({
  businessName,
  logo,
  items,
  section,
  onLogout,
}: {
  businessName: string;
  /** Logo do negócio (Premium), no lugar da inicial. */
  logo?: string | null;
  items: SidebarItem[];
  section: string;
  onLogout: () => void;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  function toggle() {
    setCollapsed((value) => {
      saveCollapsed(!value);
      return !value;
    });
  }

  const groups = [...new Set(items.flatMap((i) => (i.group ? [i.group] : [])))];

  const link = ({ to, label, Icon, hint }: SidebarItem) => {
    const on = section === to;
    return (
      <li key={to}>
        <a
          href={`#${to}`}
          className={on ? 'sidebar__link on' : 'sidebar__link'}
          aria-current={on ? 'page' : undefined}
          title={collapsed ? (hint ? `${label}: ${hint}` : label) : hint}
        >
          <Icon aria-hidden="true" size={20} strokeWidth={on ? 2.4 : 2} />
          <span className="sidebar__label">{label}</span>
        </a>
      </li>
    );
  };

  return (
    <aside className={collapsed ? 'sidebar sidebar--collapsed' : 'sidebar'} aria-label="Menu">
      <div className="sidebar__business">
        {logo ? (
          <img className="sidebar__logo" src={logo} alt="" />
        ) : (
          <span className="sidebar__initial" aria-hidden="true">
            {businessName.trim().charAt(0).toUpperCase() || 'n'}
          </span>
        )}
        <span className="sidebar__label">
          <span className="sidebar__eyebrow">Seu painel</span>
          <strong>{businessName}</strong>
        </span>
      </div>

      <nav aria-label="Seções do painel" className="sidebar__nav">
        <ul className="sidebar__list">{items.filter((i) => !i.group).map(link)}</ul>
        {groups.map((g) => (
          <div key={g} className="sidebar__group">
            <p className="sidebar__heading sidebar__label">{g}</p>
            <ul className="sidebar__list">{items.filter((i) => i.group === g).map(link)}</ul>
          </div>
        ))}
        <div className="sidebar__group">
          <p className="sidebar__heading sidebar__label">Conta</p>
          <ul className="sidebar__list">{ACCOUNT.map(link)}</ul>
        </div>
      </nav>

      <div className="sidebar__footer">
        <button
          type="button"
          className="sidebar__link"
          onClick={onLogout}
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut aria-hidden="true" size={20} />
          <span className="sidebar__label">Sair</span>
        </button>
        <button
          type="button"
          className="sidebar__link sidebar__toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Abrir o menu' : 'Recolher o menu'}
          onClick={toggle}
        >
          <ChevronsLeft aria-hidden="true" size={20} className="sidebar__chevron" />
          <span className="sidebar__label" aria-hidden="true">
            Recolher
          </span>
        </button>
      </div>
    </aside>
  );
}
