import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper'

export default function CoursesLoading() {
  return (
    <div className="w-full">
      <GeneralWrapper>
        <div className="mb-2 flex flex-col space-y-2">
          {/* Header Skeleton */}
          <div className="flex items-center justify-between border-b pb-4">
            <div className="h-8 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-10 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>

          {/* Grid Skeleton */}
          <div className="mt-6 space-y-8">
            <div className="grid w-full grid-cols-1 justify-items-center gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="flex w-full max-w-sm justify-center">
                  <div className="w-full animate-pulse space-y-3">
                    <div className="h-44 w-full rounded-md bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GeneralWrapper>
    </div>
  )
}
