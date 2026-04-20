'use client';
import { useQueryClient } from '@tanstack/react-query';
import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { useUserCertificateByCourse } from '@/features/certifications/hooks/useCertifications';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { revalidateTags } from '@/lib/api-client';
import { Award, ExternalLink, Loader2, X } from 'lucide-react';
import { removeCourse } from '@services/courses/activity';
import { getAbsoluteUrl } from '@services/config/config';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';

interface TrailCourseElementProps {
  course: any;
  run: any;
}

const TrailCourseElement = ({ course, run }: TrailCourseElementProps) => {
  const queryClient = useQueryClient();
  const courseid = course.course_uuid.replace('course_', '');
  const router = useRouter();
  const t = useTranslations('Trail');
  const { course_total_steps } = run;
  const course_completed_steps = run.steps.length;
  const course_progress = course_total_steps > 0 ? Math.round((course_completed_steps / course_total_steps) * 100) : 0;
  const isCompleted = course_progress === 100;
  const certificateQuery = useUserCertificateByCourse(isCompleted ? course.course_uuid : null);
  const courseCertificate = certificateQuery.data?.data?.[0] ?? null;
  const isLoadingCertificate = isCompleted && certificateQuery.isPending;

  async function quitCourse(course_uuid: string) {
    await removeCourse(course_uuid);
    await revalidateTags(['courses']);
    router.refresh();
    await queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() });
  }

  return (
    <div className="border-border bg-card flex gap-4 rounded-xl border p-4 transition-shadow hover:shadow-md">
      {/* Thumbnail */}
      <Link
        prefetch={false}
        href={getAbsoluteUrl(`/course/${courseid}`)}
        className="shrink-0"
      >
        <div
          className="ring-border h-[76px] w-[108px] rounded-lg bg-cover bg-center ring-1 ring-inset"
          style={{
            backgroundImage: course.thumbnail_image
              ? `url(${getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)})`
              : `url('/empty_thumbnail.avif')`,
          }}
        />
      </Link>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground mb-0.5 text-[11px] font-medium tracking-wider uppercase">
              {t('courseLabel')}
            </p>
            <Link
              prefetch={false}
              href={getAbsoluteUrl(`/course/${courseid}`)}
            >
              <h3 className="text-foreground hover:text-primary truncate text-base leading-snug font-semibold transition-colors">
                {course.name}
              </h3>
            </Link>
          </div>
          <button
            onClick={() => quitCourse(course.course_uuid)}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
          >
            <X className="h-3 w-3" />
            {t('quitCourseButton')}
          </button>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span className="tabular-nums">
              {course_completed_steps}&thinsp;/&thinsp;{course_total_steps} {t('stepsLabel')}
            </span>
            <span className={cn('tabular-nums font-semibold', isCompleted ? 'text-primary' : 'text-foreground')}>
              {course_progress}%
            </span>
          </div>
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all duration-300"
              style={{ width: `${course_progress}%` }}
            />
          </div>
        </div>

        {/* Certificate */}
        {isCompleted && (
          <div className="flex items-center gap-1.5">
            {isLoadingCertificate ? (
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('loadingCertificate')}
              </span>
            ) : courseCertificate ? (
              <Link
                prefetch={false}
                href={getAbsoluteUrl(
                  `/certificates/${courseCertificate.certificate_user.user_certification_uuid}/verify`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="border-border text-foreground hover:bg-muted/60 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
              >
                <Award className="text-primary h-3.5 w-3.5" />
                {t('downloadCertificate')}
                <ExternalLink className="text-muted-foreground h-3 w-3" />
              </Link>
            ) : (
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                <Award className="text-muted-foreground/40 h-3 w-3" />
                {t('noCertificateAvailable')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrailCourseElement;
