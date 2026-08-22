import { createRoot } from 'react-dom/client';
import Modal from '../components/Modal';

type ConfirmTone = 'default' | 'danger';

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

export type AlertOptions = {
  title?: string;
  message: string;
  actionLabel?: string;
};

export function confirmAction({
  title = 'Confirm action',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
}: ConfirmOptions): Promise<boolean> {
  if (typeof document === 'undefined') {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let settled = false;

    const finalize = (result: boolean) => {
      if (settled) return;
      settled = true;
      root.unmount();
      container.remove();
      resolve(result);
    };

    root.render(
      <Modal open onClose={() => finalize(false)} closeOnBackdrop ariaLabel={title} className="max-w-md">
        <div className="bg-white rounded-xl shadow-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm whitespace-pre-line text-slate-600">{message}</p>
          </div>
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => finalize(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => finalize(true)}
              className={
                tone === 'danger'
                  ? 'px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700'
                  : 'px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700'
              }
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </Modal>
    );
  });
}

export function alertAction({
  title = 'Notice',
  message,
  actionLabel = 'OK',
}: AlertOptions): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let settled = false;

    const finalize = () => {
      if (settled) return;
      settled = true;
      root.unmount();
      container.remove();
      resolve();
    };

    root.render(
      <Modal open onClose={finalize} closeOnBackdrop ariaLabel={title} className="max-w-md">
        <div className="bg-white rounded-xl shadow-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm whitespace-pre-line text-slate-600">{message}</p>
          </div>
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
            <button
              type="button"
              onClick={finalize}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
              {actionLabel}
            </button>
          </div>
        </div>
      </Modal>
    );
  });
}

export default confirmAction;
