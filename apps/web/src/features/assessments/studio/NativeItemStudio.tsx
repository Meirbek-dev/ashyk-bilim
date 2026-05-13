'use client';

import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Copy,
  FileUp,
  GitCompareArrows,
  ListTodo,
  LoaderCircle,
  Rows3,
  ShieldAlert,
  Sparkles,
  TextCursorInput,
  Trash2,
} from 'lucide-react';
import { useQuery, useQueryClient, queryOptions } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { apiFetch, apiFetcher } from '@/lib/api-client';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { KindAuthorProps } from '@/features/assessments/registry';
import type { AssessmentItem } from '@/features/assessments/domain/items';
import type { UnifiedItemKind } from '@/features/assessments/domain/items';
import { isAssessmentEditable } from '@/features/assessments/domain/lifecycle';
import {
  classifyValidationIssue,
  dedupeIssues,
  itemIssues as persistedItemIssues,
  localItemValidationIssues,
} from '@/features/assessments/domain/readiness';
import type { ValidationIssue } from '@/features/assessments/domain/view-models';
import { ChoiceItemAuthor } from '@/features/assessments/items/choice';
import type { ChoiceAuthorValue } from '@/features/assessments/items/choice';
import { FileUploadConstraintsEditor } from '@/features/assessments/items/file-upload';
import type { FileUploadConstraints } from '@/features/assessments/items/file-upload';
import SaveStateBadge from '@/features/assessments/shared/SaveStateBadge';
import type { SaveState } from '@/features/assessments/shared/SaveStateBadge';
import ErrorUI from '@/components/Objects/Elements/Error/Error';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type SupportedStudioItemKind = Exclude<UnifiedItemKind, 'CODE'>;
type StudioMode = 'assignment' | 'exam';

interface AssessmentPolicyDetail {
  due_at?: string | null;
  max_attempts?: number | null;
  time_limit_seconds?: number | null;
  anti_cheat_json?: Record<string, unknown> | null;
  late_policy_json?: Record<string, unknown> | null;
  settings_json?: Record<string, unknown> | null;
}

interface AssessmentStudioDetail {
  assessment_uuid: string;
  activity_uuid: string;
  course_uuid?: string | null;
  kind: 'ASSIGNMENT' | 'EXAM' | 'CODE_CHALLENGE' | 'QUIZ';
  title: string;
  description: string;
  lifecycle: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
  grading_type: 'NUMERIC' | 'PERCENTAGE';
  items: AssessmentItem[];
  assessment_policy?: AssessmentPolicyDetail | null;
}

interface StudioReadinessPayload {
  issues: { code: string; message: string; item_uuid?: string | null }[];
}

interface AssessmentStudioContextValue {
  activityUuid: string;
  assessment: AssessmentStudioDetail;
  items: AssessmentItem[];
  selectedItemUuid: string | null;
  setSelectedItemUuid: (uuid: string | null) => void;
  refresh: () => Promise<void>;
  isEditable: boolean;
  totalPoints: number;
  validationIssues: ValidationIssue[];
}

const AssessmentStudioContext = createContext<AssessmentStudioContextValue | null>(null);

const KIND_ICONS: Record<SupportedStudioItemKind, typeof ListTodo> = {
  CHOICE: ListTodo,
  OPEN_TEXT: BookOpen,
  FILE_UPLOAD: FileUp,
  FORM: TextCursorInput,
  MATCHING: GitCompareArrows,
};

export function NativeItemStudioProvider({ activityUuid, children }: KindAuthorProps & { children: React.ReactNode }) {
  const normalizedActivityUuid = activityUuid.replace(/^activity_/, '');
  const queryClient = useQueryClient();
  const {
    data: assessment,
    isLoading,
    error,
  } = useQuery(
    queryOptions({
      queryKey: queryKeys.assessments.activity(normalizedActivityUuid),
      queryFn: () => apiFetcher<AssessmentStudioDetail>(`assessments/activity/${normalizedActivityUuid}`),
      enabled: Boolean(normalizedActivityUuid),
    }),
  );

  const [selectedItemUuid, setSelectedItemUuid] = useState<string | null>(null);
  const readinessQuery = useQuery(
    queryOptions({
      queryKey: queryKeys.assessments.readiness(assessment?.assessment_uuid ?? ''),
      queryFn: () => apiFetcher<StudioReadinessPayload>(`assessments/${assessment?.assessment_uuid}/readiness`),
      enabled: Boolean(assessment?.assessment_uuid),
      retry: false,
    }),
  );

  useEffect(() => {
    if (!assessment?.items?.length) {
      setSelectedItemUuid(null);
      return;
    }

    if (!selectedItemUuid || !assessment.items.some((item) => item.item_uuid === selectedItemUuid)) {
      setSelectedItemUuid(assessment.items[0]?.item_uuid ?? null);
    }
  }, [assessment?.items, selectedItemUuid]);

  const refresh = useCallback(async () => {
    if (!assessment) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.assessments.activity(normalizedActivityUuid) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assessments.detail(assessment.assessment_uuid) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assessments.readiness(assessment.assessment_uuid) }),
    ]);
  }, [assessment, normalizedActivityUuid, queryClient]);

  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio');

  if (error) return <ErrorUI message={t('errorLoading')} />;
  if (isLoading || !assessment) return <PageLoading />;

  const items = Array.isArray(assessment.items) ? assessment.items : [];
  const totalPoints = items.reduce((sum, item) => sum + (item.max_score || 0), 0);
  const isEditable = isAssessmentEditable(assessment.lifecycle);
  const validationIssues =
    readinessQuery.data?.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      itemUuid: issue.item_uuid ?? undefined,
    })) ?? [];

  return (
    <AssessmentStudioContext.Provider
      value={{
        activityUuid: normalizedActivityUuid,
        assessment,
        items,
        selectedItemUuid,
        setSelectedItemUuid,
        refresh,
        isEditable,
        totalPoints,
        validationIssues,
      }}
    >
      {children}
    </AssessmentStudioContext.Provider>
  );
}

function useAssessmentStudioContext() {
  const context = useContext(AssessmentStudioContext);
  if (!context) {
    throw new Error('useAssessmentStudioContext must be used inside NativeItemStudioProvider');
  }
  return context;
}

export function NativeItemOutline({
  allowedKinds,
  itemNoun,
  itemNounKey,
}: {
  allowedKinds: SupportedStudioItemKind[];
  itemNoun: string;
  itemNounKey?: 'question' | 'task';
}) {
  const {
    assessment,
    items,
    selectedItemUuid,
    setSelectedItemUuid,
    refresh,
    isEditable,
    totalPoints,
    validationIssues,
  } = useAssessmentStudioContext();
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio');
  const displayItemNoun = itemNounKey ? t(`itemNouns.${itemNounKey}` as any) : itemNoun;
  const kindLabels: Record<SupportedStudioItemKind, string> = {
    CHOICE: t('kindLabels.choice'),
    OPEN_TEXT: t('kindLabels.openText'),
    FILE_UPLOAD: t('kindLabels.fileUpload'),
    FORM: t('kindLabels.form'),
    MATCHING: t('kindLabels.matching'),
  };
  const [isCreating, startTransition] = useTransition();

  const createItem = (kind: SupportedStudioItemKind) => {
    startTransition(async () => {
      try {
        const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildDefaultItemPayload(kind, t('defaultItemTitle'))),
        });

        if (!response.ok) {
          throw new Error(
            await responseError(response, t('createFailed', { itemNoun: displayItemNoun.toLowerCase() })),
          );
        }

        const created = (await response.json()) as { item_uuid?: string };
        toast.success(t('itemCreated', { itemNoun: displayItemNoun }));
        await refresh();
        if (typeof created.item_uuid === 'string') {
          setSelectedItemUuid(created.item_uuid);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t('createFailed', { itemNoun: displayItemNoun.toLowerCase() }),
        );
      }
    });
  };

  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t('outlineTitle', { itemNoun: displayItemNoun })}</h2>
          <p className="text-muted-foreground text-xs">{t('outlinePoints', { points: totalPoints })}</p>
        </div>
      </div>

      {isEditable ? (
        <div className="mb-4 space-y-2">
          {allowedKinds.map((kind) => {
            const Icon = KIND_ICONS[kind];
            return (
              <Button
                key={kind}
                type="button"
                variant="outline"
                size="sm"
                disabled={isCreating}
                className="h-auto w-full justify-start px-3 py-2 text-left"
                onClick={() => createItem(kind)}
                title={t('addKind', { kind: kindLabels[kind] })}
              >
                {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <Icon className="size-4" />}
                <span className="min-w-0 truncate">{t('addKind', { kind: kindLabels[kind] })}</span>
              </Button>
            );
          })}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
          {t('outlineEmptyMessage', { itemNoun: displayItemNoun.toLowerCase() })}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => {
            const Icon = KIND_ICONS[item.kind as SupportedStudioItemKind] ?? BookOpen;
            const issues = dedupeIssues([
              ...localItemValidationIssues(item),
              ...persistedItemIssues(validationIssues, item.item_uuid),
            ]);
            const selected = item.item_uuid === selectedItemUuid;
            return (
              <button
                key={item.item_uuid}
                id={`item-${item.item_uuid}`}
                type="button"
                onClick={() => setSelectedItemUuid(item.item_uuid)}
                className={cn(
                  'w-full rounded-md border bg-background p-3 text-left transition hover:bg-muted/60',
                  selected && 'border-primary ring-primary/20 ring-2',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className="text-muted-foreground size-4 shrink-0" />
                      <span className="truncate text-sm font-medium">
                        {index + 1}. {item.title || t('untitledItem', { itemNoun: displayItemNoun.toLowerCase() })}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span>
                        {item.max_score || 0} {t('pointsAbbreviation')}
                      </span>
                      <span>{kindLabels[item.kind as SupportedStudioItemKind] ?? item.kind}</span>
                    </div>
                  </div>
                  {issues.length > 0 ? (
                    <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                  )}
                </div>
                {issues.length > 0 ? (
                  <p className="mt-2 text-xs text-amber-700">
                    <InlineIssueMessage issue={issues[0]!} />
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface NativeItemAuthorProps {
  mode: StudioMode;
  itemNoun: string;
  itemNounKey?: 'question' | 'task';
}

interface AssessmentEditorState {
  title: string;
  description: string;
  dueAt: string;
  gradingType: 'NUMERIC' | 'PERCENTAGE';
  maxAttempts: string;
  timeLimitMinutes: string;
  copyPasteProtection: boolean;
  tabSwitchDetection: boolean;
  devtoolsDetection: boolean;
  rightClickDisable: boolean;
  fullscreenEnforcement: boolean;
  violationThreshold: string;
  allowResultReview: boolean;
  showCorrectAnswers: boolean;
}

type EditableItem = Pick<AssessmentItem, 'item_uuid' | 'kind' | 'title' | 'max_score' | 'body'>;

export function NativeItemAuthor({ mode, itemNoun, itemNounKey }: NativeItemAuthorProps) {
  const {
    assessment,
    items,
    selectedItemUuid,
    setSelectedItemUuid,
    refresh,
    isEditable,
    totalPoints,
    validationIssues,
  } = useAssessmentStudioContext();
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio');
  const displayItemNoun = itemNounKey ? t(`itemNouns.${itemNounKey}` as any) : itemNoun;
  const kindLabels: Record<SupportedStudioItemKind, string> = {
    CHOICE: t('kindLabels.choice'),
    OPEN_TEXT: t('kindLabels.openText'),
    FILE_UPLOAD: t('kindLabels.fileUpload'),
    FORM: t('kindLabels.form'),
    MATCHING: t('kindLabels.matching'),
  };
  const item = items.find((candidate) => candidate.item_uuid === selectedItemUuid) ?? items[0] ?? null;
  const [assessmentState, setAssessmentState] = useState<AssessmentEditorState>(() =>
    toAssessmentEditorState(assessment),
  );
  const [itemState, setItemState] = useState<EditableItem | null>(item ? toEditableItem(item) : null);
  const [assessmentSaveState, setAssessmentSaveState] = useState<SaveState>('idle');
  const [itemSaveState, setItemSaveState] = useState<SaveState>('idle');
  const [isDuplicating, startDuplicateTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const lastSavedAssessmentRef = useRef('');
  const lastSavedItemRef = useRef('');

  useEffect(() => {
    const nextAssessmentState = toAssessmentEditorState(assessment);
    setAssessmentState(nextAssessmentState);
    lastSavedAssessmentRef.current = serializeAssessmentState(nextAssessmentState);
    setAssessmentSaveState('idle');
  }, [assessment]);

  useEffect(() => {
    const nextItem = item ? toEditableItem(item) : null;
    setItemState(nextItem);
    lastSavedItemRef.current = nextItem ? serializeItemState(nextItem) : '';
    setItemSaveState('idle');
  }, [item?.item_uuid, item?.updated_at, item]);

  const saveAssessment = useCallback(
    async (nextState: AssessmentEditorState) => {
      setAssessmentSaveState('saving');
      try {
        const response = await apiFetch(`assessments/${assessment.assessment_uuid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildAssessmentPatch(mode, assessment, nextState)),
        });

        if (!response.ok) {
          throw new Error(await responseError(response, 'Failed to save assessment settings'));
        }

        lastSavedAssessmentRef.current = serializeAssessmentState(nextState);
        setAssessmentSaveState('saved');
        await refresh();
      } catch (error) {
        setAssessmentSaveState('error');
        toast.error(error instanceof Error ? error.message : t('failedToSaveSettings'));
      }
    },
    [assessment, mode, refresh, t],
  );

  const saveItem = useCallback(
    async (nextItem: EditableItem) => {
      setItemSaveState('saving');
      try {
        const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items/${nextItem.item_uuid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: nextItem.kind,
            title: nextItem.title,
            max_score: nextItem.max_score,
            body: nextItem.body,
          }),
        });

        if (!response.ok) {
          throw new Error(
            await responseError(response, t('failedToSaveItem', { itemNoun: displayItemNoun.toLowerCase() })),
          );
        }

        lastSavedItemRef.current = serializeItemState(nextItem);
        setItemSaveState('saved');
        await refresh();
      } catch (error) {
        setItemSaveState('error');
        toast.error(
          error instanceof Error ? error.message : t('failedToSaveItem', { itemNoun: displayItemNoun.toLowerCase() }),
        );
      }
    },
    [assessment.assessment_uuid, displayItemNoun, refresh, t],
  );

  useEffect(() => {
    if (!isEditable) return;
    const serialized = serializeAssessmentState(assessmentState);
    if (serialized === lastSavedAssessmentRef.current) return;
    setAssessmentSaveState('dirty');
    const timeout = setTimeout(() => {
      void saveAssessment(assessmentState);
    }, 900);
    return () => clearTimeout(timeout);
  }, [assessmentState, isEditable, saveAssessment]);

  useEffect(() => {
    if (!isEditable || !itemState) return;
    const serialized = serializeItemState(itemState);
    if (serialized === lastSavedItemRef.current) return;
    setItemSaveState('dirty');
    const timeout = setTimeout(() => {
      void saveItem(itemState);
    }, 900);
    return () => clearTimeout(timeout);
  }, [isEditable, itemState, saveItem]);

  const handleDelete = () => {
    if (!itemState) return;
    startDeleteTransition(async () => {
      try {
        const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items/${itemState.item_uuid}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          throw new Error(
            await responseError(response, t('deleteFailed', { itemNoun: displayItemNoun.toLowerCase() })),
          );
        }
        toast.success(t('itemDeleted', { itemNoun: displayItemNoun }));
        setSelectedItemUuid(null);
        await refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t('deleteFailed', { itemNoun: displayItemNoun.toLowerCase() }),
        );
      }
    });
  };

  const handleDuplicate = () => {
    if (!itemState) return;
    startDuplicateTransition(async () => {
      try {
        const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: itemState.kind,
            title: itemState.title
              ? t('copyOf', { title: itemState.title })
              : t('copyOfItem', { itemNoun: displayItemNoun }),
            max_score: itemState.max_score,
            body: structuredClone(itemState.body),
          }),
        });

        if (!response.ok) {
          throw new Error(
            await responseError(response, t('duplicateFailed', { itemNoun: displayItemNoun.toLowerCase() })),
          );
        }

        const created = (await response.json()) as { item_uuid?: string };
        toast.success(t('itemDuplicated', { itemNoun: displayItemNoun }));
        await refresh();
        if (typeof created.item_uuid === 'string') {
          setSelectedItemUuid(created.item_uuid);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t('duplicateFailed', { itemNoun: displayItemNoun.toLowerCase() }),
        );
      }
    });
  };

  const itemIssues = itemState
    ? dedupeIssues([
        ...localItemValidationIssues(itemState),
        ...persistedItemIssues(validationIssues, itemState.item_uuid),
      ]).map(classifyValidationIssue)
    : [];
  const assessmentIssues = getAssessmentEditorIssues(mode, assessmentState, t).map(classifyValidationIssue);
  const itemMetadataIssues = itemIssues.filter((issue) => issue.area === 'item-metadata');
  const itemContentIssues = itemIssues.filter((issue) => issue.area === 'item-content' || issue.area === 'item-kind');
  const readinessIssueCount = dedupeIssues([...validationIssues, ...assessmentIssues]).length;
  const readyForPublish = items.length > 0 && readinessIssueCount === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <StudioOverviewPanel
        mode={mode}
        itemNoun={displayItemNoun}
        itemCount={items.length}
        totalPoints={totalPoints}
        dueAt={assessmentState.dueAt}
        lifecycle={assessment.lifecycle}
        readyForPublish={readyForPublish}
        issueCount={readinessIssueCount}
      />

      <EditorSection
        title={t('assessmentDetailsTitle')}
        description={t(mode === 'exam' ? 'assessmentDetailsExamDescription' : 'assessmentDetailsAssignmentDescription')}
        actions={<SaveStateBadge state={assessmentSaveState} />}
      >
        <AssessmentMetadataForm
          mode={mode}
          state={assessmentState}
          disabled={!isEditable}
          issues={assessmentIssues}
          onChange={setAssessmentState}
        />
      </EditorSection>

      {!itemState ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed p-8">
          <div className="max-w-sm text-center">
            <BookOpen className="text-muted-foreground mx-auto size-10" />
            <h2 className="mt-3 text-lg font-semibold">
              {t('noItemSelectedTitle', { itemNoun: displayItemNoun.toLowerCase() })}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t('noItemSelectedDescription', { itemNoun: displayItemNoun.toLowerCase() })}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {kindLabels[itemState.kind as SupportedStudioItemKind] ?? itemState.kind}
                </Badge>
                <SaveStateBadge state={itemSaveState} />
                {!isEditable ? <Badge variant="secondary">{t('readOnlyBadge')}</Badge> : null}
              </div>
              <h2 className="mt-2 text-xl font-semibold">
                {itemState.title || t('untitledItem', { itemNoun: displayItemNoun.toLowerCase() })}
              </h2>
              <p className="text-muted-foreground text-sm">
                {itemState.max_score || 0} {t('pointsAbbreviation')} ·{' '}
                {totalPoints > 0 ? Math.round((itemState.max_score / totalPoints) * 100) : 0}% {t('weightLabel')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!isEditable || isDuplicating}
                onClick={handleDuplicate}
              >
                {isDuplicating ? <LoaderCircle className="size-4 animate-spin" /> : <Copy className="size-4" />}
                {t('duplicate')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={!isEditable || isDeleting}
                onClick={handleDelete}
              >
                {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                {t('delete')}
              </Button>
            </div>
          </div>

          <EditorSection
            title={t('itemMetadataTitle', { itemNoun: displayItemNoun })}
            description={t('itemMetadataDescription')}
          >
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
              <div className="space-y-2">
                <Label htmlFor="native-item-title">{t('titleLabel')}</Label>
                <Input
                  id="native-item-title"
                  value={itemState.title}
                  disabled={!isEditable}
                  aria-invalid={itemMetadataIssues.some((issue) => issue.field === 'title')}
                  className={cn(
                    itemMetadataIssues.some((issue) => issue.field === 'title') &&
                      'border-amber-500 focus-visible:ring-amber-500/40',
                  )}
                  onChange={(event) => setItemState({ ...itemState, title: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="native-item-points">{t('pointsLabel')}</Label>
                <Input
                  id="native-item-points"
                  type="number"
                  min={0.01}
                  step={0.5}
                  value={itemState.max_score}
                  disabled={!isEditable}
                  aria-invalid={itemMetadataIssues.some((issue) => issue.field === 'max_score')}
                  className={cn(
                    itemMetadataIssues.some((issue) => issue.field === 'max_score') &&
                      'border-amber-500 focus-visible:ring-amber-500/40',
                  )}
                  onChange={(event) =>
                    setItemState({
                      ...itemState,
                      max_score: event.target.value ? Number(event.target.value) : 0,
                    })
                  }
                />
              </div>
            </div>
            {itemMetadataIssues.length > 0 ? <InlineIssueList issues={itemMetadataIssues} /> : null}
          </EditorSection>

          <EditorSection
            title={t('itemContentTitle', { itemNoun: displayItemNoun })}
            description={t('itemContentDescription')}
          >
            <NativeItemBodyEditor
              item={itemState}
              disabled={!isEditable}
              issues={itemContentIssues}
              onChange={setItemState}
            />
          </EditorSection>
        </>
      )}
    </div>
  );
}

function StudioOverviewPanel({
  mode,
  itemNoun,
  itemCount,
  totalPoints,
  dueAt,
  lifecycle,
  readyForPublish,
  issueCount,
}: {
  mode: StudioMode;
  itemNoun: string;
  itemCount: number;
  totalPoints: number;
  dueAt: string;
  lifecycle: AssessmentStudioDetail['lifecycle'];
  readyForPublish: boolean;
  issueCount: number;
}) {
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio');
  const dueDateLabel = dueAt ? formatStudioDate(dueAt) : t('noDueDate');

  return (
    <section className="bg-card rounded-lg border p-4 md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={readyForPublish ? 'success' : 'warning'}>
              {readyForPublish ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
              {readyForPublish ? t('readyToPublish') : t('needsWork')}
            </Badge>
            <Badge variant="outline">{mode === 'exam' ? t('examPolicyTitle') : t('gradingModeLabel')}</Badge>
          </div>
          <h2 className="mt-3 text-lg font-semibold">{t('workflowTitle', { itemNoun: itemNoun.toLowerCase() })}</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t('workflowDescription')}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[26rem]">
          <StudioMetric
            icon={Rows3}
            label={t('itemsMetricLabel', { itemNoun })}
            value={String(itemCount)}
          />
          <StudioMetric
            icon={Sparkles}
            label={t('pointsMetricLabel')}
            value={String(totalPoints)}
          />
          <StudioMetric
            icon={CalendarClock}
            label={t('dueDateLabel')}
            value={dueDateLabel}
          />
          <StudioMetric
            icon={readyForPublish ? CheckCircle2 : AlertTriangle}
            label={t('publishReadinessLabel')}
            value={readyForPublish ? t('readyToPublish') : t('issuesMetricValue', { count: issueCount })}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <WorkflowStep
          active
          complete={itemCount > 0}
          label={t('setupStepLabel')}
          description={t('setupStepDescription')}
        />
        <WorkflowStep
          active={itemCount > 0}
          complete={readyForPublish}
          label={t('contentStepLabel')}
          description={t('contentStepDescription')}
        />
        <WorkflowStep
          active={readyForPublish || lifecycle === 'PUBLISHED' || lifecycle === 'SCHEDULED'}
          complete={lifecycle === 'PUBLISHED' || lifecycle === 'SCHEDULED'}
          label={t('releaseStepLabel')}
          description={t('releaseStepDescription')}
        />
      </div>
    </section>
  );
}

function StudioMetric({ icon: Icon, label, value }: { icon: typeof Rows3; label: string; value: string }) {
  return (
    <div className="bg-background rounded-md border px-3 py-2">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Icon className="size-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function WorkflowStep({
  active,
  complete,
  label,
  description,
}: {
  active: boolean;
  complete: boolean;
  label: string;
  description: string;
}) {
  return (
    <div
      className={cn(
        'rounded-md border p-3',
        active ? 'bg-background' : 'bg-muted/30 text-muted-foreground',
        complete &&
          'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        {complete ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <span className="bg-muted-foreground/60 size-2 rounded-full" />
        )}
        <span>{label}</span>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">{description}</p>
    </div>
  );
}

function EditorSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-lg border p-4 md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function AssessmentMetadataForm({
  mode,
  state,
  disabled,
  issues,
  onChange,
}: {
  mode: StudioMode;
  state: AssessmentEditorState;
  disabled: boolean;
  issues: ReturnType<typeof classifyValidationIssue>[];
  onChange: (nextState: AssessmentEditorState) => void;
}) {
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio');
  const hasIssue = (field: string) => issues.some((issue) => issue.field === field);

  return (
    <div className="grid gap-6">
      <div className="space-y-2">
        <Label htmlFor="assessment-title">{t('titleLabel')}</Label>
        <Input
          id="assessment-title"
          value={state.title}
          disabled={disabled}
          aria-invalid={hasIssue('title')}
          className={cn(hasIssue('title') && 'border-amber-500 focus-visible:ring-amber-500/40')}
          onChange={(event) => onChange({ ...state, title: event.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="assessment-description">{t('descriptionLabel')}</Label>
        <Textarea
          id="assessment-description"
          value={state.description}
          disabled={disabled}
          className="min-h-28"
          onChange={(event) => onChange({ ...state, description: event.target.value })}
        />
      </div>

      <div className={cn('grid gap-4', mode === 'assignment' ? 'md:grid-cols-[1fr_12rem]' : 'md:grid-cols-2')}>
        <div className="space-y-2">
          <Label htmlFor="assessment-due-at">{t('dueDateLabel')}</Label>
          <Input
            id="assessment-due-at"
            type="datetime-local"
            value={state.dueAt}
            disabled={disabled}
            aria-invalid={hasIssue('dueAt')}
            className={cn(hasIssue('dueAt') && 'border-amber-500 focus-visible:ring-amber-500/40')}
            onChange={(event) => onChange({ ...state, dueAt: event.target.value })}
          />
        </div>

        {mode === 'assignment' ? (
          <div className="space-y-2">
            <Label htmlFor="assessment-grading-type">{t('gradingModeLabel')}</Label>
            <NativeSelect
              id="assessment-grading-type"
              value={state.gradingType}
              disabled={disabled}
              className="w-full"
              onChange={(event) =>
                onChange({ ...state, gradingType: event.target.value as AssessmentEditorState['gradingType'] })
              }
            >
              <NativeSelectOption value="NUMERIC">{t('gradingModeNumeric')}</NativeSelectOption>
              <NativeSelectOption value="PERCENTAGE">{t('gradingModePercentage')}</NativeSelectOption>
            </NativeSelect>
          </div>
        ) : null}
      </div>

      {mode === 'exam' ? (
        <>
          <div className="rounded-lg border p-4">
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="size-4" />
              <h4 className="text-sm font-semibold">{t('examPolicyTitle')}</h4>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="exam-max-attempts">{t('attemptLimitLabel')}</Label>
                <Input
                  id="exam-max-attempts"
                  type="number"
                  min={1}
                  value={state.maxAttempts}
                  disabled={disabled}
                  aria-invalid={hasIssue('maxAttempts')}
                  className={cn(hasIssue('maxAttempts') && 'border-amber-500 focus-visible:ring-amber-500/40')}
                  onChange={(event) => onChange({ ...state, maxAttempts: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-time-limit">{t('timeLimitLabel')}</Label>
                <Input
                  id="exam-time-limit"
                  type="number"
                  min={1}
                  value={state.timeLimitMinutes}
                  disabled={disabled}
                  aria-invalid={hasIssue('timeLimitMinutes')}
                  className={cn(hasIssue('timeLimitMinutes') && 'border-amber-500 focus-visible:ring-amber-500/40')}
                  onChange={(event) => onChange({ ...state, timeLimitMinutes: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-violation-threshold">{t('violationThresholdLabel')}</Label>
                <Input
                  id="exam-violation-threshold"
                  type="number"
                  min={1}
                  value={state.violationThreshold}
                  disabled={disabled}
                  aria-invalid={hasIssue('violationThreshold')}
                  className={cn(hasIssue('violationThreshold') && 'border-amber-500 focus-visible:ring-amber-500/40')}
                  onChange={(event) => onChange({ ...state, violationThreshold: event.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ToggleRow
              label={t('copyPasteProtectionLabel')}
              checked={state.copyPasteProtection}
              disabled={disabled}
              onChange={(checked) => onChange({ ...state, copyPasteProtection: checked })}
            />
            <ToggleRow
              label={t('tabSwitchDetectionLabel')}
              checked={state.tabSwitchDetection}
              disabled={disabled}
              onChange={(checked) => onChange({ ...state, tabSwitchDetection: checked })}
            />
            <ToggleRow
              label={t('devtoolsDetectionLabel')}
              checked={state.devtoolsDetection}
              disabled={disabled}
              onChange={(checked) => onChange({ ...state, devtoolsDetection: checked })}
            />
            <ToggleRow
              label={t('rightClickDisabledLabel')}
              checked={state.rightClickDisable}
              disabled={disabled}
              onChange={(checked) => onChange({ ...state, rightClickDisable: checked })}
            />
            <ToggleRow
              label={t('fullscreenEnforcementLabel')}
              checked={state.fullscreenEnforcement}
              disabled={disabled}
              onChange={(checked) => onChange({ ...state, fullscreenEnforcement: checked })}
            />
            <ToggleRow
              label={t('allowResultReviewLabel')}
              checked={state.allowResultReview}
              disabled={disabled}
              onChange={(checked) => onChange({ ...state, allowResultReview: checked })}
            />
            <ToggleRow
              label={t('showCorrectAnswersLabel')}
              checked={state.showCorrectAnswers}
              disabled={disabled}
              onChange={(checked) => onChange({ ...state, showCorrectAnswers: checked })}
            />
          </div>
        </>
      ) : null}

      {issues.length > 0 ? <InlineIssueList issues={issues} /> : null}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <span className="text-sm font-medium">{label}</span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}

function NativeItemBodyEditor({
  item,
  disabled,
  issues,
  onChange,
}: {
  item: EditableItem;
  disabled: boolean;
  issues: ReturnType<typeof classifyValidationIssue>[];
  onChange: (nextItem: EditableItem) => void;
}) {
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio');
  const hasIssue = (code: string) =>
    issues.some(
      (issue) => issue.code === code || (code.endsWith('.prompt_missing') && issue.code === 'item.prompt_missing'),
    );

  if (item.body.kind === 'CHOICE' || item.body.kind === 'MATCHING') {
    return (
      <div className="space-y-3">
        {hasIssue('choice.prompt_missing') ||
        hasIssue('matching.prompt_missing') ||
        hasIssue('choice.options_missing') ||
        hasIssue('choice.option_text_missing') ||
        hasIssue('choice.option_duplicate') ||
        hasIssue('choice.correct_missing') ||
        hasIssue('choice.too_many_correct') ||
        hasIssue('matching.pairs_missing') ||
        hasIssue('matching.pair_value_missing') ||
        hasIssue('matching.left_duplicate') ||
        hasIssue('matching.right_duplicate') ? (
          <InlineIssueList issues={issues} />
        ) : null}
        <ChoiceItemAuthor
          value={toChoiceAuthorValue(item.body)}
          disabled={disabled}
          onChange={(nextValue) => onChange({ ...item, ...fromChoiceAuthorValue(item, nextValue) })}
        />
      </div>
    );
  }

  if (item.body.kind === 'OPEN_TEXT') {
    const { body } = item;
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="open-text-prompt">{t('Items.OpenText.prompt')}</Label>
          <Textarea
            id="open-text-prompt"
            value={body.prompt}
            disabled={disabled}
            className="min-h-32"
            aria-invalid={hasIssue('open_text.prompt_missing')}
            onChange={(event) =>
              onChange({ ...item, body: { ...body, kind: 'OPEN_TEXT', prompt: event.target.value } })
            }
          />
        </div>
        <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
          <div className="space-y-2">
            <Label htmlFor="open-text-min-words">{t('Items.OpenText.minWords')}</Label>
            <Input
              id="open-text-min-words"
              type="number"
              min={0}
              value={body.min_words ?? ''}
              disabled={disabled}
              aria-invalid={hasIssue('open_text.min_words_invalid')}
              onChange={(event) =>
                onChange({
                  ...item,
                  body: {
                    ...body,
                    kind: 'OPEN_TEXT',
                    min_words: event.target.value ? Number(event.target.value) : null,
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="open-text-rubric">{t('Items.OpenText.rubric')}</Label>
            <Textarea
              id="open-text-rubric"
              value={body.rubric ?? ''}
              disabled={disabled}
              className="min-h-24"
              onChange={(event) =>
                onChange({ ...item, body: { ...body, kind: 'OPEN_TEXT', rubric: event.target.value || null } })
              }
            />
          </div>
        </div>
        {issues.length > 0 ? <InlineIssueList issues={issues} /> : null}
      </div>
    );
  }

  if (item.body.kind === 'FILE_UPLOAD') {
    const { body } = item;
    const constraints: FileUploadConstraints = {
      kind: 'FILE_UPLOAD',
      allowed_mime_types: body.mimes,
      max_file_size_mb: body.max_mb ?? null,
      max_files: body.max_files,
    };

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="file-upload-prompt">{t('Items.FileUpload.prompt')}</Label>
          <Textarea
            id="file-upload-prompt"
            value={body.prompt}
            disabled={disabled}
            className="min-h-24"
            aria-invalid={hasIssue('file.prompt_missing')}
            onChange={(event) =>
              onChange({ ...item, body: { ...body, kind: 'FILE_UPLOAD', prompt: event.target.value } })
            }
          />
        </div>
        {issues.length > 0 ? <InlineIssueList issues={issues} /> : null}
        <FileUploadConstraintsEditor
          value={constraints}
          disabled={disabled}
          onChange={(nextConstraints) =>
            onChange({
              ...item,
              body: {
                ...body,
                kind: 'FILE_UPLOAD',
                max_files: nextConstraints.max_files,
                max_mb: nextConstraints.max_file_size_mb ?? null,
                mimes: nextConstraints.allowed_mime_types,
              },
            })
          }
        />
      </div>
    );
  }

  if (item.body.kind === 'FORM') {
    const { body } = item;
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="form-prompt">{t('Items.Form.prompt')}</Label>
          <Textarea
            id="form-prompt"
            value={body.prompt}
            disabled={disabled}
            className="min-h-24"
            aria-invalid={hasIssue('form.prompt_missing')}
            onChange={(event) => onChange({ ...item, body: { ...body, kind: 'FORM', prompt: event.target.value } })}
          />
        </div>

        {issues.length > 0 ? <InlineIssueList issues={issues} /> : null}

        <div className="space-y-3">
          {body.fields.map((field, index) => (
            <div
              key={field.id}
              className="rounded-lg border p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('Items.Form.fieldHeader', { number: index + 1 })}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled || body.fields.length <= 1}
                  onClick={() =>
                    onChange({
                      ...item,
                      body: {
                        ...body,
                        kind: 'FORM',
                        fields: body.fields.filter((candidate) => candidate.id !== field.id),
                      },
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_12rem_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor={`form-field-label-${field.id}`}>{t('Items.Form.fieldLabel')}</Label>
                  <Input
                    id={`form-field-label-${field.id}`}
                    value={field.label}
                    disabled={disabled}
                    aria-invalid={hasIssue('form.field_label_missing')}
                    onChange={(event) =>
                      onChange({
                        ...item,
                        body: {
                          ...body,
                          kind: 'FORM',
                          fields: body.fields.map((candidate) =>
                            candidate.id === field.id ? { ...candidate, label: event.target.value } : candidate,
                          ),
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`form-field-type-${field.id}`}>{t('Items.Form.fieldType')}</Label>
                  <NativeSelect
                    id={`form-field-type-${field.id}`}
                    value={field.field_type}
                    disabled={disabled}
                    className="w-full"
                    onChange={(event) =>
                      onChange({
                        ...item,
                        body: {
                          ...body,
                          kind: 'FORM',
                          fields: body.fields.map((candidate) =>
                            candidate.id === field.id
                              ? {
                                  ...candidate,
                                  field_type: event.target.value as typeof candidate.field_type,
                                }
                              : candidate,
                          ),
                        },
                      })
                    }
                  >
                    <NativeSelectOption value="text">{t('Items.Form.fieldTypes.text')}</NativeSelectOption>
                    <NativeSelectOption value="textarea">{t('Items.Form.fieldTypes.textarea')}</NativeSelectOption>
                    <NativeSelectOption value="number">{t('Items.Form.fieldTypes.number')}</NativeSelectOption>
                    <NativeSelectOption value="date">{t('Items.Form.fieldTypes.date')}</NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className="flex items-end">
                  <ToggleRow
                    label={t('Items.Form.requiredLabel')}
                    checked={field.required}
                    disabled={disabled}
                    onChange={(checked) =>
                      onChange({
                        ...item,
                        body: {
                          ...body,
                          kind: 'FORM',
                          fields: body.fields.map((candidate) =>
                            candidate.id === field.id ? { ...candidate, required: checked } : candidate,
                          ),
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...item,
              body: {
                ...body,
                kind: 'FORM',
                fields: [...body.fields, createFormField()],
              },
            })
          }
        >
          {t('Items.Form.addField')}
        </Button>
      </div>
    );
  }

  return <div className="text-muted-foreground text-sm">{t('Items.Form.unsupportedKind')}</div>;
}

function buildDefaultItemPayload(kind: SupportedStudioItemKind, defaultTitle: string) {
  if (kind === 'CHOICE') {
    return {
      kind,
      title: defaultTitle,
      max_score: 1,
      body: {
        kind,
        prompt: '',
        options: [createChoiceOption(), createChoiceOption()],
        multiple: false,
        variant: 'SINGLE_CHOICE',
      },
    };
  }

  if (kind === 'MATCHING') {
    return {
      kind,
      title: defaultTitle,
      max_score: 1,
      body: {
        kind,
        prompt: '',
        pairs: [createMatchingPair()],
      },
    };
  }

  if (kind === 'FILE_UPLOAD') {
    return {
      kind,
      title: defaultTitle,
      max_score: 1,
      body: {
        kind,
        prompt: '',
        max_files: 1,
        max_mb: null,
        mimes: [],
      },
    };
  }

  if (kind === 'FORM') {
    return {
      kind,
      title: defaultTitle,
      max_score: 1,
      body: {
        kind,
        prompt: '',
        fields: [createFormField()],
      },
    };
  }

  return {
    kind,
    title: defaultTitle,
    max_score: 1,
    body: {
      kind,
      prompt: '',
      min_words: null,
      rubric: null,
    },
  };
}

function buildAssessmentPatch(mode: StudioMode, assessment: AssessmentStudioDetail, state: AssessmentEditorState) {
  const dueAt = state.dueAt ? new Date(state.dueAt).toISOString() : null;
  const payload: Record<string, unknown> = {
    title: state.title,
    description: state.description,
  };

  if (mode === 'assignment') {
    payload.grading_type = state.gradingType;
    payload.policy = { due_at: dueAt };
    return payload;
  }

  const settings = normalizeRecord(assessment.assessment_policy?.settings_json);
  payload.policy = {
    due_at: dueAt,
    max_attempts: state.maxAttempts ? Number(state.maxAttempts) : null,
    time_limit_seconds: state.timeLimitMinutes ? Number(state.timeLimitMinutes) * 60 : null,
    anti_cheat_json: {
      copy_paste_protection: state.copyPasteProtection,
      tab_switch_detection: state.tabSwitchDetection,
      devtools_detection: state.devtoolsDetection,
      right_click_disable: state.rightClickDisable,
      fullscreen_enforcement: state.fullscreenEnforcement,
      violation_threshold: state.violationThreshold ? Number(state.violationThreshold) : null,
    },
    settings_json: {
      ...settings,
      attempt_limit: state.maxAttempts ? Number(state.maxAttempts) : null,
      time_limit: state.timeLimitMinutes ? Number(state.timeLimitMinutes) : null,
      allow_result_review: state.allowResultReview,
      show_correct_answers: state.showCorrectAnswers,
      copy_paste_protection: state.copyPasteProtection,
      tab_switch_detection: state.tabSwitchDetection,
      devtools_detection: state.devtoolsDetection,
      right_click_disable: state.rightClickDisable,
      fullscreen_enforcement: state.fullscreenEnforcement,
      violation_threshold: state.violationThreshold ? Number(state.violationThreshold) : null,
    },
  };
  return payload;
}

function toAssessmentEditorState(assessment: AssessmentStudioDetail): AssessmentEditorState {
  const antiCheat = normalizeRecord(assessment.assessment_policy?.anti_cheat_json);
  const settings = normalizeRecord(assessment.assessment_policy?.settings_json);
  return {
    title: assessment.title,
    description: assessment.description ?? '',
    dueAt: toDateTimeLocal(assessment.assessment_policy?.due_at),
    gradingType: assessment.grading_type ?? 'PERCENTAGE',
    maxAttempts:
      typeof assessment.assessment_policy?.max_attempts === 'number'
        ? String(assessment.assessment_policy.max_attempts)
        : typeof settings.max_attempts === 'number'
          ? String(settings.max_attempts)
          : typeof settings.attempt_limit === 'number'
            ? String(settings.attempt_limit)
            : '1',
    timeLimitMinutes:
      typeof assessment.assessment_policy?.time_limit_seconds === 'number'
        ? String(Math.max(1, Math.ceil(assessment.assessment_policy.time_limit_seconds / 60)))
        : typeof settings.time_limit_seconds === 'number'
          ? String(Math.max(1, Math.ceil(settings.time_limit_seconds / 60)))
          : typeof settings.time_limit === 'number'
            ? String(settings.time_limit)
            : '',
    copyPasteProtection: antiCheat.copy_paste_protection === true || settings.copy_paste_protection === true,
    tabSwitchDetection: antiCheat.tab_switch_detection === true || settings.tab_switch_detection === true,
    devtoolsDetection: antiCheat.devtools_detection === true || settings.devtools_detection === true,
    rightClickDisable: antiCheat.right_click_disable === true || settings.right_click_disable === true,
    fullscreenEnforcement: antiCheat.fullscreen_enforcement === true || settings.fullscreen_enforcement === true,
    violationThreshold:
      typeof antiCheat.violation_threshold === 'number'
        ? String(antiCheat.violation_threshold)
        : typeof settings.violation_threshold === 'number'
          ? String(settings.violation_threshold)
          : '3',
    allowResultReview: settings.allow_result_review !== false,
    showCorrectAnswers:
      typeof settings.show_correct_answers === 'boolean'
        ? settings.show_correct_answers
        : settings.allow_result_review !== false,
  };
}

function toEditableItem(item: AssessmentItem): EditableItem {
  return {
    item_uuid: item.item_uuid,
    kind: item.kind,
    title: item.title,
    max_score: item.max_score,
    body: structuredClone(item.body),
  };
}

function toChoiceAuthorValue(body: Extract<EditableItem['body'], { kind: 'CHOICE' | 'MATCHING' }>): ChoiceAuthorValue {
  if (body.kind === 'MATCHING') {
    return {
      kind: 'MATCHING',
      prompt: body.prompt,
      pairs: body.pairs.map((pair, index) => ({
        id: `${index}`,
        left: pair.left,
        right: pair.right,
      })),
    };
  }

  return {
    kind: body.variant === 'TRUE_FALSE' ? 'TRUE_FALSE' : body.multiple ? 'CHOICE_MULTIPLE' : 'CHOICE_SINGLE',
    prompt: body.prompt,
    options: body.options.map((option) => ({
      id: option.id,
      text: option.text,
      isCorrect: option.is_correct,
    })),
  };
}

function fromChoiceAuthorValue(item: EditableItem, value: ChoiceAuthorValue): Pick<EditableItem, 'kind' | 'body'> {
  if (value.kind === 'MATCHING') {
    return {
      kind: 'MATCHING',
      body: {
        kind: 'MATCHING',
        prompt: value.prompt,
        pairs: value.pairs.map((pair) => ({ left: pair.left, right: pair.right })),
        explanation: item.body.kind === 'MATCHING' ? (item.body.explanation ?? null) : null,
      },
    };
  }

  return {
    kind: 'CHOICE',
    body: {
      kind: 'CHOICE',
      prompt: value.prompt,
      options: value.options.map((option) => ({
        id: String(option.id),
        text: option.text,
        is_correct: option.isCorrect === true,
      })),
      multiple: value.kind === 'CHOICE_MULTIPLE',
      variant:
        value.kind === 'TRUE_FALSE'
          ? 'TRUE_FALSE'
          : value.kind === 'CHOICE_MULTIPLE'
            ? 'MULTIPLE_CHOICE'
            : 'SINGLE_CHOICE',
      explanation: item.body.kind === 'CHOICE' ? (item.body.explanation ?? null) : null,
    },
  };
}

function useIssueMessage(issue: ValidationIssue): string {
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio.validation');
  return t(issue.code.replace('.', '_') as any);
}

function InlineIssueMessage({ issue }: { issue: ValidationIssue }) {
  return <>{useIssueMessage(issue)}</>;
}

function InlineIssueList({ issues }: { issues: ReturnType<typeof classifyValidationIssue>[] }) {
  if (issues.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <ul className="space-y-1">
        {issues.map((issue) => (
          <li
            key={`${issue.itemUuid ?? 'assessment'}:${issue.code}:${issue.message}`}
            className="flex items-start gap-2"
          >
            <span>•</span>
            <span>
              <InlineIssueMessage issue={issue} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function getAssessmentEditorIssues(
  mode: StudioMode,
  state: AssessmentEditorState,
  t: (key: string, values?: any) => string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!state.title.trim()) {
    issues.push({ code: 'assessment.title_missing', message: t('validation.assessment_title_missing') });
  }

  if (mode === 'exam') {
    if (state.maxAttempts && Number(state.maxAttempts) < 1) {
      issues.push({
        code: 'policy.max_attempts_invalid',
        message: t('validation.policy_max_attempts_invalid'),
        field: 'maxAttempts',
      });
    }
    if (state.timeLimitMinutes && Number(state.timeLimitMinutes) < 1) {
      issues.push({
        code: 'policy.time_limit_invalid',
        message: t('validation.policy_time_limit_invalid'),
        field: 'timeLimitMinutes',
      });
    }
    if (state.violationThreshold && Number(state.violationThreshold) < 1) {
      issues.push({
        code: 'policy.violation_threshold_invalid',
        message: t('validation.policy_violation_threshold_invalid'),
        field: 'violationThreshold',
      });
    }
  }

  return issues;
}

function createChoiceOption() {
  return {
    id: `option_${crypto.randomUUID()}`,
    text: '',
    is_correct: false,
  };
}

function createMatchingPair() {
  return {
    left: '',
    right: '',
  };
}

function createFormField() {
  return {
    id: `field_${crypto.randomUUID()}`,
    label: '',
    field_type: 'text' as const,
    required: false,
  };
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function serializeAssessmentState(state: AssessmentEditorState) {
  return JSON.stringify(state);
}

function serializeItemState(item: EditableItem) {
  return JSON.stringify(item);
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatStudioDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  const detail = payload && typeof payload === 'object' ? (payload as { detail?: unknown }).detail : null;
  if (typeof detail === 'string' && detail) return detail;
  if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') {
    return detail.message;
  }
  return fallback;
}
