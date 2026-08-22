import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getAdminRouteMatch, getAdminRouteNavGroups } from '../../lib/adminRoutes';
import { useAdminAuthStore } from '../../stores/authStore';
import { Badge, Button } from '../ui';

export default function Header({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const { admin, logout } = useAdminAuthStore();
  const location = useLocation();
  const currentRoute = getAdminRouteMatch(location.pathname);
  const navGroups = useMemo(() => getAdminRouteNavGroups(), []);
  const parentRoute = useMemo(() => {
    if (!currentRoute?.navPath) return null;
    return [...navGroups.main, ...navGroups.settings].find((route) => route.path === currentRoute.navPath) || null;
  }, [currentRoute, navGroups.main, navGroups.settings]);
  const title = currentRoute?.label || 'Admin Control';
  const subtitle = currentRoute?.subtitle || 'Beneficial Knowledge';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/65 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="hidden h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white shadow-md sm:flex">
            <SparkIcon className="h-4 w-4" />
          </div>
          <div>
            {parentRoute && (
              <div className="mb-0.5 hidden items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400 sm:flex">
                <Link to={parentRoute.path} className="hover:text-slate-600">
                  {parentRoute.label}
                </Link>
                <span>/</span>
                <span className="text-slate-500">{currentRoute?.shortLabel || currentRoute?.label}</span>
              </div>
            )}
            <h1 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">{title}</h1>
            <p className="hidden text-xs text-slate-500 sm:block">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={onOpenCommandPalette}>
            <SearchIcon className="h-4 w-4" />
            <span className="hidden md:inline">Command</span>
            <span className="hidden rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 md:inline">Ctrl K</span>
          </Button>
          <Badge variant="info" className="hidden capitalize sm:inline-flex">
            {admin?.adminLevel || 'admin'}
          </Badge>
          {admin?.capabilities?.length ? (
            <Badge variant="neutral" className="hidden sm:inline-flex">
              {admin.capabilities.length} capabilities
            </Badge>
          ) : null}

          <div className="hidden items-center gap-3 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-1.5 shadow-sm sm:flex">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-700">{admin?.displayName || 'Admin'}</p>
              <p className="text-xs text-slate-500">ID: {admin?.telegramId || 'N/A'}</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-white">
              {admin?.displayName?.[0]?.toUpperCase() || 'A'}
            </div>
          </div>

          <Button variant="secondary" size="sm" onClick={logout}>
            <LogoutIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4m6-2l1.5 4.5L19 9l-4.5 1.5L13 15l-1.5-4.5L7 9l4.5-1.5L13 3zM6 17v4m-2-2h4" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
    </svg>
  );
}
