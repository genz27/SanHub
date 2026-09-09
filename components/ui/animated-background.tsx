import { cn } from '@/lib/utils';

export function AnimatedBackground({
  variant = 'home',
}: {
  variant?: 'home' | 'auth';
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed inset-0 z-0 overflow-hidden',
        variant === 'auth' && 'atmosphere-auth'
      )}
    >
      <div className="atmosphere-stage" />
      <div className="atmosphere-aurora" />
      <div className="atmosphere-beam" />
      <div className="atmosphere-grid" />
      <div className="atmosphere-floor" />
      <div className="atmosphere-noise" />
      <div className="atmosphere-vignette" />
    </div>
  );
}
