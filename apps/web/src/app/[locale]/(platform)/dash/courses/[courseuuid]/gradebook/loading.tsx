export default function GradebookLoading() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="h-14 animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800/80" />
      <div className="rounded-2xl border p-4">
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-xl bg-slate-200/80 dark:bg-slate-800/80"
            />
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border">
        <div className="h-[560px] animate-pulse bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900" />
      </div>
    </div>
  );
}
