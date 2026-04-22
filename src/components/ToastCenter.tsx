import { useEffect } from 'react';
import type { Toast } from '../types';

interface ToastCenterProps {
  toasts: Toast[];
  onClose: (id: number) => void;
}

const ICON_MAP = {
  success: '✅',
  error: '⛔',
  warning: '⚠',
  info: 'ℹ',
} as const;

export function ToastCenter({ toasts, onClose }: ToastCenterProps) {
  useEffect(() => {
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        onClose(toast.id);
      }, toast.duration ?? 3000),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [onClose, toasts]);

  return (
    <div className="toast-center" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast ${toast.type}`}
          style={{ ['--toast-duration' as string]: `${toast.duration ?? 3000}ms` }}
          role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
        >
          <span className="toast-icon" aria-hidden="true">{ICON_MAP[toast.type]}</span>
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => onClose(toast.id)}
            aria-label="关闭提示"
            title="关闭提示"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
