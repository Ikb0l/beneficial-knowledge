export interface BrowserNotificationOptions {
  body?: string;
  tag?: string;
  data?: unknown;
  silent?: boolean;
  onlyWhenHidden?: boolean;
}

export function canUseBrowserNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!canUseBrowserNotifications()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

export function notifyIfAllowed(title: string, options: BrowserNotificationOptions = {}): void {
  if (!canUseBrowserNotifications()) return;
  if (Notification.permission !== 'granted') return;
  if (options.onlyWhenHidden && typeof document !== 'undefined' && !document.hidden) return;

  new Notification(title, {
    body: options.body,
    tag: options.tag,
    data: options.data,
    silent: options.silent,
  });
}
