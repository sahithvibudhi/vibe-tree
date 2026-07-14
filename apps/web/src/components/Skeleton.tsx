/**
 * Neutral loading placeholder; a pulsing block reads as "content on the
 * way" where a blank pane or a flashed empty state reads as "nothing here".
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="p-2 space-y-2" data-testid="skeleton-rows">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-1.5">
          <Skeleton className="h-3.5 w-3.5 flex-shrink-0" />
          <Skeleton className="h-3.5 flex-1" />
        </div>
      ))}
    </div>
  );
}
