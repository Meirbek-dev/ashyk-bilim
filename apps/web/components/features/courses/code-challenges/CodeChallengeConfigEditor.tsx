'use client';

import { ArrowLeft, Eye, EyeOff, Loader2, Plus, Trash2 } from 'lucide-react';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  useCodeChallengeSettings,
  useSaveCodeChallengeSettings,
} from '@/features/code-challenges/hooks/useCodeChallenge';
import * as v from 'valibot';

import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import ComboboxMultiple from '@/components/ui/custom/multiple-combobox';
import { JUDGE0_LANGUAGES } from './LanguageSelector';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Controller } from 'react-hook-form';

interface CodeChallengeConfigEditorProps {
  activityUuid: string;
  courseId: string;
}

const testCaseSchema = v.object({
  id: v.optional(v.string()),
  input: v.string(),
  expected_output: v.string(),
  is_visible: v.boolean(),
  description: v.optional(v.string()),
  weight: v.pipe(v.number(), v.minValue(1), v.maxValue(100)),
});

const formSchema = v.object({
  allowed_languages: v.pipe(v.array(v.number()), v.minLength(1)),
  time_limit: v.pipe(v.number(), v.minValue(1), v.maxValue(60)),
  memory_limit: v.pipe(v.number(), v.minValue(16), v.maxValue(2048)),
  grading_strategy: v.picklist(['ALL_OR_NOTHING', 'PARTIAL_CREDIT', 'BEST_SUBMISSION', 'LATEST_SUBMISSION']),
  execution_mode: v.picklist(['FAST_FEEDBACK', 'COMPLETE_FEEDBACK']),
  allow_custom_input: v.boolean(),
  points: v.pipe(v.number(), v.minValue(0), v.maxValue(10_000)),
  visible_tests: v.array(testCaseSchema),
  hidden_tests: v.array(testCaseSchema),
});

// Create a schema factory that accepts the translation function so validation messages are localized
export function createConfigFormSchema(t: (key: string, params?: any) => string) {
  const tc = v.object({
    id: v.optional(v.string()),
    input: v.string(),
    expected_output: v.string(),
    is_visible: v.boolean(),
    description: v.optional(v.string()),
    weight: v.pipe(
      v.number(),
      v.minValue(1, t('validation.testWeightRange', { min: 1, max: 100 })),
      v.maxValue(100, t('validation.testWeightRange', { min: 1, max: 100 })),
    ),
  });

  return v.object({
    allowed_languages: v.pipe(v.array(v.number()), v.minLength(1, t('validation.atLeastOneLanguage'))),
    time_limit: v.pipe(
      v.number(),
      v.minValue(1, t('validation.timeLimitRange', { min: 1, max: 60 })),
      v.maxValue(60, t('validation.timeLimitRange', { min: 1, max: 60 })),
    ),
    memory_limit: v.pipe(
      v.number(),
      v.minValue(16, t('validation.memoryLimitRange', { min: 16, max: 2048 })),
      v.maxValue(2048, t('validation.memoryLimitRange', { min: 16, max: 2048 })),
    ),
    grading_strategy: v.picklist(['ALL_OR_NOTHING', 'PARTIAL_CREDIT', 'BEST_SUBMISSION', 'LATEST_SUBMISSION']),
    execution_mode: v.picklist(['FAST_FEEDBACK', 'COMPLETE_FEEDBACK']),
    allow_custom_input: v.boolean(),
    points: v.pipe(
      v.number(),
      v.minValue(0, t('validation.pointsRange', { min: 0, max: 10_000 })),
      v.maxValue(10_000, t('validation.pointsRange', { min: 0, max: 10_000 })),
    ),
    visible_tests: v.array(tc),
    hidden_tests: v.array(tc),
  });
}

type FormValues = v.InferOutput<typeof formSchema>;
type FormInputValues = v.InferInput<typeof formSchema>;
type ExistingSettings = FormValues;

export default function CodeChallengeConfigEditor({ activityUuid, courseId }: CodeChallengeConfigEditorProps) {
  const t = useTranslations('Activities.CodeChallenges');
  const router = useRouter();
  const saveSettingsMutation = useSaveCodeChallengeSettings(activityUuid);
  const isSaving = saveSettingsMutation.isPending;

  // Fetch existing settings
  const { data: existingSettings, isLoading } = useCodeChallengeSettings<ExistingSettings>(activityUuid);

  const schema = useMemo(() => createConfigFormSchema(t), [t]);

  const form = useForm<FormInputValues, any, FormValues>({
    resolver: valibotResolver(schema),
    defaultValues: {
      allowed_languages: [71],
      time_limit: 2,
      memory_limit: 256,
      grading_strategy: 'PARTIAL_CREDIT',
      execution_mode: 'COMPLETE_FEEDBACK',
      allow_custom_input: true,
      points: 100,
      visible_tests: [{ input: '', expected_output: '', is_visible: true, description: '', weight: 1 }],
      hidden_tests: [],
    },
  });

  // Items for selects
  const gradingStrategyItems = [
    { value: 'ALL_OR_NOTHING', label: t('allOrNothing') },
    { value: 'PARTIAL_CREDIT', label: t('partialCredit') },
    { value: 'BEST_SUBMISSION', label: t('bestSubmission') },
    { value: 'LATEST_SUBMISSION', label: t('latestSubmission') },
  ];

  const {
    fields: visibleTestFields,
    append: appendVisibleTest,
    remove: removeVisibleTest,
  } = useFieldArray({
    control: form.control,
    name: 'visible_tests',
  });

  const {
    fields: hiddenTestFields,
    append: appendHiddenTest,
    remove: removeHiddenTest,
  } = useFieldArray({
    control: form.control,
    name: 'hidden_tests',
  });

  const visibleTests = useWatch({ control: form.control, name: 'visible_tests', defaultValue: [] });
  const hiddenTests = useWatch({ control: form.control, name: 'hidden_tests', defaultValue: [] });

  // Controlled accordion state to avoid changing defaultValue after initialization
  const [visibleAccordionValue, setVisibleAccordionValue] = useState(visibleTestFields.map((_, i) => `visible-${i}`));
  useEffect(() => {
    // Keep panels in sync when fields are added/removed; open all by default
    setVisibleAccordionValue(visibleTestFields.map((_, i) => `visible-${i}`));
  }, [visibleTestFields, visibleTestFields.length]);

  const [hiddenAccordionValue, setHiddenAccordionValue] = useState(hiddenTestFields.map((_, i) => `hidden-${i}`));
  useEffect(() => {
    setHiddenAccordionValue(hiddenTestFields.map((_, i) => `hidden-${i}`));
  }, [hiddenTestFields, hiddenTestFields.length]);

  // Populate form when existing settings are loaded
  useEffect(() => {
    if (existingSettings) {
      const visibleTests =
        existingSettings.visible_tests?.map((tc: any) => ({
          ...tc,
          is_visible: true,
        })) || [];
      const hiddenTests =
        existingSettings.hidden_tests?.map((tc: any) => ({
          ...tc,
          is_visible: false,
        })) || [];

      form.reset({
        allowed_languages: existingSettings.allowed_languages || [71],
        time_limit: existingSettings.time_limit || 2,
        memory_limit: existingSettings.memory_limit || 256,
        grading_strategy: existingSettings.grading_strategy || 'PARTIAL_CREDIT',
        execution_mode: existingSettings.execution_mode || 'COMPLETE_FEEDBACK',
        allow_custom_input: existingSettings.allow_custom_input ?? true,
        points: existingSettings.points || 100,
        visible_tests:
          visibleTests.length > 0
            ? visibleTests
            : [{ input: '', expected_output: '', is_visible: true, description: '', weight: 1 }],
        hidden_tests: hiddenTests,
      });
    }
  }, [existingSettings, form]);

  const onSubmit = async (values: FormValues) => {
    const loadingToast = toast.loading(t('savingConfig'));

    try {
      await saveSettingsMutation.mutateAsync({
        allowed_languages: values.allowed_languages,
        time_limit: values.time_limit,
        memory_limit: values.memory_limit,
        grading_strategy: values.grading_strategy,
        execution_mode: values.execution_mode,
        allow_custom_input: values.allow_custom_input,
        points: values.points,
        visible_tests: values.visible_tests.map((tc) => ({
          ...tc,
          is_visible: true,
        })),
        hidden_tests: values.hidden_tests.map((tc) => ({
          ...tc,
          is_visible: false,
        })),
      });

      toast.success(t('configSaved'), { id: loadingToast });
      router.back();
    } catch (error) {
      console.error('Error saving configuration:', error);
      toast.error(error instanceof Error ? error.message : t('configSaveFailed'), {
        id: loadingToast,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{t('configureChallenge')}</h1>
          <p className="text-muted-foreground text-sm">{t('configureDescription')}</p>
        </div>
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
      >
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle>{t('generalSettings')}</CardTitle>
            <CardDescription>{t('generalSettingsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Allowed Languages */}
            <Controller
              control={form.control}
              name="allowed_languages"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>{t('allowedLanguages')}</FieldLabel>
                  <div className="space-y-2">
                    <ComboboxMultiple<{ id: number; name: string }>
                      options={JUDGE0_LANGUAGES}
                      value={field.value}
                      onChange={(vals) => field.onChange(vals as number[])}
                      getOptionValue={(o) => o.id}
                      getOptionLabel={(o) => o.name}
                      placeholder={t('selectLanguages')}
                      searchPlaceholder={t('searchLanguages')}
                      emptyMessage={t('noLanguagesFound')}
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => field.onChange(JUDGE0_LANGUAGES.map((l) => l.id))}
                        disabled={(field.value ?? []).length >= JUDGE0_LANGUAGES.length}
                      >
                        {t('selectAll')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => field.onChange([])}
                        disabled={(field.value ?? []).length === 0}
                      >
                        {t('deselectAll')}
                      </Button>
                    </div>
                  </div>
                  <FieldDescription>{t('allowedLanguagesDescription')}</FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              {/* Time Limit */}
              <Controller
                control={form.control}
                name="time_limit"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>{t('timeLimit')}</FieldLabel>
                    <Input
                      id={field.name}
                      type="number"
                      min={1}
                      max={60}
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                    <FieldDescription>{t('timeLimitDescription')}</FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              {/* Memory Limit */}
              <Controller
                control={form.control}
                name="memory_limit"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>{t('memoryLimit')}</FieldLabel>
                    <Input
                      id={field.name}
                      type="number"
                      min={16}
                      max={2048}
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                    <FieldDescription>{t('memoryLimitDescription')}</FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Points */}
              <Controller
                control={form.control}
                name="points"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>{t('points')}</FieldLabel>
                    <Input
                      id={field.name}
                      type="number"
                      min={0}
                      max={10_000}
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                    <FieldDescription>{t('pointsDescription')}</FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              {/* Grading Strategy */}
              <Controller
                control={form.control}
                name="grading_strategy"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>{t('gradingStrategyLabel')}</FieldLabel>
                    <NativeSelect
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      className="w-full"
                      aria-label={t('gradingStrategyLabel')}
                    >
                      {gradingStrategyItems.map((item) => (
                        <NativeSelectOption
                          key={item.value}
                          value={item.value}
                        >
                          {item.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldDescription>{t('gradingStrategyDescription')}</FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>

            {/* Allow Custom Input */}
            <Controller
              control={form.control}
              name="allow_custom_input"
              render={({ field }) => (
                <Field className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FieldLabel className="text-base">{t('allowCustomInput')}</FieldLabel>
                    <FieldDescription>{t('allowCustomInputDescription')}</FieldDescription>
                  </div>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </Field>
              )}
            />
          </CardContent>
        </Card>

        {/* Visible Test Cases */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  {t('visibleTestCases')}
                </CardTitle>
                <CardDescription>{t('visibleTestCasesDescription')}</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  appendVisibleTest({
                    input: '',
                    expected_output: '',
                    is_visible: true,
                    description: '',
                    weight: 1,
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('addTestCase')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Accordion
              className="w-full"
              multiple
              value={visibleAccordionValue}
              onValueChange={(v) => setVisibleAccordionValue(Array.isArray(v) ? v : [v])}
            >
              {visibleTestFields.map((field, index) => (
                <AccordionItem
                  key={field.id}
                  value={`visible-${index}`}
                >
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span>
                        {t('testCase')} #{index + 1}
                      </span>
                      {visibleTests[index]?.description && (
                        <span className="text-muted-foreground text-sm">- {visibleTests[index]?.description}</span>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 px-1 pt-4">
                    <Controller
                      control={form.control}
                      name={`visible_tests.${index}.description`}
                      render={({ field }) => (
                        <Field>
                          <FieldLabel htmlFor={field.name}>{t('testDescription')}</FieldLabel>
                          <Input
                            id={field.name}
                            placeholder={t('testDescriptionPlaceholder')}
                            {...field}
                          />
                        </Field>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <Controller
                        control={form.control}
                        name={`visible_tests.${index}.input`}
                        render={({ field }) => (
                          <Field>
                            <FieldLabel htmlFor={field.name}>{t('input')}</FieldLabel>
                            <Textarea
                              id={field.name}
                              placeholder={t('inputPlaceholder')}
                              className="font-mono"
                              rows={4}
                              {...field}
                            />
                          </Field>
                        )}
                      />
                      <Controller
                        control={form.control}
                        name={`visible_tests.${index}.expected_output`}
                        render={({ field }) => (
                          <Field>
                            <FieldLabel htmlFor={field.name}>{t('expectedOutput')}</FieldLabel>
                            <Textarea
                              id={field.name}
                              placeholder={t('expectedOutputPlaceholder')}
                              className="font-mono"
                              rows={4}
                              {...field}
                            />
                          </Field>
                        )}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => removeVisibleTest(index)}
                        disabled={visibleTestFields.length === 1}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('removeTestCase')}
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* Hidden Test Cases */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <EyeOff className="h-5 w-5" />
                  {t('hiddenTestCases')}
                </CardTitle>
                <CardDescription>{t('hiddenTestCasesDescription')}</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  appendHiddenTest({
                    input: '',
                    expected_output: '',
                    is_visible: false,
                    description: '',
                    weight: 1,
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('addTestCase')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {hiddenTestFields.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">{t('noHiddenTestCases')}</p>
            ) : (
              <Accordion
                className="w-full"
                multiple
                value={hiddenAccordionValue}
                onValueChange={(v) => setHiddenAccordionValue(Array.isArray(v) ? v : [v])}
              >
                {hiddenTestFields.map((field, index) => (
                  <AccordionItem
                    key={field.id}
                    value={`hidden-${index}`}
                  >
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <span>
                          {t('hiddenTest')} #{index + 1}
                        </span>
                        {hiddenTests[index]?.description && (
                          <span className="text-muted-foreground text-sm">- {hiddenTests[index]?.description}</span>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 px-1 pt-4">
                      <Controller
                        control={form.control}
                        name={`hidden_tests.${index}.description`}
                        render={({ field }) => (
                          <Field>
                            <FieldLabel htmlFor={field.name}>{t('testDescription')}</FieldLabel>
                            <Input
                              id={field.name}
                              placeholder={t('testDescriptionPlaceholder')}
                              {...field}
                            />
                          </Field>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <Controller
                          control={form.control}
                          name={`hidden_tests.${index}.input`}
                          render={({ field }) => (
                            <Field>
                              <FieldLabel htmlFor={field.name}>{t('input')}</FieldLabel>
                              <Textarea
                                id={field.name}
                                placeholder={t('inputPlaceholder')}
                                className="font-mono"
                                rows={4}
                                {...field}
                              />
                            </Field>
                          )}
                        />
                        <Controller
                          control={form.control}
                          name={`hidden_tests.${index}.expected_output`}
                          render={({ field }) => (
                            <Field>
                              <FieldLabel htmlFor={field.name}>{t('expectedOutput')}</FieldLabel>
                              <Textarea
                                id={field.name}
                                placeholder={t('expectedOutputPlaceholder')}
                                className="font-mono"
                                rows={4}
                                {...field}
                              />
                            </Field>
                          )}
                        />
                      </div>
                      <Controller
                        control={form.control}
                        name={`hidden_tests.${index}.weight`}
                        render={({ field, fieldState }) => (
                          <Field>
                            <FieldLabel htmlFor={field.name}>{t('testWeight')}</FieldLabel>
                            <Input
                              id={field.name}
                              type="number"
                              min={1}
                              max={100}
                              className="w-24"
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                            />
                            <FieldDescription>{t('testWeightDescription')}</FieldDescription>
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => removeHiddenTest(index)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('removeTestCase')}
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSaving}
          >
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            disabled={isSaving}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('saveConfig')}
          </Button>
        </div>
      </form>
    </div>
  );
}
