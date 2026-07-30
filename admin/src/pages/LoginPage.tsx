import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuthStore } from '../stores/authStore';
import { telegram } from '../lib/telegram';
import { toastError } from '../lib/toast';

export default function LoginPage() {
  const navigate = useNavigate();
  const { authenticate, loginWithToken, isAuthenticated, isLoading, error, clearError, isTelegramMiniApp } = useAdminAuthStore();
  const localAdminTelegramId = String(import.meta.env.VITE_LOCAL_ADMIN_TELEGRAM_ID || '').trim();
  const localAdminToken = String(import.meta.env.VITE_LOCAL_ADMIN_TOKEN || '').trim();
  const [initData, setInitData] = useState('');
  const [adminToken, setAdminToken] = useState(localAdminToken);
  const [adminTelegramId, setAdminTelegramId] = useState(localAdminTelegramId);
  const [loginMode, setLoginMode] = useState<'telegram' | 'token'>(telegram.isAvailable ? 'telegram' : 'token');

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // If running as Telegram Mini App and there's an error, show the error state
  if (isTelegramMiniApp || telegram.isAvailable) {
    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-400 mx-auto"></div>
            <p className="mt-4 text-slate-300">Authenticating with Telegram...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Access Denied</h2>
            <p className="text-slate-600 mb-4">{error}</p>
            <p className="text-sm text-slate-500">
              You must be an authorized admin to access this panel.
              Contact a super admin to request access.
            </p>
            <button
              onClick={() => telegram.close()}
              className="mt-6 px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      );
    }

    // Should redirect to dashboard if authenticated
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-400 mx-auto"></div>
          <p className="mt-4 text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }

  const handleTelegramLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!initData.trim()) {
      return;
    }

    try {
      await authenticate(initData);
      navigate('/dashboard');
    } catch {
      // Error is handled by store
    }
  };

  const handleTokenLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    const telegramId = parseInt(adminTelegramId, 10);
    if (!telegramId || telegramId <= 0) {
      toastError('Valid Telegram ID is required.');
      return;
    }
    if (!adminToken.trim()) {
      toastError('Admin token is required.');
      return;
    }

    try {
      await loginWithToken(telegramId, adminToken.trim());
      navigate('/dashboard');
    } catch {
      // Error is handled by store
    }
  };

  return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-[min(92vw,30rem)] md:max-w-md w-full mx-auto">
        {/* Logo and title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">Beneficial Knowledge Admin</h1>
          <p className="mt-2 text-slate-400">Beneficial Knowledge Admin</p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-[clamp(16px,3.6vw,24px)] shadow-xl p-[clamp(20px,5vw,32px)]">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">Admin Login</h2>

          <div className="flex mb-6 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setLoginMode('telegram')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                loginMode === 'telegram'
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Telegram
            </button>
            <button
              onClick={() => setLoginMode('token')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                loginMode === 'token'
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Admin Token
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {loginMode === 'telegram' && (
            <form onSubmit={handleTelegramLogin} className="space-y-4">
              <div>
                <label htmlFor="initData" className="block text-sm font-medium text-slate-700 mb-1">
                  Telegram Init Data
                </label>
                <textarea
                  id="initData"
                  value={initData}
                  onChange={(e) => setInitData(e.target.value)}
                  placeholder="Paste your Telegram WebApp initData here..."
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Get initData from your Admin Mini App in Telegram
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading || !initData.trim()}
                className="w-full py-2.5 px-4 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Authenticating...
                  </span>
                ) : (
                  'Login with Telegram'
                )}
              </button>
            </form>
          )}

          {loginMode === 'token' && (
            <form onSubmit={handleTokenLogin} className="space-y-4">
              <div>
                <label htmlFor="adminTelegramId" className="block text-sm font-medium text-slate-700 mb-1">
                  Telegram ID
                </label>
                <input
                  type="number"
                  id="adminTelegramId"
                  value={adminTelegramId}
                  onChange={(e) => setAdminTelegramId(e.target.value)}
                  placeholder="Enter your Telegram ID"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                {localAdminTelegramId && (
                  <p className="mt-1 text-xs text-slate-500">
                    Configured local admin ID: {localAdminTelegramId}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="adminToken" className="block text-sm font-medium text-slate-700 mb-1">
                  Admin Token
                </label>
                <input
                  type="password"
                  id="adminToken"
                  value={adminToken}
                  onChange={(e) => setAdminToken(e.target.value)}
                  placeholder="Enter admin token"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Token is validated on the server. Set `ADMIN_LOGIN_TOKEN` in the server environment.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading || !adminTelegramId.trim() || !adminToken.trim()}
                className="w-full py-2.5 px-4 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Authenticating...
                  </span>
                ) : (
                  'Login with Token'
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-slate-400">
          Beneficial Knowledge Admin Panel v1.0
        </p>
      </div>
    </div>
  );
}
