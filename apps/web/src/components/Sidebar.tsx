import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowRightLeft,
  ShieldAlert,
  Network,
  BarChart3,
  Search,
  Settings,
  ChevronLeft,
  Shield,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: ArrowRightLeft, label: 'Transactions' },
  { to: '/risk-cases', icon: ShieldAlert, label: 'Risk Cases' },
  { to: '/abuse-rings', icon: Network, label: 'Abuse Rings' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/investigation', icon: Search, label: 'AI Investigation' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  return (
    <aside
      className={`
        relative flex flex-col border-r border-surface-800 bg-surface-900
        transition-all duration-300 ease-in-out
        ${isOpen ? 'w-64' : 'w-20'}
      `}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-surface-800 px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700">
          <Shield className="h-5 w-5 text-white" />
        </div>
        {isOpen && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold tracking-tight text-white">
              Safe<span className="text-accent-400">Ro</span>
            </h1>
            <p className="text-[10px] font-medium uppercase tracking-widest text-surface-400">
              Risk Intelligence
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium
              transition-all duration-200
              ${isActive
                ? 'bg-accent-500/10 text-accent-400 shadow-sm shadow-accent-500/5'
                : 'text-surface-300 hover:bg-surface-800 hover:text-surface-100'
              }
              ${!isOpen ? 'justify-center' : ''}
              `
            }
            title={!isOpen ? label : undefined}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {isOpen && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="flex h-12 items-center justify-center border-t border-surface-800
          text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-200"
        aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <ChevronLeft
          className={`h-5 w-5 transition-transform duration-300 ${!isOpen ? 'rotate-180' : ''}`}
        />
      </button>
    </aside>
  );
}
