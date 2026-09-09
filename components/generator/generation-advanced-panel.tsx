'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GenerationAdvancedPanelProps {
  children: ReactNode;
  defaultOpen?: boolean;
}

export function GenerationAdvancedPanel({
  children,
  defaultOpen = false,
}: GenerationAdvancedPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-8 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>高级选项</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
