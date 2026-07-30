// Telegram Mini App SDK wrapper for Admin Panel
import { alertAction, confirmAction } from './confirm';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    auth_date?: number;
    hash?: string;
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
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

class TelegramSDK {
  private get webApp(): TelegramWebApp | null {
    return window.Telegram?.WebApp || null;
  }

  get isAvailable(): boolean {
    return !!this.webApp && !!this.webApp.initData;
  }

  get user(): TelegramUser | null {
    return this.webApp?.initDataUnsafe?.user || null;
  }

  get initData(): string {
    return this.webApp?.initData || '';
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

  // Alerts
  showAlert(message: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.webApp) {
        void alertAction({ message }).then(resolve);
        return;
      }
      this.webApp.showAlert(message, resolve);
    });
  }

  showConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.webApp) {
        void confirmAction({ message, title: 'Confirm action' }).then(resolve);
        return;
      }
      this.webApp.showConfirm(message, resolve);
    });
  }
}

export const telegram = new TelegramSDK();
export default telegram;
