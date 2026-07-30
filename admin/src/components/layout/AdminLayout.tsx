import { Suspense, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import CommandPalette from './CommandPalette';

export default function AdminLayout() {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSearchShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (!isSearchShortcut) return;
      event.preventDefault();
      setIsCommandPaletteOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-24 h-72 w-72 rounded-full bg-primary-300/20 blur-3xl" />
        <div className="absolute top-20 right-0 h-80 w-80 rounded-full bg-accent-300/20 blur-3xl" />
      </div>

      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="lg:pl-64">
        {/* Header */}
        <Header onOpenCommandPalette={() => setIsCommandPaletteOpen(true)} />

        {/* Page content */}
        <main className="p-4 sm:p-6">
          <div className="mx-auto w-full max-w-7xl">
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      <CommandPalette open={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} />
    </div>
  );
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="glass-card px-8 py-6 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary-600/25 border-t-primary-600" />
        <p className="mt-3 text-sm text-slate-600">Loading...</p>
      </div>
    </div>
  );
}
