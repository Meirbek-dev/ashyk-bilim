import type { ReactNode } from 'react'
import { Suspense } from 'react'

interface LoadingSkeletonProps {
  className?: string
  variant?: 'default' | 'card' | 'list' | 'page' | 'minimal'
  lines?: number
  animated?: boolean
}

function LoadingSkeleton({ className = '', variant = 'default', lines = 3, animated = true }: LoadingSkeletonProps) {
  const baseClasses = animated ? 'animate-pulse' : ''
  const skeletonBg = 'bg-muted/40 dark:bg-muted/50'

  const renderLines = (count: number) => {
    return Array.from({ length: count }, (_, i) => {
      const widths = ['w-full', 'w-3/4', 'w-1/2', 'w-2/3', 'w-5/6']
      const width = i === count - 1 ? widths[2] : widths[i % widths.length]

      return <div key={i} className={`h-4 rounded-md ${skeletonBg} ${width} ${i < count - 1 ? 'mb-3' : ''}`} />
    })
  }

  const variants = {
    default: <div className={`${baseClasses} ${className}`}>{renderLines(lines)}</div>,

    minimal: (
      <div className={`${baseClasses} flex items-center justify-center p-8 ${className}`}>
        <div className={`h-2 w-24 rounded-full ${skeletonBg}`} />
      </div>
    ),

    card: (
      <div className={`${baseClasses} border-border dark:border-border rounded-lg border p-4 ${className}`}>
        <div className={`h-6 w-1/3 rounded-md ${skeletonBg} mb-4`} />
        {renderLines(lines)}
        <div className={`h-10 w-24 rounded-md ${skeletonBg} mt-4`} />
      </div>
    ),

    list: (
      <div className={`${baseClasses} space-y-3 ${className}`}>
        {Array.from({ length: lines || 4 }, (_, i) => (
          <div key={i} className="flex items-center space-x-3">
            <div className={`h-10 w-10 rounded-full ${skeletonBg}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-4 w-3/4 rounded-md ${skeletonBg}`} />
              <div className={`h-3 w-1/2 rounded-md ${skeletonBg}`} />
            </div>
          </div>
        ))}
      </div>
    ),

    page: (
      <div className={`${baseClasses} p-6 ${className}`}>
        {/* Header */}
        <div className={`h-8 w-1/4 rounded-md ${skeletonBg} mb-6`} />

        {/* Content sections */}
        <div className="space-y-6">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-3">
              <div className={`h-5 w-1/3 rounded-md ${skeletonBg}`} />
              {renderLines(2)}
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div className="mt-8 flex space-x-3">
          <div className={`h-10 w-20 rounded-md ${skeletonBg}`} />
          <div className={`h-10 w-16 rounded-md ${skeletonBg}`} />
        </div>
      </div>
    ),
  }

  return variants[variant]
}

interface PageSuspenseProps {
  children: ReactNode
  fallback?: ReactNode
  variant?: LoadingSkeletonProps['variant']
  className?: string
}

export function PageSuspense({ children, fallback, variant = 'minimal', className = '' }: PageSuspenseProps) {
  const defaultFallback = (
    <div className="flex min-h-[200px] items-center justify-center">
      <LoadingSkeleton variant={variant} className={className} />
    </div>
  )

  return <Suspense fallback={fallback || defaultFallback}>{children}</Suspense>
}
