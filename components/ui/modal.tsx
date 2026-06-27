'use client';

import { useEffect, useCallback, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl' | 'full';
}

export function Modal({ open, onClose, title, icon, children, size = 'lg' }: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const sizeClasses = {
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 sm:pt-16">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative z-10 w-full ${sizeClasses[size]} bg-card/95 backdrop-blur-xl border border-border/70 rounded-2xl shadow-2xl max-h-[85vh] flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/70 shrink-0">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="w-9 h-9 bg-blue-500/20 rounded-xl flex items-center justify-center">
                {icon}
              </div>
            )}
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-foreground/40 hover:text-foreground hover:bg-card/70 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
