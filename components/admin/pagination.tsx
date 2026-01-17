'use client';

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
};

export function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  loading = false,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-card/60 border border-border/70 rounded-2xl px-4 py-3">
      <div className="text-sm text-foreground/50">
        共 {total} 条 · 第 {safePage}/{totalPages} 页
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={!canPrev || loading}
          className="px-3 py-1.5 text-sm bg-card/70 border border-border/70 text-foreground/70 rounded-lg hover:bg-card/80 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          上一页
        </button>
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={!canNext || loading}
          className="px-3 py-1.5 text-sm bg-card/70 border border-border/70 text-foreground/70 rounded-lg hover:bg-card/80 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
