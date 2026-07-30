import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export type Toast = {
  id: string;
  kind: ToastKind;
  title?: string;
  message: string;
  createdAt: number;
  durationMs: number;
};

type AddToastInput = {
  id?: string;
  kind: ToastKind;
  title?: string;
  message: string;
  durationMs?: number;
};

interface ToastState {
  toasts: Toast[];
  addToast: (input: AddToastInput) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

let toastCounter = 0;

const defaultDurationMsFor = (kind: ToastKind): number => {
  if (kind === 'success') return 3500;
  if (kind === 'info') return 4500;
  if (kind === 'warning') return 6000;
  return 7000;
};

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (input) => {
    const id = input.id || `toast-${Date.now()}-${++toastCounter}`;
    const toast: Toast = {
      id,
      kind: input.kind,
      title: input.title,
      message: input.message,
      createdAt: Date.now(),
      durationMs: typeof input.durationMs === 'number' ? input.durationMs : defaultDurationMsFor(input.kind),
    };

    set((state) => {
      const next = [toast, ...state.toasts];
      return { toasts: next.slice(0, 6) };
    });

    return id;
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clearToasts: () => set({ toasts: [] }),
}));

export default useToastStore;

