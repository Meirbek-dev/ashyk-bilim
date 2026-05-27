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
import { useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const COURSES_PER_PAGE = 20;

interface CourseGridClientProps {
  initialCourses: any[];
  initialTotal: number;
  trailData: any;
  currentPage: number;
  isAuthenticated: boolean;
}

export default function CourseGridClient({
  initialCourses,
  initialTotal,
  trailData,
  currentPage,
  isAuthenticated,
}: CourseGridClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const totalPages = Math.ceil(initialTotal / COURSES_PER_PAGE);

  // Helper to create page URLs preserving other query params
  const createPageUrl = (pageNum: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', pageNum.toString());
    return `?${params.toString()}`;
  };

  const isTrailLoading = false;

  // Generate pagination range
  const paginationRange = useMemo(() => {
    const delta = 2;
    const range: (number | 'ellipsis')[] = [];
    const rangeWithDots: (number | 'ellipsis')[] = [];

    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i += 1) {
      range.push(i);
    }

    if (currentPage - delta > 2) {
      rangeWithDots.push(1, 'ellipsis');
    } else {
      for (let i = 1; i < Math.max(2, currentPage - delta); i += 1) {
        rangeWithDots.push(i);
      }
    }

    rangeWithDots.push(...range);

    if (currentPage + delta < totalPages - 1) {
      rangeWithDots.push('ellipsis', totalPages);
    } else {
      for (let i = Math.min(totalPages - 1, currentPage + delta) + 1; i <= totalPages; i += 1) {
        rangeWithDots.push(i);
      }
    }

    return rangeWithDots;
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-8">
      <div className="grid w-full grid-cols-1 justify-items-center gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {initialCourses.map((course: any, index: number) => (
          <div
            key={course.course_uuid}
            className="flex w-full max-w-sm justify-center"
          >
            <CourseThumbnail
              course={course}
              trailData={trailData}
              trailLoading={isTrailLoading}
              priority={currentPage === 1 && index < 3}
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
                href={currentPage <= 1 ? '#' : createPageUrl(currentPage - 1)}
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage > 1) {
                    router.push(createPageUrl(currentPage - 1));
                  }
                }}
                className={currentPage <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
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
                    href={createPageUrl(item)}
                    onClick={(e) => {
                      e.preventDefault();
                      router.push(createPageUrl(item));
                    }}
                    isActive={currentPage === item}
                    className="cursor-pointer"
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}

            <PaginationItem>
              <PaginationNext
                href={currentPage >= totalPages ? '#' : createPageUrl(currentPage + 1)}
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage < totalPages) {
                    router.push(createPageUrl(currentPage + 1));
                  }
                }}
                className={currentPage >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
