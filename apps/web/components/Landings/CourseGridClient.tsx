'use client';

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import CourseThumbnail from '@components/Objects/Thumbnails/CourseThumbnail';
import { useSession } from '@/hooks/useSession';
import { useCourseListQuery } from '@/features/courses/hooks/useCourseQueries';
import { useTrailCurrent } from '@/features/trail/hooks/useTrail';
import { useMemo, useState } from 'react';

const COURSES_PER_PAGE = 20;

interface CourseGridClientProps {
  initialCourses: any[];
  initialTotal: number;
}

export default function CourseGridClient({ initialCourses, initialTotal }: CourseGridClientProps) {
  const { isAuthenticated } = useSession();
  const [page, setPage] = useState(1);

  // Fetch courses with pagination
  const { data: coursesResponse, isLoading: coursesLoading } = useCourseListQuery(
    { page, limit: COURSES_PER_PAGE },
    {
      initialData: page === 1 ? { courses: initialCourses, total: initialTotal } : undefined,
      staleTime: 60_000,
    },
  );

  const courses = coursesResponse?.courses ?? initialCourses;
  const totalCount = coursesResponse?.total ?? initialTotal;
  const totalPages = Math.ceil(totalCount / COURSES_PER_PAGE);

  // Fetch trail data to show progress on course thumbnails (auth-required)
  const { data: trailData } = useTrailCurrent({ enabled: isAuthenticated });

  // Only show loading state for authenticated users; unauthenticated users
  // never fetch trail data so !trailData would be true forever.
  const isTrailLoading = isAuthenticated && !trailData;

  // Generate pagination range
  const paginationRange = useMemo(() => {
    const delta = 2;
    const range: (number | 'ellipsis')[] = [];
    const rangeWithDots: (number | 'ellipsis')[] = [];

    for (let i = Math.max(2, page - delta); i <= Math.min(totalPages - 1, page + delta); i += 1) {
      range.push(i);
    }

    if (page - delta > 2) {
      rangeWithDots.push(1, 'ellipsis');
    } else {
      for (let i = 1; i < Math.max(2, page - delta); i += 1) {
        rangeWithDots.push(i);
      }
    }

    rangeWithDots.push(...range);

    if (page + delta < totalPages - 1) {
      rangeWithDots.push('ellipsis', totalPages);
    } else {
      for (let i = Math.min(totalPages - 1, page + delta) + 1; i <= totalPages; i += 1) {
        rangeWithDots.push(i);
      }
    }

    return rangeWithDots;
  }, [page, totalPages]);

  return (
    <div className="space-y-8">
      <div className="grid w-full grid-cols-1 justify-items-center gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {coursesLoading && page !== 1
          ? // Show skeletons when loading new page
            Array.from({ length: COURSES_PER_PAGE }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="flex w-full max-w-sm justify-center"
              >
                <div className="w-full animate-pulse">
                  <div className="bg-muted h-44 w-full rounded-md" />
                  <div className="bg-muted mt-3 h-4 w-3/4 rounded" />
                  <div className="bg-muted mt-2 h-3 w-1/2 rounded" />
                </div>
              </div>
            ))
          : courses.map((course: any, index: number) => (
              <div
                key={course.course_uuid}
                className="flex w-full max-w-sm justify-center"
              >
                <CourseThumbnail
                  course={course}
                  trailData={trailData}
                  trailLoading={isTrailLoading}
                  priority={page === 1 && index < 3}
                />
              </div>
            ))}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (page > 1) setPage(page - 1);
                }}
                className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>

            {paginationRange.map((item, index) =>
              item === 'ellipsis' ? (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    href="#"
                    isActive={page === item}
                    onClick={(e) => {
                      e.preventDefault();
                      setPage(item);
                    }}
                    className="cursor-pointer"
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}

            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (page < totalPages) setPage(page + 1);
                }}
                className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
