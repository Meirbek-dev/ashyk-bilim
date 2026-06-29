import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper'

export default function CourseDetailLoading() {
  return (
    <div className="w-full">
      <GeneralWrapper>
        {/* Breadcrumb Skeleton */}
        <div className="flex h-5 w-64 animate-pulse items-center gap-1.5 rounded bg-gray-200 dark:bg-gray-700" />

        {/* Title Skeleton */}
        <div className="pt-5 pb-8">
          <div className="h-10 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        </div>

        {/* Two-column Layout */}
        <div className="flex flex-col gap-10 md:flex-row md:items-start">
          {/* Main content */}
          <div className="w-full min-w-0 space-y-10 md:w-3/4">
            {/* Thumbnail Image Skeleton */}
            <div className="aspect-video w-full animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />

            {/* Description Lines Skeleton */}
            <div className="space-y-3">
              <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            </div>

            {/* Chapters list (Accordion skeletons) */}
            <div className="space-y-4">
              <div className="h-6 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex h-16 w-full animate-pulse items-center justify-between rounded-lg border bg-gray-50/50 p-4 dark:bg-gray-800/20"
                >
                  <div className="h-5 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-5 w-5 rounded-full bg-gray-200 dark:bg-gray-700" />
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-full space-y-6 md:w-1/4">
            <div className="space-y-3 rounded-xl border bg-gray-50/50 p-4 dark:bg-gray-800/20">
              <div className="h-12 w-full animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
        </div>
      </GeneralWrapper>
    </div>
  )
}
