import { NavLink, useLocation } from 'react-router-dom';
import Icon from './Icon';

const TABS = [
  { to: '/', label: 'Inicio', icon: 'home' },
  { to: '/biblioteca', label: 'Biblioteca', icon: 'library' },
  { to: '/almacenamiento', label: 'Descargas', icon: 'download' },
] as const;

/**
 * Barra de navegación fija.
 *
 * En el lector no aparece: ahí la pantalla es la página del manga y cualquier
 * cosa fija encima estorba.
 */
export default function BottomNav() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/read/')) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-800/95 pb-safe backdrop-blur">
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2 text-[11px] transition-colors active:scale-[0.95] ${
                  isActive ? 'text-accent' : 'text-ink-400 hover:text-ink-200'
                }`
              }
            >
              <Icon name={tab.icon} className="h-6 w-6" />
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
