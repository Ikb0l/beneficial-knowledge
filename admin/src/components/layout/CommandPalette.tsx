import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Modal from '../Modal';
import { ADMIN_ROUTES } from '../../lib/adminRoutes';
import { hasCapability } from '../../lib/permissions';
import { useAdminAuthStore } from '../../stores/authStore';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface CommandAction {
  id: string;
  title: string;
  subtitle: string;
  keywords: string[];
  run: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { admin, logout } = useAdminAuthStore();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const closePalette = useCallback(() => {
    setQuery('');
    setSelectedIndex(0);
    onClose();
  }, [onClose]);

  const actions = useMemo<CommandAction[]>(() => {
    const routeActions = ADMIN_ROUTES
      .filter((route) => !route.path.includes(':'))
      .filter((route) => !route.requiredCapabilities || route.requiredCapabilities.every((capability) => hasCapability(admin?.capabilities || [], capability)))
      .map((route) => ({
        id: `route:${route.path}`,
        title: route.label,
        subtitle: route.subtitle,
        keywords: route.keywords,
        run: () => {
          navigate(route.path);
          closePalette();
        },
      }));

    return [
      ...routeActions,
      {
        id: 'action:refresh',
        title: 'Refresh Current Page',
        subtitle: location.pathname,
        keywords: ['reload', 'refresh'],
        run: () => {
          window.location.reload();
        },
      },
      {
        id: 'action:logout',
        title: 'Logout',
        subtitle: 'End the current admin session',
        keywords: ['sign out', 'session'],
        run: () => {
          logout();
          closePalette();
        },
      },
    ];
  }, [admin?.capabilities, closePalette, location.pathname, logout, navigate]);

  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return actions;
    return actions.filter((action) => {
      const haystack = [action.title, action.subtitle, ...action.keywords].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [actions, query]);
  const highlightedIndex = filteredActions.length === 0
    ? 0
    : Math.min(selectedIndex, filteredActions.length - 1);

  const runAction = (action: CommandAction) => {
    action.run();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePalette();
      return;
    }

    if (filteredActions.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((current) => (current + 1) % filteredActions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((current) => (current - 1 + filteredActions.length) % filteredActions.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      runAction(filteredActions[highlightedIndex] || filteredActions[0]);
    }
  };

  return (
    <Modal open={open} onClose={closePalette} ariaLabel="Command palette" initialFocusRef={inputRef} closeOnBackdrop>
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
              <SearchIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search pages and admin actions..."
                className="w-full border-0 bg-transparent text-base font-medium text-slate-900 outline-none placeholder:text-slate-400"
              />
              <p className="mt-1 text-xs text-slate-500">Use `Ctrl/Cmd + K` to open this palette.</p>
            </div>
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto px-3 py-3">
          {filteredActions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              No command matches your search.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => runAction(action)}
                  onMouseEnter={() => setSelectedIndex(filteredActions.findIndex((entry) => entry.id === action.id))}
                  className={`flex w-full items-start justify-between rounded-2xl px-4 py-3 text-left transition ${
                    filteredActions[highlightedIndex]?.id === action.id
                      ? 'bg-slate-100'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{action.subtitle}</p>
                  </div>
                  <span className="mt-0.5 rounded-full bg-slate-100 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                    Run
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
    </svg>
  );
}
