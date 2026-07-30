import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

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

type ModalProps = {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
  closeOnBackdrop?: boolean;
  initialFocusRef?: RefObject<FocusableElement | null>;
  className?: string;
};

export function Modal({
  open,
  onClose,
  ariaLabel,
  children,
  closeOnBackdrop = false,
  initialFocusRef,
  className = '',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
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

    // Scroll lock with reference counting (handles nested modals)
    const lockKey = 'adminModalScrollLockCount';
    const overflowKey = 'adminModalScrollLockOverflow';
    const currentCount = Number(body.dataset[lockKey] || '0');
    if (currentCount === 0) {
      body.dataset[overflowKey] = body.style.overflow || '';
      body.style.overflow = 'hidden';
    }
    body.dataset[lockKey] = String(currentCount + 1);

    const focusTimer = window.setTimeout(() => {
      const focusTarget =
        initialFocusRef?.current ??
        getFocusableElements(dialogElement)[0] ??
        (dialogElement as FocusableElement);
      focusTarget?.focus?.({ preventScroll: true });
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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

      const count = Number(body.dataset[lockKey] || '0');
      const nextCount = Math.max(0, count - 1);
      if (nextCount === 0) {
        body.style.overflow = body.dataset[overflowKey] || '';
        delete body.dataset[overflowKey];
        delete body.dataset[lockKey];
      } else {
        body.dataset[lockKey] = String(nextCount);
      }

      if (previousActiveElement?.focus) {
        previousActiveElement.focus({ preventScroll: true });
      }
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (!closeOnBackdrop) return;
        if (event.target === event.currentTarget) {
          onCloseRef.current();
        }
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={['w-full flex justify-center', className].filter(Boolean).join(' ')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default Modal;
