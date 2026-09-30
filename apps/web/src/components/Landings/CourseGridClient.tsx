'use client'

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import CourseThumbnail from '@components/Objects/Thumbnails/CourseThumbnail'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

interface CourseGridClientProps {
  initialCourses: AppCourse[]
  /** The listing is keyset with no total: `next_cursor` is the only "next page" signal (UX-133). */
  hasNextPage: boolean
  trailData: AppTrailData | null
  currentPage: number
  isAuthenticated: boolean
}

export default function CourseGridClient({
  initialCourses,
  hasNextPage,
  trailData,
  currentPage,
}: CourseGridClientProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = useTranslations('Components.Pagination')

  // Helper to create page URLs preserving other query params
  const createPageUrl = (pageNum: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', pageNum.toString())
    return `?${params.toString()}`
  }

  const isTrailLoading = false
  const hasPrevPage = currentPage > 1

  return (
    <div className="space-y-8">
      {initialCourses.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-3 py-12 text-center text-sm">
          <p>{t('pastEnd')}</p>
          <a
            href={createPageUrl(1)}
            onClick={e => {
              e.preventDefault()
              router.push(createPageUrl(1))
            }}
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            {t('backToFirst')}
          </a>
        </div>
      ) : (
        <div className="grid w-full grid-cols-1 justify-items-center gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {initialCourses.map((course: AppCourse, index: number) => (
            <div key={course.course_uuid} className="flex w-full max-w-sm justify-center">
              <CourseThumbnail
                course={course}
                trailData={trailData}
                trailLoading={isTrailLoading}
                priority={currentPage === 1 && index < 3}
              />
            </div>
          ))}
        </div>
      )}

      {/* Pagination: prev/next only — the contract carries no total (UX-133). */}
      {(hasPrevPage || hasNextPage) && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                {...(hasPrevPage ? { href: createPageUrl(currentPage - 1) } : { 'aria-disabled': true })}
                onClick={e => {
                  e.preventDefault()
                  if (hasPrevPage) router.push(createPageUrl(currentPage - 1))
                }}
                className={hasPrevPage ? 'cursor-pointer' : 'pointer-events-none opacity-50'}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                {...(hasNextPage ? { href: createPageUrl(currentPage + 1) } : { 'aria-disabled': true })}
                onClick={e => {
                  e.preventDefault()
                  if (hasNextPage) router.push(createPageUrl(currentPage + 1))
                }}
                className={hasNextPage ? 'cursor-pointer' : 'pointer-events-none opacity-50'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}
