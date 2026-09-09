'use client';

import { cn } from '@/lib/utils';

export interface OptionChip<T extends string = string> {
  value: T;
  label: string;
}

interface OptionChipGroupProps<T extends string = string> {
  label: string;
  value: T;
  options: Array<OptionChip<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function OptionChipGroup<T extends string = string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: OptionChipGroupProps<T>) {
  if (options.length === 0) return null;

  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                'inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-medium transition-colors',
                selected
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
