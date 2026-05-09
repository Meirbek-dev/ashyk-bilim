import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton placeholder shown while analytics pages are loading server-side data.
 * Mirrors the rough structure of the analytics overview (filter bar → KPI cards →
 * charts → tables) so the page feels responsive rather than blank.
 */
export default function AnalyticsPageSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="ml-auto h-9 w-24" />
      </div>

      {/* KPI cards — 4 across on large screens */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border p-4"
          >
            <Skeleton className="mb-3 h-4 w-3/4" />
            <Skeleton className="mb-2 h-8 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
      </div>

      {/* Chart row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border p-4">
          <Skeleton className="mb-4 h-5 w-1/3" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
        <div className="rounded-xl border p-4">
          <Skeleton className="mb-4 h-5 w-1/3" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border p-4">
        <Skeleton className="mb-4 h-5 w-1/4" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-10 w-full"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
