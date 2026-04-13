'use client';

import { valibotResolver } from '@hookform/resolvers/valibot';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Grip, Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import * as v from 'valibot';

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ComboboxMultiple from '@/components/ui/custom/multiple-combobox';
import { Controller, FormProvider } from 'react-hook-form';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

import { JUDGE0_LANGUAGES } from './LanguageSelector';
import { generateUUID } from '@/lib/utils';
import { CodeEditor } from './CodeEditor';

// Form schema
const testCaseSchema = v.object({
  id: v.string(),
  input: v.string(),
  expected_output: v.pipe(v.string(), v.minLength(1)),
  description: v.optional(v.string()),
  is_visible: v.optional(v.boolean(), true),
  points: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(10_000)), 10),
});

const codeChallengeFormSchema = v.object({
  title: v.pipe(v.string(), v.minLength(1)),
  description: v.optional(v.string()),
  difficulty: v.picklist(['easy', 'medium', 'hard']),
  time_limit_ms: v.optional(v.pipe(v.number(), v.minValue(100), v.maxValue(30_000)), 2000),
  // memory_limit_kb is in KB. Increase default to 256MB and allow up to 2GB.
  memory_limit_kb: v.optional(v.pipe(v.number(), v.minValue(1024), v.maxValue(2_097_152)), 262_144),
  max_submissions: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(10_000))),
  grading_strategy: v.picklist(['all_or_nothing', 'partial', 'weighted']),
  allowed_languages: v.pipe(v.array(v.number()), v.minLength(1, 'At least one language is required')),
  test_cases: v.pipe(v.array(testCaseSchema), v.minLength(1, 'At least one test case is required')),
  enable_hints: v.optional(v.boolean(), false),
  hints: v.optional(
    v.array(
      v.object({
        text: v.string(),
        penalty_percent: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(100)), 10),
      }),
    ),
  ),
  starter_code: v.optional(v.record(v.string(), v.string())),
  solution_code: v.optional(v.record(v.string(), v.string())),
});

// Create a localized schema factory to supply messages from next-intl
export function createCodeChallengeFormSchema(t: (key: string, params?: any) => string) {
  const tc = v.object({
    id: v.string(),
    input: v.string(),
    expected_output: v.pipe(v.string(), v.minLength(1, t('validation.expectedOutputRequired'))),
    description: v.optional(v.string()),
    is_visible: v.optional(v.boolean(), true),
    points: v.optional(
      v.pipe(
        v.number(),
        v.minValue(0, t('validation.pointsRange', { min: 0, max: 10_000 })),
        v.maxValue(10_000, t('validation.pointsRange', { min: 0, max: 10_000 })),
      ),
      10,
    ),
  });

  return v.object({
    title: v.pipe(v.string(), v.minLength(1, t('validation.titleRequired'))),
    description: v.optional(v.string()),
    difficulty: v.picklist(['easy', 'medium', 'hard']),
    time_limit_ms: v.optional(
      v.pipe(
        v.number(),
        v.minValue(100, t('validation.timeLimitRange', { min: 100, max: 30_000 })),
        v.maxValue(30_000, t('validation.timeLimitRange', { min: 100, max: 30_000 })),
      ),
      2000,
    ),
    memory_limit_kb: v.optional(
      v.pipe(
        v.number(),
        v.minValue(1024, t('validation.memoryLimitRange', { min: 1024, max: 2_097_152 })),
        v.maxValue(2_097_152, t('validation.memoryLimitRange', { min: 1024, max: 2_097_152 })),
      ),
      262_144,
    ),
    max_submissions: v.optional(
      v.pipe(
        v.number(),
        v.minValue(0, t('validation.maxSubmissionsRange', { min: 0, max: 10_000 })),
        v.maxValue(10_000, t('validation.maxSubmissionsRange', { min: 0, max: 10_000 })),
      ),
    ),
    grading_strategy: v.picklist(['all_or_nothing', 'partial', 'weighted']),
    allowed_languages: v.pipe(v.array(v.number()), v.minLength(1, t('validation.atLeastOneLanguage'))),
    test_cases: v.pipe(v.array(tc), v.minLength(1, t('validation.atLeastOneTestCase'))),
    enable_hints: v.optional(v.boolean(), false),
    hints: v.optional(
      v.array(
        v.object({
          text: v.string(),
          penalty_percent: v.optional(
            v.pipe(
              v.number(),
              v.minValue(0, t('validation.penaltyRange', { min: 0, max: 100 })),
              v.maxValue(100, t('validation.penaltyRange', { min: 0, max: 100 })),
            ),
            10,
          ),
        }),
      ),
    ),
    starter_code: v.optional(v.record(v.string(), v.string())),
    solution_code: v.optional(v.record(v.string(), v.string())),
  });
}

// Use Valibot's input (pre-parse) type for form interactions and the inferred output type for the
// canonical, parsed form data we pass to the parent on submit.
type CodeChallengeFormInput = v.InferInput<typeof codeChallengeFormSchema>;
type CodeChallengeFormData = v.InferOutput<typeof codeChallengeFormSchema>;

interface CodeChallengeFormProps {
  activityUuid: string;
  // Accept partial input values (or parsed data - parsed data is assignable to input)
  initialData?: Partial<CodeChallengeFormInput>;
  onSubmit: (data: CodeChallengeFormData) => Promise<void>;
  onCancel?: () => void;
}

export function CodeChallengeForm({ activityUuid, initialData, onSubmit, onCancel }: CodeChallengeFormProps) {
  const t = useTranslations('Activities.CodeChallenges');

  const schema = useMemo(() => createCodeChallengeFormSchema(t), [t]);

  const form = useForm<CodeChallengeFormInput, any, CodeChallengeFormData>({
    resolver: valibotResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      difficulty: 'medium',
      time_limit_ms: 2000,
      memory_limit_kb: 262_144,
      grading_strategy: 'partial',
      allowed_languages: [71], // Python by default
      test_cases: [
        {
          id: generateUUID(),
          input: '',
          expected_output: '',
          description: '',
          is_visible: true,
          points: 10,
        },
      ],
      enable_hints: false,
      hints: [],
      starter_code: {},
      solution_code: {},
      ...initialData,
    },
  });

  const {
    fields: testCaseFields,
    append: appendTestCase,
    remove: removeTestCase,
    move: moveTestCase,
  } = useFieldArray({
    control: form.control,
    name: 'test_cases',
  });

  const {
    fields: hintFields,
    append: appendHint,
    remove: removeHint,
  } = useFieldArray({
    control: form.control,
    name: 'hints',
  });

  const watchAllowedLanguages = useWatch({ control: form.control, name: 'allowed_languages', defaultValue: [71] });
  const watchEnableHints = useWatch({ control: form.control, name: 'enable_hints', defaultValue: false });
  const watchGradingStrategy = useWatch({
    control: form.control,
    name: 'grading_strategy',
    defaultValue: 'partial',
  });

  // Use item arrays for Select components so we follow the shared pattern and keep labels localized.
  const difficultyItems = [
    {
      value: 'easy',
      label: (
        <span className="flex items-center gap-2">
          <Badge variant="success">{t('difficulty.easy')}</Badge>
        </span>
      ),
    },
    {
      value: 'medium',
      label: (
        <span className="flex items-center gap-2">
          <Badge variant="warning">{t('difficulty.medium')}</Badge>
        </span>
      ),
    },
    {
      value: 'hard',
      label: (
        <span className="flex items-center gap-2">
          <Badge variant="destructive">{t('difficulty.hard')}</Badge>
        </span>
      ),
    },
  ];

  const gradingStrategyItems = [
    { value: 'all_or_nothing', label: t('gradingStrategyOptions.allOrNothing') },
    { value: 'partial', label: t('gradingStrategyOptions.partial') },
    { value: 'weighted', label: t('gradingStrategyOptions.weighted') },
  ];

  // Compute a safe default language id for the language Tabs (avoid undefined access)
  const defaultLanguageId = watchAllowedLanguages?.[0] ?? JUDGE0_LANGUAGES?.[0]?.id ?? 71;

  const handleFormSubmit = async (data: CodeChallengeFormData) => {
    try {
      await onSubmit(data);
      toast.success(t('challengeSaved'));
    } catch (error) {
      toast.error(t('saveFailed'));
      throw error;
    }
  };

  const addTestCase = useCallback(() => {
    appendTestCase({
      id: generateUUID(),
      input: '',
      expected_output: '',
      description: '',
      is_visible: true,
      points: 10,
    });
  }, [appendTestCase]);

  const addHint = useCallback(() => {
    appendHint({
      text: '',
      penalty_percent: 10,
    });
  }, [appendHint]);

  // Popular languages for quick selection
  const popularLanguageIds = [71, 62, 63, 54, 51, 60, 68, 73, 74, 78];

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(handleFormSubmit)}
        className="space-y-6"
      >
        <Tabs
          defaultValue="basic"
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">{t('form.basicInfo')}</TabsTrigger>
            <TabsTrigger value="testcases">{t('form.testCases')}</TabsTrigger>
            <TabsTrigger value="languages">{t('form.languages')}</TabsTrigger>
            <TabsTrigger value="advanced">{t('form.advanced')}</TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent
            value="basic"
            className="space-y-4 pt-4"
          >
            <Controller
              control={form.control}
              name="title"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>{t('form.title')}</FieldLabel>
                  <FieldContent>
                    <Input
                      placeholder={t('form.titlePlaceholder')}
                      {...field}
                    />
                  </FieldContent>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="description"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>{t('form.description')}</FieldLabel>
                  <FieldContent>
                    <Textarea
                      placeholder={t('form.descriptionPlaceholder')}
                      className="min-h-32"
                      {...field}
                    />
                  </FieldContent>
                  <FieldDescription>{t('form.descriptionHint')}</FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Controller
                control={form.control}
                name="difficulty"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>{t('form.difficulty')}</FieldLabel>
                    <Select
                      items={difficultyItems}
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FieldContent>
                        <SelectTrigger>
                          <SelectValue placeholder={t('form.selectDifficulty')} />
                        </SelectTrigger>
                      </FieldContent>
                      <SelectContent>
                        <SelectGroup>
                          {difficultyItems.map((item) => (
                            <SelectItem
                              key={item.value}
                              value={item.value}
                            >
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <Controller
                control={form.control}
                name="grading_strategy"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>{t('form.gradingStrategy')}</FieldLabel>
                    <Select
                      items={gradingStrategyItems}
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FieldContent>
                        <SelectTrigger>
                          <SelectValue placeholder={t('form.selectGradingStrategy')} />
                        </SelectTrigger>
                      </FieldContent>
                      <SelectContent>
                        <SelectGroup>
                          {gradingStrategyItems.map((item) => (
                            <SelectItem
                              key={item.value}
                              value={item.value}
                            >
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>{t(`gradingStrategyOptions.${field.value}Hint`)}</FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Controller
                control={form.control}
                name="time_limit_ms"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>{t('form.timeLimit')}</FieldLabel>
                    <FieldContent>
                      <Input
                        type="number"
                        min={100}
                        max={30_000}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value === '' ? undefined : Number.parseInt(e.target.value, 10))
                        }
                      />
                    </FieldContent>
                    <FieldDescription>{t('form.timeLimitHint')}</FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <Controller
                control={form.control}
                name="memory_limit_kb"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>{t('form.memoryLimit')}</FieldLabel>
                    <FieldContent>
                      <Input
                        type="number"
                        min={1024}
                        max={2_097_152}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value === '' ? undefined : Number.parseInt(e.target.value, 10))
                        }
                      />
                    </FieldContent>
                    <FieldDescription>{t('form.memoryLimitHint')}</FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
          </TabsContent>

          {/* Test Cases Tab */}
          <TabsContent
            value="testcases"
            className="space-y-4 pt-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">{t('form.testCases')}</h3>
                <p className="text-muted-foreground text-sm">{t('form.testCasesDescription')}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={addTestCase}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('form.addTestCase')}
              </Button>
            </div>

            <div className="space-y-4">
              {testCaseFields.map((field, index) => (
                <Card key={field.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Grip className="text-muted-foreground h-4 w-4 cursor-move" />
                        <CardTitle className="text-sm">
                          {t('testCase')} #{index + 1}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <Controller
                          control={form.control}
                          name={`test_cases.${index}.is_visible`}
                          render={({ field }) => (
                            <Field className="flex items-center gap-2 space-y-0">
                              <FieldContent>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FieldContent>
                              <FieldLabel className="text-xs font-normal">{t('form.visible')}</FieldLabel>
                            </Field>
                          )}
                        />
                        {testCaseFields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTestCase(index)}
                          >
                            <Trash2 className="text-destructive h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Controller
                      control={form.control}
                      name={`test_cases.${index}.description`}
                      render={({ field, fieldState }) => (
                        <Field>
                          <FieldLabel>{t('form.testDescription')}</FieldLabel>
                          <FieldContent>
                            <Input
                              placeholder={t('form.testDescriptionPlaceholder')}
                              {...field}
                            />
                          </FieldContent>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <Controller
                        control={form.control}
                        name={`test_cases.${index}.input`}
                        render={({ field, fieldState }) => (
                          <Field>
                            <FieldLabel>{t('input')}</FieldLabel>
                            <FieldContent>
                              <Textarea
                                placeholder={t('form.inputPlaceholder')}
                                className="min-h-24 font-mono text-sm"
                                {...field}
                              />
                            </FieldContent>
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />

                      <Controller
                        control={form.control}
                        name={`test_cases.${index}.expected_output`}
                        render={({ field, fieldState }) => (
                          <Field>
                            <FieldLabel>{t('expectedOutput')}</FieldLabel>
                            <FieldContent>
                              <Textarea
                                placeholder={t('form.expectedOutputPlaceholder')}
                                className="min-h-24 font-mono text-sm"
                                {...field}
                              />
                            </FieldContent>
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />
                    </div>

                    {watchGradingStrategy === 'weighted' && (
                      <Controller
                        control={form.control}
                        name={`test_cases.${index}.points`}
                        render={({ field, fieldState }) => (
                          <Field className="max-w-32">
                            <FieldLabel>{t('form.points')}</FieldLabel>
                            <FieldContent>
                              <Input
                                type="number"
                                min={0}
                                max={10_000}
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value === '' ? undefined : Number.parseInt(e.target.value, 10),
                                  )
                                }
                              />
                            </FieldContent>
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Languages Tab */}
          <TabsContent
            value="languages"
            className="space-y-4 pt-4"
          >
            <Controller
              control={form.control}
              name="allowed_languages"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>{t('form.allowedLanguages')}</FieldLabel>
                  <FieldDescription>{t('form.allowedLanguagesHint')}</FieldDescription>

                  {/* Quick selection for popular languages */}
                  <div className="mb-4">
                    <h4 className="mb-2 text-sm font-medium">{t('popularLanguages')}</h4>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {popularLanguageIds.map((langId) => {
                        const lang = JUDGE0_LANGUAGES.find((l) => l.id === langId);
                        if (!lang) return null;
                        const isSelected = (field.value ?? []).includes(langId);
                        return (
                          <Badge
                            key={langId}
                            variant={isSelected ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => {
                              if (isSelected) {
                                field.onChange((field.value ?? []).filter((id) => id !== langId));
                              } else {
                                field.onChange([...(field.value ?? []), langId]);
                              }
                            }}
                          >
                            {lang.name}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  <Separator />

                  <div className="mt-4">
                    <ComboboxMultiple<{ id: number; name: string }>
                      options={JUDGE0_LANGUAGES}
                      value={field.value}
                      onChange={(vals) => field.onChange(vals as number[])}
                      getOptionValue={(o) => o.id}
                      getOptionLabel={(o) => o.name}
                      placeholder={t('form.selectLanguages')}
                      searchPlaceholder={t('form.searchLanguages')}
                      emptyMessage={t('form.noLanguagesFound')}
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const allIds = JUDGE0_LANGUAGES.map((l) => l.id);
                          field.onChange(allIds);
                        }}
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
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            {/* Starter code per language */}
            {watchAllowedLanguages.length > 0 && (
              <div className="space-y-4 pt-4">
                <Separator />
                <div>
                  <h3 className="text-lg font-medium">{t('form.starterCode')}</h3>
                  <p className="text-muted-foreground text-sm">{t('form.starterCodeHint')}</p>
                </div>
                <Tabs defaultValue={defaultLanguageId.toString()}>
                  <TabsList className="flex-wrap">
                    {watchAllowedLanguages.map((langId) => {
                      const lang = JUDGE0_LANGUAGES.find((l) => l.id === langId);
                      return (
                        <TabsTrigger
                          key={langId}
                          value={langId.toString()}
                        >
                          {lang?.name ?? `Language ${langId}`}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                  {watchAllowedLanguages.map((langId) => (
                    <TabsContent
                      key={langId}
                      value={langId.toString()}
                    >
                      <Controller
                        control={form.control}
                        name={`starter_code.${langId}`}
                        render={({ field, fieldState }) => (
                          <Field>
                            <FieldContent>
                              <div className="h-48 overflow-hidden rounded border">
                                <CodeEditor
                                  value={field.value ?? ''}
                                  onChange={field.onChange}
                                  languageId={langId}
                                />
                              </div>
                            </FieldContent>
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            )}
          </TabsContent>

          {/* Advanced Tab */}
          <TabsContent
            value="advanced"
            className="space-y-4 pt-4"
          >
            <Controller
              control={form.control}
              name="max_submissions"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>{t('form.maxSubmissions')}</FieldLabel>
                  <FieldContent>
                    <Input
                      type="number"
                      min={0}
                      max={10_000}
                      placeholder={t('form.unlimitedSubmissions')}
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value ? Number.parseInt(e.target.value) : undefined)}
                    />
                  </FieldContent>
                  <FieldDescription>{t('form.maxSubmissionsHint')}</FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Separator />

            {/* Hints Section */}
            <Controller
              control={form.control}
              name="enable_hints"
              render={({ field }) => (
                <Field className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FieldLabel className="text-base">{t('form.enableHints')}</FieldLabel>
                    <FieldDescription>{t('form.enableHintsDescription')}</FieldDescription>
                  </div>
                  <FieldContent>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FieldContent>
                </Field>
              )}
            />

            {watchEnableHints && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">{t('form.hints')}</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addHint}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t('form.addHint')}
                  </Button>
                </div>
                {hintFields.map((field, index) => (
                  <Card key={field.id}>
                    <CardContent className="pt-4">
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <Controller
                            control={form.control}
                            name={`hints.${index}.text`}
                            render={({ field, fieldState }) => (
                              <Field>
                                <FieldLabel>
                                  {t('form.hint')} #{index + 1}
                                </FieldLabel>
                                <FieldContent>
                                  <Textarea
                                    placeholder={t('form.hintPlaceholder')}
                                    {...field}
                                  />
                                </FieldContent>
                                <FieldError errors={[fieldState.error]} />
                              </Field>
                            )}
                          />
                        </div>
                        <div className="w-32">
                          <Controller
                            control={form.control}
                            name={`hints.${index}.penalty_percent`}
                            render={({ field, fieldState }) => (
                              <Field>
                                <FieldLabel>{t('form.penalty')}</FieldLabel>
                                <FieldContent>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    {...field}
                                    value={field.value ?? ''}
                                    onChange={(e) =>
                                      field.onChange(
                                        e.target.value === '' ? undefined : Number.parseInt(e.target.value, 10),
                                      )
                                    }
                                  />
                                </FieldContent>
                                <FieldDescription>%</FieldDescription>
                                <FieldError errors={[fieldState.error]} />
                              </Field>
                            )}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-8"
                          onClick={() => removeHint(index)}
                        >
                          <Trash2 className="text-destructive h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Form Actions */}
        <div className="flex justify-end gap-4 pt-4">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
            >
              {t('form.cancel')}
            </Button>
          )}
          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? t('form.saving') : t('form.save')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

export default CodeChallengeForm;
