import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

type FocusableElement = HTMLElement & { focus: (options?: { preventScroll?: boolean }) => void };

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const isVisible = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
};

const getFocusableElements = (container: HTMLElement): FocusableElement[] => {
  const elements = Array.from(container.querySelectorAll<FocusableElement>(FOCUSABLE_SELECTOR));
  return elements.filter((element) => isVisible(element) && element.getAttribute('aria-hidden') !== 'true');
};

type UseDialogOptions = {
  open: boolean;
  onClose: () => void;
  dialogRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<FocusableElement | null>;
  closeOnEscape?: boolean;
  lockScroll?: boolean;
  restoreFocus?: boolean;
};

/**
 * Lightweight, dependency-free dialog accessibility:
 * - Focus trap (Tab / Shift+Tab)
 * - Escape-to-close
 * - Body scroll lock
 * - Restores focus to previously focused element
 */
export function useDialog({
  open,
  onClose,
  dialogRef,
  initialFocusRef,
  closeOnEscape = true,
  lockScroll = true,
  restoreFocus = true,
}: UseDialogOptions) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    if (typeof document === 'undefined') return;

    const dialogElement = dialogRef.current;
    if (!dialogElement) return;

    const previousActiveElement = document.activeElement as FocusableElement | null;
    const body = document.body;

    let didLockScroll = false;
    if (lockScroll) {
      const currentCount = Number(body.dataset.dialogScrollLockCount || '0');
      if (currentCount === 0) {
        body.dataset.dialogScrollLockOverflow = body.style.overflow || '';
        body.style.overflow = 'hidden';
      }
      body.dataset.dialogScrollLockCount = String(currentCount + 1);
      didLockScroll = true;
    }

    const focusTimer = window.setTimeout(() => {
      const focusTarget = initialFocusRef?.current ?? (dialogRef.current as FocusableElement | null);
      focusTarget?.focus?.({ preventScroll: true });
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const container = dialogRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as FocusableElement | null;

      if (event.shiftKey) {
        if (active === first || !active || !container.contains(active)) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
        return;
      }

      if (active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);

      if (didLockScroll) {
        const currentCount = Number(body.dataset.dialogScrollLockCount || '0');
        const nextCount = Math.max(0, currentCount - 1);
        if (nextCount === 0) {
          body.style.overflow = body.dataset.dialogScrollLockOverflow || '';
          delete body.dataset.dialogScrollLockOverflow;
          delete body.dataset.dialogScrollLockCount;
        } else {
          body.dataset.dialogScrollLockCount = String(nextCount);
        }
      }

      if (restoreFocus && previousActiveElement?.focus) {
        previousActiveElement.focus({ preventScroll: true });
      }
    };
  }, [open, dialogRef, initialFocusRef, closeOnEscape, lockScroll, restoreFocus]);
}

export default useDialog;
