'use client';

import { FormProvider, useForm } from 'react-hook-form';
import { Loader2, Save } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useCodeChallengeSettings, useSaveCodeChallengeSettings } from './hooks';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import HintsPanel from './HintsPanel';
import LanguagePolicyPanel from './LanguagePolicyPanel';
import StarterCodeTabs from './StarterCodeTabs';
import TestCaseListEditor from './TestCaseListEditor';

export interface CodeChallengeTestCaseForm {
  id?: string;
  input: string;
  expected_output: string;
  is_visible: boolean;
  description?: string;
  weight: number;
}

export interface CodeChallengeHintForm {
  id?: string;
  order?: number;
  content: string;
  xp_penalty: number;
}

export interface CodeChallengeSettingsForm {
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  allowed_languages: number[];
  time_limit: number;
  memory_limit: number;
  grading_strategy: 'ALL_OR_NOTHING' | 'PARTIAL_CREDIT' | 'BEST_SUBMISSION' | 'LATEST_SUBMISSION';
  execution_mode: 'FAST_FEEDBACK' | 'COMPLETE_FEEDBACK';
  allow_custom_input: boolean;
  points: number;
  starter_code: Record<string, string>;
  visible_tests: CodeChallengeTestCaseForm[];
  hidden_tests: CodeChallengeTestCaseForm[];
  hints: CodeChallengeHintForm[];
  lifecycle_status?: string;
  scheduled_at?: string | null;
  published_at?: string | null;
  archived_at?: string | null;
}

interface CodeChallengeStudioProps {
  activityUuid: string;
}

const DEFAULT_VALUES: CodeChallengeSettingsForm = {
  difficulty: 'EASY',
  allowed_languages: [71],
  time_limit: 2,
  memory_limit: 256,
  grading_strategy: 'PARTIAL_CREDIT',
  execution_mode: 'COMPLETE_FEEDBACK',
  allow_custom_input: true,
  points: 100,
  starter_code: {},
  visible_tests: [{ input: '', expected_output: '', is_visible: true, description: '', weight: 1 }],
  hidden_tests: [],
  hints: [],
  lifecycle_status: 'DRAFT',
};

export default function CodeChallengeStudio({ activityUuid }: CodeChallengeStudioProps) {
  const t = useTranslations('Activities.CodeChallenges');
  const { data: settings, isLoading } = useCodeChallengeSettings<Partial<CodeChallengeSettingsForm>>(activityUuid);
  const saveSettings = useSaveCodeChallengeSettings(activityUuid);
  const form = useForm<CodeChallengeSettingsForm>({ defaultValues: DEFAULT_VALUES });

  useEffect(() => {
    if (!settings) return;
    form.reset({
      ...DEFAULT_VALUES,
      ...settings,
      allowed_languages: settings.allowed_languages?.length
        ? settings.allowed_languages
        : DEFAULT_VALUES.allowed_languages,
      visible_tests: normalizeTests(settings.visible_tests, true, DEFAULT_VALUES.visible_tests),
      hidden_tests: normalizeTests(settings.hidden_tests, false, []),
      hints: (settings.hints ?? []).map((hint, index) => ({
        id: hint.id,
        order: hint.order ?? index + 1,
        content: hint.content ?? '',
        xp_penalty: hint.xp_penalty ?? 5,
      })),
      starter_code: settings.starter_code ?? {},
    });
  }, [form, settings]);

  const onSubmit = async (values: CodeChallengeSettingsForm) => {
    try {
      await saveSettings.mutateAsync({
        ...values,
        visible_tests: values.visible_tests.map((test) => ({ ...test, is_visible: true })),
        hidden_tests: values.hidden_tests.map((test) => ({ ...test, is_visible: false })),
        hints: values.hints.map((hint, index) => ({ ...hint, order: index + 1 })),
      });
      toast.success(t('configSaved'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('configSaveFailed'));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6 p-4 lg:p-6"
      >
        <LanguagePolicyPanel />
        <StarterCodeTabs />
        <TestCaseListEditor
          name="visible_tests"
          title={t('visibleTestCases')}
          visible
        />
        <TestCaseListEditor
          name="hidden_tests"
          title={t('hiddenTestCases')}
        />
        <HintsPanel />
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={saveSettings.isPending}
          >
            {saveSettings.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {t('saveConfig')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

function normalizeTests(
  tests: CodeChallengeTestCaseForm[] | undefined,
  isVisible: boolean,
  fallback: CodeChallengeTestCaseForm[],
) {
  const source = tests?.length ? tests : fallback;
  return source.map((test) =>
    Object.assign(test, {
      input: test.input ?? ``,
      expected_output: test.expected_output ?? ``,
      description: test.description ?? ``,
      weight: test.weight ?? 1,
      is_visible: isVisible,
    }),
  );
}
