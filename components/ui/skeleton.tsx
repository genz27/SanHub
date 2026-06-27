'use client';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={'animate-pulse bg-card/40 rounded-xl ' + className} />;
}

export function StatCardSkeleton() {
  return (
    <div className="bg-card/60 border border-border/70 rounded-2xl p-5">
      <div className="flex items-center gap-4">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="w-16 h-6" />
          <Skeleton className="w-20 h-4" />
        </div>
      </div>
    </div>
  );
}

export function TableRowSkeleton({ cols = 4, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-border/70">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className={'h-5 ' + (j === 0 ? 'w-32' : j === cols - 1 ? 'w-16 ml-auto' : 'w-24')} />
          ))}
        </div>
      ))}
    </>
  );
}
