type DialogCleanup = () => void;

type DialogShell = {
  overlay: HTMLDivElement;
  dialog: HTMLDivElement;
  content: HTMLDivElement;
  cleanup: DialogCleanup;
};

const OVERLAY_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  inset: '0',
  zIndex: '9999',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  background: 'rgba(0, 0, 0, 0.6)',
};

const DIALOG_STYLE: Partial<CSSStyleDeclaration> = {
  width: '100%',
  maxWidth: '360px',
  borderRadius: '14px',
  background: '#111827',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  boxShadow: '0 18px 48px rgba(0, 0, 0, 0.45)',
  color: '#f9fafb',
  fontFamily: "'Plus Jakarta Sans', Inter, system-ui, -apple-system, sans-serif",
};

const TITLE_STYLE: Partial<CSSStyleDeclaration> = {
  margin: '0',
  fontSize: '18px',
  fontWeight: '600',
};

const MESSAGE_STYLE: Partial<CSSStyleDeclaration> = {
  margin: '10px 0 0',
  fontSize: '14px',
  lineHeight: '1.45',
  color: '#d1d5db',
  whiteSpace: 'pre-line',
};

const ACTIONS_STYLE: Partial<CSSStyleDeclaration> = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px',
  marginTop: '20px',
};

function applyStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  Object.assign(element.style, styles);
}

function createDialogShell(title: string, message: string): DialogShell | null {
  if (typeof document === 'undefined') return null;

  const overlay = document.createElement('div');
  const dialog = document.createElement('div');
  const content = document.createElement('div');
  const headingId = `dialog-title-${Math.random().toString(36).slice(2)}`;

  applyStyles(overlay, OVERLAY_STYLE);
  applyStyles(dialog, DIALOG_STYLE);
  applyStyles(content, { padding: '18px 18px 16px' });

  overlay.setAttribute('role', 'presentation');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', headingId);
  dialog.tabIndex = -1;

  const heading = document.createElement('h3');
  heading.id = headingId;
  heading.textContent = title;
  applyStyles(heading, TITLE_STYLE);

  const messageNode = document.createElement('p');
  messageNode.textContent = message;
  applyStyles(messageNode, MESSAGE_STYLE);

  content.append(heading, messageNode);
  dialog.appendChild(content);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  dialog.focus({ preventScroll: true });

  const cleanup = () => {
    overlay.remove();
    document.body.style.overflow = previousOverflow;
  };

  return { overlay, dialog, content, cleanup };
}

function createButton(label: string, variant: 'ghost' | 'primary' | 'danger'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  applyStyles(button, {
    minWidth: '92px',
    padding: '9px 14px',
    borderRadius: '10px',
    border: variant === 'ghost' ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid transparent',
    background:
      variant === 'primary'
        ? '#06b6d4'
        : variant === 'danger'
          ? '#dc2626'
          : 'rgba(255, 255, 255, 0.06)',
    color: '#f9fafb',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  });
  return button;
}

export function showAlertDialog(message: string, title = 'Notice'): Promise<void> {
  const shell = createDialogShell(title, message);
  if (!shell) return Promise.resolve();

  return new Promise((resolve) => {
    const actions = document.createElement('div');
    applyStyles(actions, ACTIONS_STYLE);

    const confirmButton = createButton('OK', 'primary');
    actions.appendChild(confirmButton);
    shell.content.appendChild(actions);
    confirmButton.focus({ preventScroll: true });

    const finalize = () => {
      document.removeEventListener('keydown', handleKeyDown);
      shell.cleanup();
      resolve();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault();
        finalize();
      }
    };

    shell.overlay.addEventListener('click', (event) => {
      if (event.target === shell.overlay) finalize();
    });
    confirmButton.addEventListener('click', finalize);
    document.addEventListener('keydown', handleKeyDown);
  });
}

export function showConfirmDialog(
  message: string,
  options?: {
    title?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  }
): Promise<boolean> {
  const title = options?.title ?? 'Confirm action';
  const confirmLabel = options?.confirmLabel ?? 'Confirm';
  const cancelLabel = options?.cancelLabel ?? 'Cancel';
  const shell = createDialogShell(title, message);
  if (!shell) return Promise.resolve(false);

  return new Promise((resolve) => {
    const actions = document.createElement('div');
    applyStyles(actions, ACTIONS_STYLE);

    const cancelButton = createButton(cancelLabel, 'ghost');
    const confirmButton = createButton(confirmLabel, options?.danger ? 'danger' : 'primary');

    actions.append(cancelButton, confirmButton);
    shell.content.appendChild(actions);
    cancelButton.focus({ preventScroll: true });

    const finalize = (result: boolean) => {
      document.removeEventListener('keydown', handleKeyDown);
      shell.cleanup();
      resolve(result);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finalize(false);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        finalize(true);
      }
    };

    shell.overlay.addEventListener('click', (event) => {
      if (event.target === shell.overlay) finalize(false);
    });
    cancelButton.addEventListener('click', () => finalize(false));
    confirmButton.addEventListener('click', () => finalize(true));
    document.addEventListener('keydown', handleKeyDown);
  });
}
