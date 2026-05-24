'use client';

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChartColumn,
  GitCompareArrows,
  ListTodo,
  LoaderCircle,
  PanelLeft,
  Rocket,
  Settings2,
  TextCursorInput,
  Trash2,
  UsersRound,
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
import type { SaveState } from '@/features/assessments/shared/SaveStateBadge';
import type { AssessmentEditorState, EditableItem, StudioTab } from '@/features/assessments/studio/studioTypes';
import GeneralSettingsTab from '@/features/assessments/studio/tabs/GeneralSettingsTab';
import BuilderCanvasTab from '@/features/assessments/studio/tabs/BuilderCanvasTab';
import PublishDashboardTab from '@/features/assessments/studio/tabs/PublishDashboardTab';
import AccessManagementTab from '@/features/assessments/studio/tabs/AccessManagementTab';
import ResultsReviewTab from '@/features/assessments/studio/tabs/ResultsReviewTab';
import ErrorUI from '@/components/Objects/Elements/Error/Error';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { MarkdownEditor } from '@/features/content-markdown';

export type { AssessmentEditorState, EditableItem, StudioTab };
export type { SaveState };

type SupportedStudioItemKind = Exclude<UnifiedItemKind, 'CODE'>;
type StudioMode = 'exam';
type AssessmentLifecycle = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

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
  kind: 'EXAM' | 'CODE_CHALLENGE' | 'QUIZ';
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
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  className="w-full justify-center"
                  disabled={isCreating}
                >
                  {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <ListTodo className="size-4" />}
                  {t('newQuestion')}
                </Button>
              }
            />
            <DropdownMenuContent
              align="start"
              className="w-64"
            >
              {allowedKinds.map((kind) => {
                const Icon = KIND_ICONS[kind];
                return (
                  <DropdownMenuItem
                    key={kind}
                    onSelect={() => createItem(kind)}
                  >
                    <Icon className="mr-2 size-4" />
                    {kindLabels[kind]}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
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
  allowedKinds?: SupportedStudioItemKind[];
}

type EditableItemInternal = EditableItem;

export function NativeItemAuthor({
  mode,
  itemNoun,
  itemNounKey,
  allowedKinds = ['CHOICE', 'MATCHING', 'OPEN_TEXT', 'FORM'],
}: NativeItemAuthorProps) {
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
  const tTabs = useTranslations('Features.Assessments.Studio.Tabs');
  const displayItemNoun = itemNounKey ? t(`itemNouns.${itemNounKey}` as any) : itemNoun;

  const VALID_TABS = new Set<StudioTab>(['SETUP', 'BUILDER', 'ACCESS', 'RESULTS', 'PUBLISH']);

  const [activeTab, setActiveTabState] = useState<StudioTab>(() => {
    if (typeof globalThis.window !== 'undefined') {
      const raw = new URLSearchParams(globalThis.location.search).get('tab')?.toUpperCase();
      if (raw && VALID_TABS.has(raw as StudioTab)) return raw as StudioTab;
    }
    return 'BUILDER';
  });

  const setActiveTab = useCallback((tab: StudioTab) => {
    setActiveTabState(tab);
    if (typeof globalThis.window !== 'undefined') {
      const url = new URL(globalThis.location.href);
      url.searchParams.set('tab', tab.toLowerCase());
      globalThis.history.replaceState(null, '', url.toString());
    }
  }, []);

  const [localOrderedUuids, setLocalOrderedUuids] = useState<string[]>([]);

  // Sync local order with server items
  useEffect(() => {
    setLocalOrderedUuids(items.map((item) => item.item_uuid));
  }, [items]);

  // Produce the displayed items in local order
  const orderedItems = localOrderedUuids
    .map((uuid) => items.find((item) => item.item_uuid === uuid))
    .filter((item): item is AssessmentItem => Boolean(item));

  const item = orderedItems.find((candidate) => candidate.item_uuid === selectedItemUuid) ?? orderedItems[0] ?? null;

  const [assessmentState, setAssessmentState] = useState<AssessmentEditorState>(() =>
    toAssessmentEditorState(assessment),
  );
  const [itemState, setItemState] = useState<EditableItem | null>(item ? toEditableItem(item) : null);
  const [assessmentSaveState, setAssessmentSaveState] = useState<SaveState>('idle');
  const [itemSaveState, setItemSaveState] = useState<SaveState>('idle');
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
        if (!response.ok) throw new Error(await responseError(response, 'Failed to save assessment settings'));
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
        if (!response.ok)
          throw new Error(
            await responseError(response, t('failedToSaveItem', { itemNoun: displayItemNoun.toLowerCase() })),
          );
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

  const handleReorder = useCallback(
    async (orderedUuids: string[]) => {
      setLocalOrderedUuids(orderedUuids);
      try {
        await apiFetch(`assessments/${assessment.assessment_uuid}/items:reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: orderedUuids.map((item_uuid, index) => ({ item_uuid, order: index + 1 })),
          }),
        });
        await refresh();
      } catch {
        // Reorder persists visually; server sync is best-effort
      }
    },
    [assessment.assessment_uuid, refresh],
  );

  const setLifecycle = useCallback(
    async (lifecycle: AssessmentLifecycle, scheduledAt?: string | null) => {
      try {
        const response = await apiFetch(`assessments/${assessment.assessment_uuid}/lifecycle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: lifecycle, scheduled_at: scheduledAt ?? null }),
        });
        if (!response.ok) throw new Error(await responseError(response, 'Failed to update lifecycle'));
        await refresh();
        toast.success(t('lifecycleChanged', { state: lifecycle }));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('updateLifecycleFailed'));
      }
    },
    [assessment.assessment_uuid, refresh, t],
  );

  const assessmentIssues = getAssessmentEditorIssues(mode, assessmentState, t).map(classifyValidationIssue);
  const itemIssueList = itemState
    ? dedupeIssues([
        ...localItemValidationIssues(itemState),
        ...persistedItemIssues(validationIssues, itemState.item_uuid),
      ]).map(classifyValidationIssue)
    : [];
  const itemContentIssues = itemIssueList.filter(
    (issue) => issue.area === 'item-content' || issue.area === 'item-kind',
  );
  const allIssues = dedupeIssues([...validationIssues, ...assessmentIssues]);

  const TAB_CONFIG: { id: StudioTab; label: string; icon: typeof Settings2; issueCount?: number }[] = [
    { id: 'SETUP', label: tTabs('setup'), icon: Settings2 },
    { id: 'BUILDER', label: tTabs('builder'), icon: PanelLeft, issueCount: itemIssueList.length },
    { id: 'ACCESS', label: tTabs('access'), icon: UsersRound },
    { id: 'RESULTS', label: tTabs('results'), icon: ChartColumn },
    { id: 'PUBLISH', label: tTabs('publish'), icon: Rocket, issueCount: allIssues.length },
  ];

  return (
    <div className="flex flex-col">
      {/* ── Tab Navigation ─────────────────────────────────────── */}
      <div className="bg-card/80 sticky top-[61px] z-20 border-b backdrop-blur">
        <div className="flex items-center gap-1 px-4 py-1.5 md:px-6">
          {TAB_CONFIG.map(({ id, label, icon: Icon, issueCount }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                'relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150',
                activeTab === id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{label}</span>
              {issueCount ? (
                <span
                  className={cn(
                    'ml-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-bold',
                    activeTab === id
                      ? 'bg-white/20 text-white'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                  )}
                >
                  {issueCount > 9 ? '9+' : issueCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ───────────────────────────────────────── */}
      {activeTab === 'SETUP' && (
        <GeneralSettingsTab
          state={assessmentState}
          saveState={assessmentSaveState}
          disabled={!isEditable}
          issues={assessmentIssues}
          onChange={setAssessmentState}
        />
      )}

      {activeTab === 'BUILDER' && (
        <BuilderCanvasTab
          assessmentUuid={assessment.assessment_uuid}
          items={orderedItems}
          selectedItemUuid={selectedItemUuid}
          allowedKinds={allowedKinds}
          itemNoun={displayItemNoun}
          isEditable={isEditable}
          validationIssues={validationIssues}
          totalPoints={totalPoints}
          itemState={itemState}
          itemSaveState={itemSaveState}
          onSelectItem={setSelectedItemUuid}
          onItemCreated={async (uuid) => {
            await refresh();
            setSelectedItemUuid(uuid);
          }}
          onItemDeleted={async () => {
            setSelectedItemUuid(null);
            await refresh();
          }}
          onItemDuplicated={async (uuid) => {
            await refresh();
            setSelectedItemUuid(uuid);
          }}
          onReorder={handleReorder}
          onItemChange={setItemState}
          renderItemBodyEditor={(currentItem) => (
            <NativeItemBodyEditor
              item={currentItem}
              disabled={!isEditable}
              issues={itemContentIssues}
              onChange={setItemState}
            />
          )}
        />
      )}

      {activeTab === 'PUBLISH' && (
        <PublishDashboardTab
          assessmentUuid={assessment.assessment_uuid}
          lifecycle={assessment.lifecycle}
          items={orderedItems}
          totalPoints={totalPoints}
          assessmentState={assessmentState}
          validationIssues={allIssues}
          canPublish={items.length > 0 && allIssues.length === 0}
          canSchedule={assessment.lifecycle !== 'ARCHIVED'}
          canArchive={assessment.lifecycle !== 'ARCHIVED'}
          onSwitchToBuilder={(itemUuid) => {
            setActiveTab('BUILDER');
            if (itemUuid) setSelectedItemUuid(itemUuid);
          }}
          onLifecycleChange={setLifecycle}
        />
      )}

      {activeTab === 'ACCESS' && (
        <AccessManagementTab
          assessmentUuid={assessment.assessment_uuid}
          disabled={!isEditable}
        />
      )}

      {activeTab === 'RESULTS' && (
        <ResultsReviewTab
          assessmentUuid={assessment.assessment_uuid}
          courseUuid={assessment.course_uuid}
          activityUuid={assessment.activity_uuid}
        />
      )}
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
          <Label>{t('Items.OpenText.prompt')}</Label>
          <MarkdownEditor
            value={body.prompt}
            disabled={disabled}
            placeholder={t('Items.promptPlaceholder')}
            className={hasIssue('open_text.prompt_missing') ? 'border-destructive' : ''}
            preset="questionPrompt"
            onChange={(md) => onChange({ ...item, body: { ...body, kind: 'OPEN_TEXT', prompt: md } })}
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
            <MarkdownEditor
              value={body.rubric ?? ''}
              disabled={disabled}
              preset="explanation"
              minHeight={140}
              onChange={(markdown) =>
                onChange({ ...item, body: { ...body, kind: 'OPEN_TEXT', rubric: markdown || null } })
              }
            />
          </div>
        </div>
        {issues.length > 0 ? <InlineIssueList issues={issues} /> : null}
      </div>
    );
  }

  if (item.body.kind === 'FORM') {
    const { body } = item;
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t('Items.Form.prompt')}</Label>
          <MarkdownEditor
            value={body.prompt}
            disabled={disabled}
            placeholder={t('Items.promptPlaceholder')}
            className={hasIssue('form.prompt_missing') ? 'border-destructive' : ''}
            preset="questionPrompt"
            onChange={(md) => onChange({ ...item, body: { ...body, kind: 'FORM', prompt: md } })}
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
      pass_threshold: state.passThreshold ? Number(state.passThreshold) : null,
      randomize_questions: state.randomizeQuestions,
      randomize_options: state.randomizeOptions,
      partial_credit: state.partialCredit,
      grace_period_minutes: state.gracePeriodMinutes ? Number(state.gracePeriodMinutes) : null,
      available_from: state.availableFrom ? new Date(state.availableFrom).toISOString() : null,
      negative_marking_percent: state.negativeMarkingPercent ? Number(state.negativeMarkingPercent) : 0,
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
    passThreshold: typeof settings.pass_threshold === 'number' ? String(settings.pass_threshold) : '',
    randomizeQuestions: settings.randomize_questions === true,
    randomizeOptions: settings.randomize_options === true,
    partialCredit: settings.partial_credit === true,
    gracePeriodMinutes: typeof settings.grace_period_minutes === 'number' ? String(settings.grace_period_minutes) : '',
    availableFrom: settings.available_from ? toDateTimeLocal(settings.available_from as string) : '',
    negativeMarkingPercent:
      typeof settings.negative_marking_percent === 'number' && settings.negative_marking_percent > 0
        ? String(settings.negative_marking_percent)
        : '',
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
