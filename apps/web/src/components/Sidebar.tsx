import {
  ChevronsLeft,
  CreditCard,
  LogOut,
  Settings,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
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
  { to: '/conta', label: 'Conta', Icon: UserRound },
  { to: '/configurar', label: 'Configurar o negócio', Icon: Settings },
  { to: '/assinatura', label: 'Plano e assinatura', Icon: CreditCard },
];

export function Sidebar({
  businessName,
  items,
  section,
  onLogout,
}: {
  businessName: string;
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

  const link = ({ to, label, Icon }: SidebarItem) => {
    const on = section === to;
    return (
      <li key={to}>
        <a
          href={`#${to}`}
          className={on ? 'sidebar__link on' : 'sidebar__link'}
          aria-current={on ? 'page' : undefined}
          title={collapsed ? label : undefined}
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
        <span className="sidebar__initial" aria-hidden="true">
          {businessName.trim().charAt(0).toUpperCase() || 'n'}
        </span>
        <span className="sidebar__label">
          <span className="sidebar__eyebrow">Seu painel</span>
          <strong>{businessName}</strong>
        </span>
      </div>

      <nav aria-label="Seções do painel">
        <ul className="sidebar__list">{items.map(link)}</ul>
      </nav>

      <div className="sidebar__group">
        <p className="sidebar__heading sidebar__label">Conta</p>
        <ul className="sidebar__list">{ACCOUNT.map(link)}</ul>
        <button
          type="button"
          className="sidebar__link"
          onClick={onLogout}
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut aria-hidden="true" size={20} />
          <span className="sidebar__label">Sair</span>
        </button>
      </div>

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
    </aside>
  );
}
