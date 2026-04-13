'use client';

export default function CoursesLoading() {
  return (
    <div className="space-y-8 px-4 py-6 lg:px-8">
      <div className="space-y-3">
        <div className="bg-muted h-10 w-72 animate-pulse rounded-lg" />
        <div className="bg-muted/80 h-5 w-full max-w-2xl animate-pulse rounded" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="bg-card rounded-xl border p-5 shadow-sm"
          >
            <div className="bg-muted h-4 w-24 animate-pulse rounded" />
            <div className="bg-muted/80 mt-4 h-9 w-16 animate-pulse rounded" />
            <div className="bg-muted/60 mt-3 h-4 w-40 animate-pulse rounded" />
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="bg-muted h-10 w-full max-w-md animate-pulse rounded-lg" />
          <div className="flex gap-3">
            <div className="bg-muted h-10 w-32 animate-pulse rounded-lg" />
            <div className="bg-muted h-10 w-40 animate-pulse rounded-lg" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="bg-card overflow-hidden rounded-2xl border shadow-sm"
          >
            <div className="bg-muted aspect-[16/9] animate-pulse" />
            <div className="space-y-4 p-5">
              <div className="bg-muted h-6 w-3/4 animate-pulse rounded" />
              <div className="bg-muted/80 h-4 w-full animate-pulse rounded" />
              <div className="bg-muted/70 h-4 w-5/6 animate-pulse rounded" />
              <div className="flex gap-2">
                <div className="bg-muted h-6 w-20 animate-pulse rounded-full" />
                <div className="bg-muted/80 h-6 w-16 animate-pulse rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
