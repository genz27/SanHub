'use client';

import { cn } from '@/lib/utils';

interface InlineToggleProps {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function InlineToggle({
  checked,
  label,
  onCheckedChange,
  disabled = false,
}: InlineToggleProps) {
  return (
    <label
      className={cn(
        'inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
        checked
          ? 'border-sky-500/30 bg-sky-500/10 text-foreground'
          : 'border-border/70 bg-card/50 text-foreground/65',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <span
        className={cn(
          'relative h-5 w-9 rounded-full transition-colors',
          checked ? 'bg-sky-500/80' : 'bg-background/80'
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-4'
          )}
        />
      </span>
      <span>{label}</span>
    </label>
  );
}
