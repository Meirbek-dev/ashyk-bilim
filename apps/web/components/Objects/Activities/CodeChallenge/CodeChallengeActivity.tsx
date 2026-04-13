'use client';

import { useTranslations } from 'next-intl';

import { CodeChallengeEditor } from '@/components/features/courses/code-challenges';
import { useCodeChallengeSettings } from '@/features/code-challenges/hooks/useCodeChallenge';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface CodeChallengeActivityProps {
  activity: any;
  course: any;
}

interface CodeChallengeTestCase {
  id: string;
  input: string;
  expected_output: string;
  description?: string;
  is_visible: boolean;
  weight?: number;
}

interface CodeChallengeActivitySettings {
  uuid?: string;
  time_limit_ms: number;
  memory_limit_kb: number;
  time_limit: number;
  memory_limit: number;
  max_submissions?: number;
  grading_strategy: string;
  allowed_languages: number[];
  visible_tests: CodeChallengeTestCase[];
  hidden_tests?: CodeChallengeTestCase[];
  starter_code?: Record<string, string>;
}

export default function CodeChallengeActivity({ activity }: CodeChallengeActivityProps) {
  const t = useTranslations('Activities.CodeChallenges');
  const activityUuid = activity?.activity_uuid?.replace('activity_', '') || '';

  // Fetch challenge settings
  const { data: settings, isLoading } = useCodeChallengeSettings<CodeChallengeActivitySettings>(activityUuid);

  // Check if challenge is properly configured (has at least one allowed language)
  const isConfigured = settings?.allowed_languages && settings.allowed_languages.length > 0;
  const primaryLanguageId = settings?.allowed_languages?.[0];

  // Get initial code from activity content or settings
  const initialCode =
    (primaryLanguageId !== undefined ? settings?.starter_code?.[String(primaryLanguageId)] : undefined) ||
    activity?.content?.starter_code ||
    '';

  const initialLanguageId = primaryLanguageId || 71; // Default to Python

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (!settings || !isConfigured) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 text-4xl">🛠️</div>
        <h3 className="text-lg font-semibold">{t('notConfigured')}</h3>
        <p className="text-muted-foreground mt-2 max-w-md text-sm">{t('notConfiguredDescription')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Problem Statement Header */}
      <div className="bg-background border-b p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{activity?.name}</h1>
              {activity?.content?.difficulty && (
                <Badge
                  className={
                    activity.content.difficulty === 'easy'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : activity.content.difficulty === 'hard'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  }
                >
                  {t(`difficulty.${activity.content.difficulty}`)}
                </Badge>
              )}
              {activity?.activity_sub_type === 'SUBTYPE_CODE_COMPETITIVE' && (
                <Badge variant="secondary">🏆 {t('competitive')}</Badge>
              )}
            </div>
            {activity?.content?.description && (
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: activity.content.description }}
              />
            )}
          </div>
          <div className="text-muted-foreground flex items-center gap-4 text-sm">
            <div>
              <span className="font-medium">{t('timeLimit')}:</span> {settings.time_limit_ms}ms
            </div>
            <div>
              <span className="font-medium">{t('memoryLimit')}:</span> {Math.round(settings.memory_limit_kb / 1024)}MB
            </div>
          </div>
        </div>
      </div>

      {/* Code Editor */}
      <div className="min-h-[600px] flex-1">
        <CodeChallengeEditor
          activityUuid={activityUuid}
          settings={settings}
          initialCode={initialCode}
          initialLanguageId={initialLanguageId}
        />
      </div>
    </div>
  );
}
