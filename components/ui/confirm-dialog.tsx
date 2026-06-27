'use client';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  loading?: boolean;
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, message,
  confirmLabel = '确定', variant = 'danger', loading = false,
}: ConfirmDialogProps) {
  const variantColors = {
    danger: 'from-red-500 to-rose-500',
    warning: 'from-amber-500 to-orange-500',
    default: 'from-blue-500 to-cyan-500',
  };

  return (
    <Modal open={open} onClose={onClose} title={title} icon={<AlertTriangle className="w-5 h-5 text-red-400" />} size="md">
      <div className="space-y-6">
        <p className="text-foreground/70">{message}</p>
        <div className="flex items-center gap-3 justify-end">
          <button onClick={onClose} className="px-5 py-2.5 bg-card/70 text-foreground rounded-xl hover:bg-card/80">
            取消
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            disabled={loading}
            className={'flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r text-foreground rounded-xl font-medium hover:opacity-90 disabled:opacity-50 ' + variantColors[variant]}
          >
            {loading && <div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
