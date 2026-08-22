import { useToastStore, type ToastKind } from '../stores/toastStore';

const toast = (kind: ToastKind, message: string, title?: string, durationMs?: number) => {
  useToastStore.getState().addToast({ kind, title, message, durationMs });
};

export const toastSuccess = (message: string, title?: string) => toast('success', message, title);
export const toastError = (message: string, title?: string) => toast('error', message, title);
export const toastInfo = (message: string, title?: string) => toast('info', message, title);
export const toastWarning = (message: string, title?: string) => toast('warning', message, title);

