'use client';

import { ArrowLeft, ChevronRight, ClipboardList, Code2, FileText, GraduationCap, Sparkles, Video } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

import CodeChallenge from './NewActivityModal/CodeChallengeActivityModal';
import DocumentPdfModal from './NewActivityModal/DocumentActivityModal';
import DynamicCanvaModal from './NewActivityModal/DynamicActivityModal';
import Assignment from './NewActivityModal/AssignmentActivityModal';
import VideoModal from './NewActivityModal/VideoActivityModal';
import Exam from './NewActivityModal/ExamActivityModal';

type ViewType = 'home' | 'dynamic' | 'video' | 'documentpdf' | 'assignments' | 'exams' | 'codechallenge';

interface ActivityTypeConfig {
  id: ViewType;
  labelKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  iconClass: string;
}

interface NewActivityModalProps {
  closeModal: () => void;
  submitActivity: (data?: any) => Promise<any>;
  submitFileActivity: (params: { file: any; type: any; activity: any; chapterId: number }) => Promise<void>;
  submitExternalVideo: (external_video_data: any, activity: any, chapterId: number) => Promise<void>;
  createAndOpenActivity: (kind: 'dynamic' | 'codechallenge') => Promise<void>;
  chapterId: number;
  course: unknown;
}

const ACTIVITY_TYPES: ActivityTypeConfig[] = [
  {
    id: 'dynamic',
    labelKey: 'dynamicPage',
    descriptionKey: 'dynamicPageDesc',
    icon: Sparkles,
    iconClass: 'text-violet-500',
  },
  {
    id: 'video',
    labelKey: 'video',
    descriptionKey: 'videoDesc',
    icon: Video,
    iconClass: 'text-rose-500',
  },
  {
    id: 'documentpdf',
    labelKey: 'document',
    descriptionKey: 'documentDesc',
    icon: FileText,
    iconClass: 'text-sky-500',
  },
  {
    id: 'assignments',
    labelKey: 'assignments',
    descriptionKey: 'assignmentsDesc',
    icon: ClipboardList,
    iconClass: 'text-amber-500',
  },
  {
    id: 'exams',
    labelKey: 'exams',
    descriptionKey: 'examsDesc',
    icon: GraduationCap,
    iconClass: 'text-emerald-500',
  },
  {
    id: 'codechallenge',
    labelKey: 'codeChallenge',
    descriptionKey: 'codeChallengeDesc',
    icon: Code2,
    iconClass: 'text-teal-500',
  },
];

export default function NewActivityModal({
  closeModal,
  submitActivity,
  submitFileActivity,
  submitExternalVideo,
  createAndOpenActivity,
  chapterId,
  course,
}: NewActivityModalProps) {
  const t = useTranslations('Components.NewActivity');
  const [selectedView, setSelectedView] = useState<ViewType>('home');
  const [isQuickCreating, setIsQuickCreating] = useState<ViewType | null>(null);

  const handleBack = useCallback(() => setSelectedView('home'), []);

  const handleTypeSelect = useCallback(
    async (view: ViewType) => {
      if (view !== 'dynamic' && view !== 'codechallenge') {
        setSelectedView(view);
        return;
      }

      setIsQuickCreating(view);
      try {
        await createAndOpenActivity(view);
      } finally {
        setIsQuickCreating(null);
      }
    },
    [createAndOpenActivity],
  );

  const sharedProps = { chapterId, course, closeModal };

  if (selectedView === 'home') {
    return (
      <div className="w-full space-y-3">
        <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">{t('chooseType')}</p>
        <div className="overflow-hidden rounded-xl border border-gray-200">
          {ACTIVITY_TYPES.map((activity, index) => (
            <ActivityTypeRow
              key={activity.id}
              config={activity}
              label={t(activity.labelKey)}
              description={t(activity.descriptionKey)}
              onClick={() => void handleTypeSelect(activity.id)}
              isLoading={isQuickCreating === activity.id}
              isLast={index === ACTIVITY_TYPES.length - 1}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-200 focus-visible:outline-none"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('backToActivities')}
      </button>

      {selectedView === 'dynamic' && (
        <DynamicCanvaModal
          submitActivity={submitActivity}
          {...sharedProps}
        />
      )}
      {selectedView === 'video' && (
        <VideoModal
          submitFileActivity={submitFileActivity}
          submitExternalVideo={submitExternalVideo}
          chapterId={chapterId}
          course={course}
        />
      )}
      {selectedView === 'documentpdf' && (
        <DocumentPdfModal
          submitFileActivity={submitFileActivity}
          chapterId={chapterId}
          course={course}
        />
      )}
      {selectedView === 'assignments' && (
        <Assignment
          submitActivity={submitActivity}
          {...sharedProps}
        />
      )}
      {selectedView === 'exams' && (
        <Exam
          submitActivity={submitActivity}
          {...sharedProps}
        />
      )}
      {selectedView === 'codechallenge' && (
        <CodeChallenge
          submitActivity={submitActivity}
          {...sharedProps}
        />
      )}
    </div>
  );
}

interface ActivityTypeRowProps {
  config: ActivityTypeConfig;
  label: string;
  description: string;
  onClick: () => void;
  isLoading?: boolean;
  isLast?: boolean;
}

function ActivityTypeRow({
  config,
  label,
  description,
  onClick,
  isLoading = false,
  isLast = false,
}: ActivityTypeRowProps) {
  const Icon = config.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={cn(
        'group flex w-full items-center gap-3.5 px-4 py-3 text-left',
        'transition-colors duration-100',
        'hover:bg-gray-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300',
        'disabled:pointer-events-none disabled:opacity-50',
        !isLast && 'border-b border-gray-100',
      )}
    >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white transition-colors group-hover:border-gray-300 group-hover:bg-gray-50">
        {isLoading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-gray-300 border-t-gray-600" />
        ) : (
          <Icon className={cn('h-3.5 w-3.5', config.iconClass)} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{label}</p>
        <p className="mt-0.5 truncate text-xs text-gray-400">{description}</p>
      </div>

      <ChevronRight
        className={cn(
          'h-3.5 w-3.5 flex-shrink-0 text-gray-300 transition-all duration-100',
          'group-hover:translate-x-0.5 group-hover:text-gray-400',
        )}
      />
    </button>
  );
}
