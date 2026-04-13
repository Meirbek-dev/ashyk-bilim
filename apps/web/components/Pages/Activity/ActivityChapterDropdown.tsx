'use client';
import { ArrowRight, Backpack, Check, ClipboardList, FileText, ListTree, StickyNote, Video, X } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { getAbsoluteUrl } from '@services/config/config';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import type { ReactNode } from 'react';

interface ActivityChapterDropdownProps {
  course: any;
  currentActivityId: string;
  trailData?: any;
}

export default function ActivityChapterDropdown(props: ActivityChapterDropdownProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const t = useTranslations('ActivityPage');

  // Clean up course UUID by removing 'course_' prefix if it exists
  const cleanCourseUuid = props.course.course_uuid?.replace('course_', '');

  // Close dropdown when clicking outside
  const handleClickOutside = useEffectEvent((event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  });

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  // Function to get the appropriate icon for activity type
  const getActivityTypeIcon = (activityType: string) => {
    switch (activityType) {
      case 'TYPE_VIDEO': {
        return <Video size={10} />;
      }
      case 'TYPE_DOCUMENT': {
        return <FileText size={10} />;
      }
      case 'TYPE_DYNAMIC': {
        return <StickyNote size={10} />;
      }
      case 'TYPE_ASSIGNMENT': {
        return <Backpack size={10} />;
      }
      case 'TYPE_EXAM': {
        return <ClipboardList size={10} />;
      }
      default: {
        return <FileText size={10} />;
      }
    }
  };

  const getActivityTypeLabel = (activityType: string) => {
    switch (activityType) {
      case 'TYPE_VIDEO': {
        return t('activityTypes.video');
      }
      case 'TYPE_DOCUMENT': {
        return t('activityTypes.document');
      }
      case 'TYPE_DYNAMIC': {
        return t('activityTypes.dynamic');
      }
      case 'TYPE_ASSIGNMENT': {
        return t('activityTypes.assignment');
      }
      case 'TYPE_EXAM': {
        return t('activityTypes.exam');
      }
      default: {
        return t('activityTypes.learningMaterial');
      }
    }
  };

  return (
    <div
      className="relative"
      ref={dropdownRef}
    >
      <button
        onClick={toggleDropdown}
        className="soft-shadow border-border bg-card text-foreground hover:bg-muted flex items-center space-x-2 rounded-full border p-2.5 px-5 transition delay-150 duration-300 ease-in-out"
        aria-label={t('viewAllActivities')}
        title={t('viewAllActivities')}
      >
        <ListTree size={17} />
        <span className="text-xs font-bold">{t('chapters')}</span>
      </button>

      {isOpen ? (
        <div
          className={`absolute z-50 mt-2 ${isMobile ? 'right-0 w-[90vw] sm:w-72' : 'right-0 w-72'} fade-in animate-in border-border bg-card max-h-[70vh] cursor-pointer overflow-y-auto rounded-lg border py-1 shadow-xl duration-200`}
        >
          <div className="border-border flex items-center justify-between border-b px-3 py-1.5">
            <h3 className="text-foreground text-sm font-semibold">{t('courseContent')}</h3>
            <button
              onClick={() => {
                setIsOpen(false);
              }}
              className="text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer rounded-full p-1"
            >
              <X size={14} />
            </button>
          </div>

          <div className="py-0.5">
            {props.course.chapters.map((chapter: any, index: number) => (
              <div
                key={chapter.id}
                className="mb-1"
              >
                <div className="flex items-center border-y border-gray-100 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-600">
                  <div className="flex items-center space-x-1.5">
                    <div className="bg-primary text-primary-foreground flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold">
                      {index + 1}
                    </div>
                    <span>{chapter.name}</span>
                  </div>
                </div>
                <div className="py-0.5">
                  {chapter.activities.map((activity: any) => {
                    const cleanActivityUuid = activity.activity_uuid?.replace('activity_', '');
                    const isCurrent = cleanActivityUuid === props.currentActivityId.replace('activity_', '');

                    // Find the correct run and check if activity is complete
                    const run = props.trailData?.runs?.find((run: any) => {
                      const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '');
                      return cleanRunCourseUuid === cleanCourseUuid;
                    });

                    const isComplete = run?.steps?.find(
                      (step: any) => step.activity_id === activity.id && step.complete === true,
                    );

                    return (
                      <Link
                        key={activity.id}
                        href={`${getAbsoluteUrl('')}/course/${cleanCourseUuid}/activity/${cleanActivityUuid}`}
                        prefetch={false}
                        onClick={() => {
                          setIsOpen(false);
                        }}
                      >
                        <div
                          className={`group px-3 py-2 transition-colors hover:bg-neutral-50 ${
                            isCurrent ? 'border-l-2 border-neutral-300 bg-neutral-50 pl-2.5 font-medium' : ''
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <div className="flex items-center">
                              {isComplete ? (
                                <div className="relative cursor-pointer">
                                  <Check
                                    size={14}
                                    className="stroke-[2.5] text-teal-600"
                                  />
                                </div>
                              ) : (
                                <div className="cursor-pointer text-neutral-300">
                                  <Check
                                    size={14}
                                    className="stroke-2"
                                  />
                                </div>
                              )}
                            </div>
                            <div className="flex grow flex-col">
                              <div className="flex w-full items-center space-x-1.5">
                                <p className="text-sm font-medium text-neutral-600 transition-colors group-hover:text-neutral-800">
                                  {activity.name}
                                </p>
                                {isCurrent ? (
                                  <div className="flex animate-pulse items-center space-x-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                                    <span>{t('current')}</span>
                                  </div>
                                ) : null}
                              </div>
                              <div className="mt-0.5 flex items-center space-x-1 text-neutral-400">
                                {getActivityTypeIcon(activity.activity_type)}
                                <span className="text-[10px] font-medium">
                                  {getActivityTypeLabel(activity.activity_type)}
                                </span>
                              </div>
                            </div>
                            <div className="cursor-pointer text-neutral-300 transition-colors group-hover:text-neutral-400">
                              <ArrowRight size={12} />
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
