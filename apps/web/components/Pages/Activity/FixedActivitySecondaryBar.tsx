'use client';

import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { getAbsoluteUrl } from '@services/config/config';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import NextImage from '@components/ui/NextImage';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

interface FixedActivitySecondaryBarProps {
  course: any;
  currentActivityId: string;
  activity: any;
}

// Navigation buttons component
const NavigationButtons = ({
  prevActivity,
  nextActivity,
  currentIndex,
  allActivities,
  navigateToActivity,
  t,
}: {
  prevActivity: any;
  nextActivity: any;
  currentIndex: number;
  allActivities: any[];
  navigateToActivity: (activity: any) => void;
  t: (key: string, values?: Record<string, any>) => string;
}) => (
  <div className="flex items-center gap-1">
    <button
      onClick={() => {
        navigateToActivity(prevActivity);
      }}
      disabled={!prevActivity}
      className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors disabled:pointer-events-none disabled:opacity-30"
      title={
        prevActivity
          ? t('NavigationButtons.previousActivityTitle', { activityName: prevActivity.name })
          : t('NavigationButtons.noPreviousActivity')
      }
    >
      <ChevronLeft
        size={15}
        className="shrink-0"
      />
      <div className="hidden flex-col items-start sm:flex">
        <span className="text-muted-foreground text-xs">{t('NavigationButtons.previous')}</span>
        <span className="text-foreground max-w-[120px] truncate text-left text-xs font-medium">
          {prevActivity ? prevActivity.name : '—'}
        </span>
      </div>
    </button>

    <span className="text-muted-foreground px-2 text-xs font-medium tabular-nums select-none">
      {currentIndex + 1} / {allActivities.length}
    </span>

    <button
      onClick={() => {
        navigateToActivity(nextActivity);
      }}
      disabled={!nextActivity}
      className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors disabled:pointer-events-none disabled:opacity-30"
      title={
        nextActivity
          ? t('NavigationButtons.nextActivityTitle', { activityName: nextActivity.name })
          : t('NavigationButtons.noNextActivity')
      }
    >
      <div className="hidden flex-col items-end sm:flex">
        <span className="text-muted-foreground text-xs">{t('NavigationButtons.next')}</span>
        <span className="text-foreground max-w-[120px] truncate text-right text-xs font-medium">
          {nextActivity ? nextActivity.name : '—'}
        </span>
      </div>
      <ChevronRight
        size={15}
        className="shrink-0"
      />
    </button>
  </div>
);

// Course info component
const CourseInfo = ({
  course,
  t,
}: {
  course: any;
  platform: any;
  t: (key: string, values?: Record<string, any>) => string;
}) => (
  <div className="flex min-w-0 shrink items-center gap-3">
    <div className="relative h-8 w-[52px] shrink-0 overflow-hidden rounded">
      <NextImage
        src={
          course.thumbnail_image
            ? `${getCourseThumbnailMediaDirectory(course.course_uuid, course.thumbnail_image)}`
            : '/empty_thumbnail.webp'
        }
        alt={course.name || ''}
        fill
        className="object-cover"
        sizes="60px"
      />
    </div>
    <div className="hidden min-w-0 sm:block">
      <p className="text-muted-foreground text-xs">{t('CourseInfo.course')}</p>
      <p className="text-foreground truncate text-sm font-semibold">{course.name}</p>
    </div>
  </div>
);

export default function FixedActivitySecondaryBar(props: FixedActivitySecondaryBarProps): ReactNode {
  const router = useRouter();
  const t = useTranslations('FixedActivitySecondaryBar');
  const [isScrolled, setIsScrolled] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const mainActivityInfoRef = useRef<HTMLDivElement | null>(null);
  const platform = usePlatform();

  const { allActivities, currentIndex } = (() => {
    const allActivities: any[] = [];
    let currentIndex = -1;

    props.course.chapters.forEach((chapter: any) => {
      chapter.activities.forEach((activity: any) => {
        const cleanActivityUuid = activity.activity_uuid?.replace('activity_', '');
        allActivities.push({
          ...activity,
          cleanUuid: cleanActivityUuid,
          chapterName: chapter.name,
        });

        if (cleanActivityUuid === props.currentActivityId.replace('activity_', '')) {
          currentIndex = allActivities.length - 1;
        }
      });
    });

    return { allActivities, currentIndex };
  })();

  const prevActivity = currentIndex > 0 ? allActivities[currentIndex - 1] : null;
  const nextActivity = currentIndex < allActivities.length - 1 ? allActivities[currentIndex + 1] : null;

  const navigateToActivity = (activity: any) => {
    if (!activity) return;

    const cleanCourseUuid = props.course.course_uuid?.replace('course_', '');
    router.push(`${getAbsoluteUrl('')}/course/${cleanCourseUuid}/activity/${activity.cleanUuid}`);
  };

  useEffect(() => {
    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setIsScrolled(window.scrollY > 0);
      });
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) {
          setShouldShow(!entry.isIntersecting);
        }
      },
      {
        threshold: [0, 0.1, 1],
        rootMargin: '-80px 0px 0px 0px',
      },
    );

    const mainActivityInfo = document.querySelector('.activity-info-section');
    if (mainActivityInfo) {
      mainActivityInfoRef.current = mainActivityInfo as HTMLDivElement;
      observer.observe(mainActivityInfo);
    }

    const listenerOptions = { passive: true } as any;
    window.addEventListener('scroll', handleScroll, listenerOptions);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleScroll, listenerOptions);
      try {
        observer.disconnect();
      } catch {
        // ignore
      }
    };
  }, []);

  if (!shouldShow) return null;

  return (
    <div
      className={`animate-in fade-in slide-in-from-top border-border bg-background/95 fixed top-[60px] right-0 left-0 z-40 border-b backdrop-blur-lg transition-shadow duration-200 ${
        isScrolled ? 'shadow-xs' : ''
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between gap-4">
          <CourseInfo
            course={props.course}
            platform={platform}
            t={t}
          />

          <NavigationButtons
            prevActivity={prevActivity}
            nextActivity={nextActivity}
            currentIndex={currentIndex}
            allActivities={allActivities}
            navigateToActivity={navigateToActivity}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}
