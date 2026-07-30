// Login page for web users (browser access with referral code)
import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { nakama } from '../shared/lib/nakama';
import type { TelegramLoginPayload } from '../shared/lib/nakama';

type AuthMode = 'login' | 'register';

export function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referralError, setReferralError] = useState('');
  const [referralValid, setReferralValid] = useState(false);
  const [validatingCode, setValidatingCode] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramError, setTelegramError] = useState('');

  const { isLoading, error, clearError, webLogin, webRegister, telegramWebLogin } = useAuthStore();

  const telegramBotId = Number(import.meta.env.VITE_TELEGRAM_BOT_ID || 0);
  const telegramBotUsername = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
  const telegramBotUrl = telegramBotUsername ? `https://t.me/${telegramBotUsername}` : '';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!nickname.trim() || !password) {
      return;
    }

    try {
      await webLogin(nickname.trim(), password);
    } catch {
      // Error is handled in the store
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setReferralError('');

    const trimmedNickname = nickname.trim();
    if (!trimmedNickname || !password || !confirmPassword || !referralCode.trim()) {
      return;
    }

    if (trimmedNickname.length < 3 || trimmedNickname.length > 20) {
      setReferralError('Nickname must be between 3 and 20 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedNickname)) {
      setReferralError('Nickname can only contain letters, numbers, and underscores');
      return;
    }

    if (password !== confirmPassword) {
      setReferralError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setReferralError('Password must be at least 6 characters');
      return;
    }

    if (!referralValid) {
      setReferralError('Please enter a valid referral code');
      return;
    }

    try {
      await webRegister(trimmedNickname, password, referralCode.trim().toUpperCase());
    } catch {
      // Error is handled in the store
    }
  };

  const validateReferralCode = async () => {
    if (!referralCode.trim()) {
      setReferralError('Referral code is required');
      setReferralValid(false);
      return;
    }

    setValidatingCode(true);
    setReferralError('');

    try {
      const result = await nakama.validateReferralCode(referralCode.trim().toUpperCase());
      if (result.valid) {
        setReferralValid(true);
        setReferralError('');
      } else {
        setReferralValid(false);
        setReferralError(result.error || 'Invalid referral code');
      }
    } catch (error) {
      setReferralValid(false);
      setReferralError(error instanceof Error ? error.message : 'Failed to validate referral code');
    } finally {
      setValidatingCode(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    clearError();
    setReferralError('');
    setReferralValid(false);
    setPassword('');
    setConfirmPassword('');
  };

  const loadTelegramLoginScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.Telegram?.Login?.auth) {
        resolve();
        return;
      }

      const existing = document.querySelector('script[data-telegram-login]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load Telegram login')));
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.async = true;
      script.defer = true;
      script.setAttribute('data-telegram-login', 'true');
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Telegram login'));
      document.body.appendChild(script);
    });
  };

  const handleTelegramLogin = async () => {
    clearError();
    setTelegramError('');

    if (!telegramBotId) {
      setTelegramError('Telegram login is not configured.');
      return;
    }

    setTelegramLoading(true);
    try {
      await loadTelegramLoginScript();

      if (!window.Telegram?.Login?.auth) {
        throw new Error('Telegram login is unavailable.');
      }

      window.Telegram.Login.auth({ bot_id: telegramBotId, request_access: true }, async (data) => {
        if (!data) {
          setTelegramLoading(false);
          setTelegramError('Telegram login was cancelled.');
          return;
        }

        try {
          await telegramWebLogin(data as TelegramLoginPayload);
        } catch {
          // Error handled in the store
        } finally {
          setTelegramLoading(false);
        }
      });
    } catch (err) {
      setTelegramLoading(false);
      setTelegramError(err instanceof Error ? err.message : 'Telegram login failed.');
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>Beneficial Knowledge</h1>
          <p>Test your knowledge and compete with others!</p>
        </div>

        <div className="login-tabs">
          <button
            className={`tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
          >
            Login
          </button>
          <button
            className={`tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
          >
            Register
          </button>
        </div>

        {(error || telegramError) && (
          <div className="error-message">{error || telegramError}</div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="nickname">Nickname</label>
              <input
                type="text"
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Enter your nickname"
                disabled={isLoading}
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>

            <button type="submit" className="submit-button" disabled={isLoading}>
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="login-form">
            <div className="form-group">
              <label htmlFor="reg-nickname">Nickname</label>
              <input
                type="text"
                id="reg-nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Choose a nickname (3-20 chars)"
                disabled={isLoading}
                autoComplete="username"
                minLength={3}
                maxLength={20}
                pattern="[A-Za-z0-9_]+"
              />
              <span className="hint">Letters, numbers, and underscores only</span>
            </div>

            <div className="form-group">
              <label htmlFor="reg-password">Password</label>
              <input
                type="password"
                id="reg-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose a password (min 6 chars)"
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirm-password">Confirm Password</label>
              <input
                type="password"
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="referral-code">Referral Code</label>
              <div className="referral-input-group">
                <input
                  type="text"
                  id="referral-code"
                  value={referralCode}
                  onChange={(e) => {
                    setReferralCode(e.target.value.toUpperCase());
                    setReferralValid(false);
                    setReferralError('');
                  }}
                  placeholder="Enter referral code"
                  disabled={isLoading}
                  className={referralValid ? 'valid' : referralError ? 'invalid' : ''}
                />
                <button
                  type="button"
                  onClick={validateReferralCode}
                  disabled={isLoading || validatingCode || !referralCode.trim()}
                  className="validate-button"
                >
                  {validatingCode ? '...' : 'Check'}
                </button>
              </div>
              {referralError && <span className="error-hint">{referralError}</span>}
              {referralValid && <span className="success-hint">Valid referral code!</span>}
              <span className="hint">You need a referral code from an existing user to register</span>
            </div>

            <button type="submit" className="submit-button" disabled={isLoading || !referralValid}>
              {isLoading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}

        <div className="telegram-option">
          <p>Use your Telegram account</p>
          <button
            type="button"
            className="telegram-connect-button"
            onClick={handleTelegramLogin}
            disabled={isLoading || telegramLoading}
          >
            {telegramLoading ? 'Connecting...' : 'Connect with Telegram'}
          </button>
          {telegramBotUrl ? (
            <a
              href={telegramBotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="telegram-link"
            >
              Open in Telegram Mini App
            </a>
          ) : (
            <span className="telegram-link">Bot username is not configured</span>
          )}
        </div>
      </div>

      <style>{`
        .login-page {
          min-height: var(--tg-viewport-height);
          height: var(--tg-viewport-height);
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #111b33 0%, #16213e 50%, #0f3460 100%);
          overflow-y: auto;
          padding: max(20px, var(--safe-top)) 20px max(20px, var(--safe-bottom));
          font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .login-container {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border-radius: 16px;
          padding: 32px;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .login-header {
          text-align: center;
          margin-bottom: 24px;
        }

        .login-header h1 {
          color: #fff;
          font-size: 28px;
          margin: 0 0 8px;
        }

        .login-header p {
          color: rgba(255, 255, 255, 0.7);
          margin: 0;
          font-size: 14px;
        }

        .login-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
        }

        .tab {
          flex: 1;
          padding: 12px;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.7);
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .tab:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .tab.active {
          background: #e94560;
          color: #fff;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          color: rgba(255, 255, 255, 0.9);
          font-size: 13px;
          font-weight: 500;
        }

        .form-group input {
          padding: 12px 16px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          font-size: 15px;
          transition: all 0.2s;
        }

        .form-group input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .form-group input:focus {
          outline: none;
          border-color: #e94560;
          background: rgba(255, 255, 255, 0.12);
        }

        .form-group input.valid {
          border-color: #4ade80;
        }

        .form-group input.invalid {
          border-color: #ef4444;
        }

        .form-group input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .hint {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
        }

        .error-hint {
          font-size: 12px;
          color: #ef4444;
        }

        .success-hint {
          font-size: 12px;
          color: #4ade80;
        }

        .referral-input-group {
          display: flex;
          gap: 8px;
        }

        .referral-input-group input {
          flex: 1;
        }

        .validate-button {
          padding: 12px 16px;
          border: none;
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .validate-button:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.25);
        }

        .validate-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .submit-button {
          padding: 14px;
          border: none;
          background: #e94560;
          color: #fff;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
          transition: all 0.2s;
          margin-top: 8px;
        }

        .submit-button:hover:not(:disabled) {
          background: #d63850;
        }

        .submit-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .error-message {
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          margin-bottom: 16px;
          text-align: center;
        }

        .telegram-option {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          text-align: center;
        }

        .telegram-option p {
          color: rgba(255, 255, 255, 0.6);
          margin: 0 0 8px;
          font-size: 13px;
        }

        .telegram-connect-button {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(0, 136, 204, 0.2);
          color: #fff;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 10px;
        }

        .telegram-connect-button:hover:not(:disabled) {
          background: rgba(0, 136, 204, 0.35);
          border-color: rgba(0, 136, 204, 0.6);
        }

        .telegram-connect-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .telegram-link {
          color: #0088cc;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
        }

        .telegram-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}

export default LoginPage;
