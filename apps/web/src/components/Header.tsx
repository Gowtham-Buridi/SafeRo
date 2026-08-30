import { Bell, Search, Menu } from 'lucide-react';

interface HeaderProps {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-surface-800 bg-surface-900/50 px-6 backdrop-blur-sm">
      {/* Left: menu toggle + search */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="rounded-lg p-2 text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-200 lg:hidden"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
          <input
            type="text"
            placeholder="Search transactions, cases, entities…"
            className="h-9 w-72 rounded-lg border border-surface-700 bg-surface-800 pl-10 pr-4
              text-sm text-surface-200 placeholder-surface-500
              transition-all duration-200
              focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
          />
        </div>
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-3">
        <button
          className="relative rounded-lg p-2 text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-200"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
        </button>

        <div className="h-6 w-px bg-surface-700" />

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-surface-200">Analyst</p>
            <p className="text-xs text-surface-500">SafeRo Platform</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-cyan-500 text-sm font-semibold text-white">
            A
          </div>
        </div>
      </div>
    </header>
  );
}
