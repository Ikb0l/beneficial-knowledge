// Telegram Mini App SDK wrapper
// This provides a unified interface for Telegram WebApp functionality
import { showAlertDialog, showConfirmDialog } from '../../lib/dialogs';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

// Invoice status from Telegram
export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending';

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    auth_date?: number;
    hash?: string;
    start_param?: string;
  };
  colorScheme: 'light' | 'dark';
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  viewportHeight: number;
  viewportStableHeight: number;
  isExpanded: boolean;
  ready: () => void;
  expand: () => void;
  close: () => void;
  // Payment methods
  openInvoice: (url: string, callback?: (status: InvoiceStatus) => void) => void;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setText: (text: string) => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
  };
  BackButton: {
    isVisible: boolean;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
  };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  CloudStorage: {
    setItem: (key: string, value: string, callback?: (error: Error | null, success?: boolean) => void) => void;
    getItem: (key: string, callback: (error: Error | null, value?: string) => void) => void;
    getItems: (keys: string[], callback: (error: Error | null, values?: Record<string, string>) => void) => void;
    removeItem: (key: string, callback?: (error: Error | null, success?: boolean) => void) => void;
    removeItems: (keys: string[], callback?: (error: Error | null, success?: boolean) => void) => void;
    getKeys: (callback: (error: Error | null, keys?: string[]) => void) => void;
  };
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
  showPopup: (params: {
    title?: string;
    message: string;
    buttons?: Array<{ id?: string; type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive'; text?: string }>;
  }, callback?: (buttonId: string) => void) => void;
}

type TelegramLoginData = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

interface TelegramLoginWidget {
  auth: (
    params: { bot_id: number; request_access: boolean },
    callback: (data: TelegramLoginData | null) => void
  ) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
      Login?: TelegramLoginWidget;
    };
  }
}

class TelegramSDK {
  private readonly startParamQueryKeys = ['tgWebAppStartParam', 'startapp', 'start_param', 'startParam'];

  private get webApp(): TelegramWebApp | null {
    return window.Telegram?.WebApp || null;
  }

  get isAvailable(): boolean {
    return !!this.webApp;
  }

  get user(): TelegramUser | null {
    return this.webApp?.initDataUnsafe?.user || null;
  }

  get initData(): string {
    return this.webApp?.initData || '';
  }

  private getStartParamFromUrl(): string {
    if (typeof window === 'undefined') {
      return '';
    }
    const params = new URLSearchParams(window.location.search);
    for (const key of this.startParamQueryKeys) {
      const value = params.get(key);
      if (value && value.trim().length > 0) {
        return value.trim();
      }
    }
    return '';
  }

  get startParam(): string {
    const fromInitData = this.webApp?.initDataUnsafe?.start_param;
    const raw = (typeof fromInitData === 'string' && fromInitData.trim().length > 0)
      ? fromInitData.trim()
      : this.getStartParamFromUrl();
    if (!raw) {
      return '';
    }
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  clearStartParamFromUrl(): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of this.startParamQueryKeys) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) {
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    }
  }

  get colorScheme(): 'light' | 'dark' {
    return this.webApp?.colorScheme || 'light';
  }

  get themeParams() {
    return this.webApp?.themeParams || {};
  }

  get viewportHeight(): number {
    return this.webApp?.viewportHeight || window.innerHeight;
  }

  get viewportStableHeight(): number {
    return this.webApp?.viewportStableHeight || window.innerHeight;
  }

  ready(): void {
    this.webApp?.ready();
  }

  expand(): void {
    this.webApp?.expand();
  }

  close(): void {
    this.webApp?.close();
  }

  // Haptic feedback
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void {
    this.webApp?.HapticFeedback?.impactOccurred(style);
  }

  notificationOccurred(type: 'error' | 'success' | 'warning'): void {
    this.webApp?.HapticFeedback?.notificationOccurred(type);
  }

  selectionChanged(): void {
    this.webApp?.HapticFeedback?.selectionChanged();
  }

  // Main button
  showMainButton(text: string, onClick: () => void): void {
    if (!this.webApp) return;
    this.webApp.MainButton.setText(text);
    this.webApp.MainButton.onClick(onClick);
    this.webApp.MainButton.show();
  }

  hideMainButton(): void {
    this.webApp?.MainButton.hide();
  }

  setMainButtonLoading(loading: boolean): void {
    if (!this.webApp) return;
    if (loading) {
      this.webApp.MainButton.showProgress();
    } else {
      this.webApp.MainButton.hideProgress();
    }
  }

  // Back button
  showBackButton(onClick: () => void): void {
    if (!this.webApp) return;
    this.webApp.BackButton.onClick(onClick);
    this.webApp.BackButton.show();
  }

  hideBackButton(): void {
    this.webApp?.BackButton.hide();
  }

  // Popups
  showAlert(message: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.webApp) {
        void showAlertDialog(message).then(resolve);
        return;
      }
      this.webApp.showAlert(message, resolve);
    });
  }

  showConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.webApp) {
        void showConfirmDialog(message).then(resolve);
        return;
      }
      this.webApp.showConfirm(message, resolve);
    });
  }

  // Cloud storage
  async getStorageItem(key: string): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.webApp?.CloudStorage) {
        const value = localStorage.getItem(key);
        resolve(value);
        return;
      }
      this.webApp.CloudStorage.getItem(key, (error, value) => {
        resolve(error ? null : value || null);
      });
    });
  }

  async setStorageItem(key: string, value: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.webApp?.CloudStorage) {
        try {
          localStorage.setItem(key, value);
          resolve(true);
        } catch {
          resolve(false);
        }
        return;
      }
      this.webApp.CloudStorage.setItem(key, value, (error) => {
        resolve(!error);
      });
    });
  }

  async removeStorageItem(key: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.webApp?.CloudStorage) {
        try {
          localStorage.removeItem(key);
          resolve(true);
        } catch {
          resolve(false);
        }
        return;
      }
      this.webApp.CloudStorage.removeItem(key, (error) => {
        resolve(!error);
      });
    });
  }

  // Payment methods - Telegram Stars
  /**
   * Open a Telegram Stars invoice for payment
   * @param invoiceUrl - The invoice URL returned from the server (from createInvoiceLink)
   * @returns Promise that resolves with the payment status
   */
  openInvoice(invoiceUrl: string): Promise<InvoiceStatus> {
    return new Promise((resolve, reject) => {
      if (!this.webApp?.openInvoice) {
        reject(new Error('Telegram payment not available. Please open this app from Telegram.'));
        return;
      }

      this.webApp.openInvoice(invoiceUrl, (status) => {
        resolve(status);
      });
    });
  }

  /**
   * Check if Telegram payments are available
   */
  get isPaymentAvailable(): boolean {
    return !!this.webApp?.openInvoice;
  }
}

export const telegram = new TelegramSDK();
export default telegram;
