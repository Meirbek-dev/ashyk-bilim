'use client';

import { AlertCircle, BookOpen, FileText, GalleryVerticalEnd, Layers2, UserPen } from 'lucide-react';
import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { buildCourseWorkspacePath } from '@/lib/course-management';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getAbsoluteUrl } from '@services/config/config';
import { buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import React from 'react';

interface Course {
  course_uuid: string;
  name: string;
  thumbnail_image?: string;
}

interface Assignment {
  assignment_uuid: string;
  title: string;
  description: string;
}

type PlatformLike = Record<string, unknown>;

interface CourseCardProps {
  course: Course;
  assignments: Assignment[];
  platform?: PlatformLike | null;
}

interface AssignmentRowProps {
  assignment: Assignment;
  platform?: PlatformLike | null;
}

interface CourseThumbnailProps {
  course: Course;
  platform?: PlatformLike | null;
  courseId: string;
}

export const CourseCard = ({ course, assignments, platform }: CourseCardProps) => {
  const t = useTranslations('DashPage.Assignments.HomePage');
  const courseId = course.course_uuid.replace('course_', '');

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <CourseThumbnail
              course={course}
              platform={platform}
              courseId={courseId}
            />
            <div className="space-y-1">
              <Badge
                variant="secondary"
                className="mb-1"
              >
                <BookOpen className="mr-1 h-3 w-3" />
                {t('course')}
              </Badge>
              <h2 className="text-xl leading-tight font-semibold">{course.name}</h2>
            </div>
          </div>

          <Link
            prefetch={false}
            href={buildCourseWorkspacePath(courseId, 'curriculum')}
            className={cn(
              buttonVariants({ variant: 'default', size: 'sm' }),
              'w-full sm:w-auto inline-flex items-center justify-center',
            )}
          >
            <GalleryVerticalEnd className="mr-2 h-4 w-4" />
            {t('courseEditor')}
          </Link>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {assignments?.length > 0 ? (
          <div className="space-y-3">
            {assignments.map((assignment: Assignment, idx: number) => (
              <div key={assignment.assignment_uuid}>
                <AssignmentRow
                  assignment={assignment}
                  platform={platform}
                />
                {idx < assignments.length - 1 && <Separator className="mt-3" />}
              </div>
            ))}
          </div>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="ml-2">{t('noAssignments')}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export const AssignmentRow = ({ assignment, platform: _platform }: AssignmentRowProps) => {
  void _platform;
  const t = useTranslations('DashPage.Assignments.HomePage');
  const assignmentId = assignment.assignment_uuid.replace('assignment_', '');

  return (
    <div className="bg-card hover:bg-accent/50 flex flex-col gap-4 rounded-lg border p-5 transition-colors sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2 sm:flex-1">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="w-fit"
          >
            <FileText className="mr-1 h-3 w-3" />
            {t('assignment')}
          </Badge>
          <h3 className="text-base font-semibold">{assignment.title}</h3>
        </div>
        {assignment.description && (
          <p className="text-muted-foreground line-clamp-2 text-sm">{assignment.description}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Link
          prefetch={false}
          href={{
            pathname: getAbsoluteUrl(`/dash/assignments/${assignmentId}`),
            query: { subpage: 'editor' },
          }}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'inline-flex items-center justify-center')}
        >
          <Layers2 className="mr-2 h-4 w-4" />
          {t('editor')}
        </Link>

        <Link
          prefetch={false}
          href={{
            pathname: getAbsoluteUrl(`/dash/assignments/${assignmentId}`),
            query: { subpage: 'submissions' },
          }}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'inline-flex items-center justify-center')}
        >
          <UserPen className="mr-2 h-4 w-4" />
          {t('submissions')}
        </Link>
      </div>
    </div>
  );
};

export const CourseThumbnail = ({ course, platform: _platform, courseId }: CourseThumbnailProps) => {
  void _platform;
  const t = useTranslations('DashPage.Assignments.HomePage');
  const thumbnailUrl = course.thumbnail_image
    ? getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)
    : '/empty_thumbnail.avif';

  return (
    <Link
      prefetch={false}
      href={getAbsoluteUrl(`/course/${courseId}`)}
      className="group relative shrink-0"
      aria-label={t('viewCourseAria', { courseName: course.name })}
    >
      <div
        role="img"
        aria-hidden="true"
        className="h-20 w-32 overflow-hidden rounded-lg bg-cover bg-center shadow-md ring-1 ring-black/5 transition-all group-hover:shadow-lg group-hover:ring-black/10"
        style={{
          backgroundImage: `url(${thumbnailUrl})`,
          backgroundSize: course.thumbnail_image ? 'cover' : 'contain',
        }}
      />
    </Link>
  );
};
