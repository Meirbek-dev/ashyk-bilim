export default function GradebookLoading() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="bg-muted h-14 animate-pulse rounded-lg" />
      <div className="rounded-xl border p-4">
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="bg-muted h-24 animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border">
        <div className="bg-muted h-[560px] animate-pulse" />
      </div>
    </div>
  )
}
