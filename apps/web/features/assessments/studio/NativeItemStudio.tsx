'use client';

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileUp,
  GitCompareArrows,
  ListTodo,
  LoaderCircle,
  ShieldAlert,
  TextCursorInput,
  Trash2,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { toast } from 'sonner';

import { apiFetch, apiFetcher } from '@/lib/api-client';
import { getAPIUrl } from '@services/config/config';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { KindAuthorProps } from '@/features/assessments/registry';
import type { AssessmentItem } from '@/features/assessments/domain/items';
import type { UnifiedItemKind } from '@/features/assessments/domain/items';
import { isAssessmentEditable } from '@/features/assessments/domain/lifecycle';
import { ChoiceItemAuthor } from '@/features/assessments/items/choice';
import type { ChoiceAuthorValue } from '@/features/assessments/items/choice';
import {
  FileUploadConstraintsEditor,
  type FileUploadConstraints,
} from '@/features/assessments/items/file-upload';
import SaveStateBadge from '@/features/assessments/shared/SaveStateBadge';
import type { SaveState } from '@/features/assessments/shared/SaveStateBadge';
import ErrorUI from '@/components/Objects/Elements/Error/Error';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

interface AssessmentStudioContextValue {
  activityUuid: string;
  assessment: AssessmentStudioDetail;
  items: AssessmentItem[];
  selectedItemUuid: string | null;
  setSelectedItemUuid: (uuid: string | null) => void;
  refresh: () => Promise<void>;
  isEditable: boolean;
  totalPoints: number;
}

const AssessmentStudioContext = createContext<AssessmentStudioContextValue | null>(null);

const KIND_ICONS: Record<SupportedStudioItemKind, typeof ListTodo> = {
  CHOICE: ListTodo,
  OPEN_TEXT: BookOpen,
  FILE_UPLOAD: FileUp,
  FORM: TextCursorInput,
  MATCHING: GitCompareArrows,
};

const KIND_LABELS: Record<SupportedStudioItemKind, string> = {
  CHOICE: 'Choice',
  OPEN_TEXT: 'Open text',
  FILE_UPLOAD: 'File upload',
  FORM: 'Form',
  MATCHING: 'Matching',
};

export function NativeItemStudioProvider({ activityUuid, children }: KindAuthorProps & { children: React.ReactNode }) {
  const normalizedActivityUuid = activityUuid.replace(/^activity_/, '');
  const queryClient = useQueryClient();
  const { data: assessment, isLoading, error } = useQuery({
    queryKey: queryKeys.assessments.activity(normalizedActivityUuid),
    queryFn: () =>
      apiFetcher(`${getAPIUrl()}assessments/activity/${normalizedActivityUuid}`) as Promise<AssessmentStudioDetail>,
    enabled: Boolean(normalizedActivityUuid),
  });

  const [selectedItemUuid, setSelectedItemUuid] = useState<string | null>(null);

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

  if (error) return <ErrorUI message="Unable to load assessment studio." />;
  if (isLoading || !assessment) return <PageLoading />;

  const items = Array.isArray(assessment.items) ? assessment.items : [];
  const totalPoints = items.reduce((sum, item) => sum + (Number(item.max_score) || 0), 0);
  const isEditable = isAssessmentEditable(assessment.lifecycle);

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
}: {
  allowedKinds: SupportedStudioItemKind[];
  itemNoun: string;
}) {
  const { assessment, items, selectedItemUuid, setSelectedItemUuid, refresh, isEditable, totalPoints } =
    useAssessmentStudioContext();
  const [isCreating, startTransition] = useTransition();

  const createItem = (kind: SupportedStudioItemKind) => {
    startTransition(async () => {
      try {
        const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildDefaultItemPayload(kind)),
        });

        if (!response.ok) {
          throw new Error(await responseError(response, `Failed to create ${itemNoun.toLowerCase()}`));
        }

        const created = (await response.json()) as { item_uuid?: string };
        toast.success(`${itemNoun} created`);
        await refresh();
        if (typeof created.item_uuid === 'string') {
          setSelectedItemUuid(created.item_uuid);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Failed to create ${itemNoun.toLowerCase()}`);
      }
    });
  };

  return (
    <aside className="bg-muted/20 p-4 lg:sticky lg:top-[88px] lg:h-[calc(100vh-88px)] lg:overflow-y-auto">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{itemNoun} outline</h2>
          <p className="text-muted-foreground text-xs">{totalPoints} total points</p>
        </div>
      </div>

      {isEditable ? (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {allowedKinds.map((kind) => {
            const Icon = KIND_ICONS[kind];
            return (
              <Button
                key={kind}
                type="button"
                variant="outline"
                size="sm"
                disabled={isCreating}
                className="h-10 px-2"
                onClick={() => createItem(kind)}
                title={`Add ${KIND_LABELS[kind]}`}
              >
                {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <Icon className="size-4" />}
              </Button>
            );
          })}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
          Add a {itemNoun.toLowerCase()} to begin.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => {
            const Icon = KIND_ICONS[item.kind as SupportedStudioItemKind] ?? BookOpen;
            const issues = getItemIssues(item);
            const selected = item.item_uuid === selectedItemUuid;
            return (
              <button
                key={item.item_uuid}
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
                        {index + 1}. {item.title || `Untitled ${itemNoun.toLowerCase()}`}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span>{item.max_score || 0} pts</span>
                      <span>{KIND_LABELS[item.kind as SupportedStudioItemKind] ?? item.kind}</span>
                    </div>
                  </div>
                  {issues.length > 0 ? (
                    <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                  )}
                </div>
                {issues.length > 0 ? <p className="mt-2 text-xs text-amber-700">{issues[0]}</p> : null}
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

interface NativeItemAuthorProps {
  mode: StudioMode;
  itemNoun: string;
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

export function NativeItemAuthor({ mode, itemNoun }: NativeItemAuthorProps) {
  const { assessment, items, selectedItemUuid, setSelectedItemUuid, refresh, isEditable, totalPoints } =
    useAssessmentStudioContext();
  const item = items.find((candidate) => candidate.item_uuid === selectedItemUuid) ?? items[0] ?? null;
  const [assessmentState, setAssessmentState] = useState<AssessmentEditorState>(() =>
    toAssessmentEditorState(assessment),
  );
  const [itemState, setItemState] = useState<EditableItem | null>(item ? toEditableItem(item) : null);
  const [assessmentSaveState, setAssessmentSaveState] = useState<SaveState>('idle');
  const [itemSaveState, setItemSaveState] = useState<SaveState>('idle');
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
  }, [item?.item_uuid, item?.updated_at]);

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
        toast.error(error instanceof Error ? error.message : 'Failed to save assessment settings');
      }
    },
    [assessment, mode, refresh],
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
          throw new Error(await responseError(response, `Failed to save ${itemNoun.toLowerCase()}`));
        }

        lastSavedItemRef.current = serializeItemState(nextItem);
        setItemSaveState('saved');
        await refresh();
      } catch (error) {
        setItemSaveState('error');
        toast.error(error instanceof Error ? error.message : `Failed to save ${itemNoun.toLowerCase()}`);
      }
    },
    [assessment.assessment_uuid, itemNoun, refresh],
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
          throw new Error(await responseError(response, `Failed to delete ${itemNoun.toLowerCase()}`));
        }
        toast.success(`${itemNoun} deleted`);
        setSelectedItemUuid(null);
        await refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Failed to delete ${itemNoun.toLowerCase()}`);
      }
    });
  };

  const itemIssues = itemState ? getItemIssues(itemState) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <section className="bg-card rounded-lg border p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Assessment details</h3>
            <p className="text-muted-foreground text-xs">
              Title, instructions, schedule, and {mode === 'exam' ? 'exam policy' : 'grading settings'}.
            </p>
          </div>
          <SaveStateBadge state={assessmentSaveState} />
        </div>
        <AssessmentMetadataForm
          mode={mode}
          state={assessmentState}
          disabled={!isEditable}
          onChange={setAssessmentState}
        />
      </section>

      {!itemState ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed p-8">
          <div className="max-w-sm text-center">
            <BookOpen className="text-muted-foreground mx-auto size-10" />
            <h2 className="mt-3 text-lg font-semibold">No {itemNoun.toLowerCase()} selected</h2>
            <p className="text-muted-foreground mt-1 text-sm">Create or select a {itemNoun.toLowerCase()} from the outline.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{KIND_LABELS[itemState.kind as SupportedStudioItemKind] ?? itemState.kind}</Badge>
                <SaveStateBadge state={itemSaveState} />
                {!isEditable ? <Badge variant="secondary">Read only</Badge> : null}
              </div>
              <h2 className="mt-2 text-xl font-semibold">{itemState.title || `Untitled ${itemNoun.toLowerCase()}`}</h2>
              <p className="text-muted-foreground text-sm">
                {itemState.max_score || 0} pts · {totalPoints > 0 ? Math.round((itemState.max_score / totalPoints) * 100) : 0}% weight
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!isEditable || isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete
            </Button>
          </div>

          {itemIssues.length > 0 ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertDescription>{itemIssues.join(' ')}</AlertDescription>
            </Alert>
          ) : null}

          <section className="bg-card rounded-lg border p-4 md:p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold">{itemNoun} metadata</h3>
              <p className="text-muted-foreground text-xs">Shared title, prompt, and point value.</p>
            </div>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="native-item-title">Title</Label>
                <Input
                  id="native-item-title"
                  value={itemState.title}
                  disabled={!isEditable}
                  onChange={(event) => setItemState({ ...itemState, title: event.target.value })}
                />
              </div>
              <div className="space-y-2 max-w-48">
                <Label htmlFor="native-item-points">Points</Label>
                <Input
                  id="native-item-points"
                  type="number"
                  min={0.01}
                  step={0.5}
                  value={itemState.max_score}
                  disabled={!isEditable}
                  onChange={(event) =>
                    setItemState({
                      ...itemState,
                      max_score: event.target.value ? Number(event.target.value) : 0,
                    })
                  }
                />
              </div>
            </div>
          </section>

          <section className="bg-card rounded-lg border p-4 md:p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold">{itemNoun} content</h3>
              <p className="text-muted-foreground text-xs">Canonical item authoring.</p>
            </div>
            <NativeItemBodyEditor
              item={itemState}
              disabled={!isEditable}
              onChange={setItemState}
            />
          </section>
        </>
      )}
    </div>
  );
}

function AssessmentMetadataForm({
  mode,
  state,
  disabled,
  onChange,
}: {
  mode: StudioMode;
  state: AssessmentEditorState;
  disabled: boolean;
  onChange: (nextState: AssessmentEditorState) => void;
}) {
  return (
    <div className="grid gap-6">
      <div className="space-y-2">
        <Label htmlFor="assessment-title">Title</Label>
        <Input
          id="assessment-title"
          value={state.title}
          disabled={disabled}
          onChange={(event) => onChange({ ...state, title: event.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="assessment-description">Description</Label>
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
          <Label htmlFor="assessment-due-at">Due date</Label>
          <Input
            id="assessment-due-at"
            type="datetime-local"
            value={state.dueAt}
            disabled={disabled}
            onChange={(event) => onChange({ ...state, dueAt: event.target.value })}
          />
        </div>

        {mode === 'assignment' ? (
          <div className="space-y-2">
            <Label htmlFor="assessment-grading-type">Grading mode</Label>
            <NativeSelect
              id="assessment-grading-type"
              value={state.gradingType}
              disabled={disabled}
              className="w-full"
              onChange={(event) => onChange({ ...state, gradingType: event.target.value as AssessmentEditorState['gradingType'] })}
            >
              <NativeSelectOption value="NUMERIC">Numeric</NativeSelectOption>
              <NativeSelectOption value="PERCENTAGE">Percentage</NativeSelectOption>
            </NativeSelect>
          </div>
        ) : null}
      </div>

      {mode === 'exam' ? (
        <>
          <div className="rounded-lg border p-4">
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="size-4" />
              <h4 className="text-sm font-semibold">Exam policy</h4>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="exam-max-attempts">Attempt limit</Label>
                <Input
                  id="exam-max-attempts"
                  type="number"
                  min={1}
                  value={state.maxAttempts}
                  disabled={disabled}
                  onChange={(event) => onChange({ ...state, maxAttempts: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-time-limit">Time limit, minutes</Label>
                <Input
                  id="exam-time-limit"
                  type="number"
                  min={1}
                  value={state.timeLimitMinutes}
                  disabled={disabled}
                  onChange={(event) => onChange({ ...state, timeLimitMinutes: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-violation-threshold">Violation threshold</Label>
                <Input
                  id="exam-violation-threshold"
                  type="number"
                  min={1}
                  value={state.violationThreshold}
                  disabled={disabled}
                  onChange={(event) => onChange({ ...state, violationThreshold: event.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ToggleRow
              label="Copy/paste protection"
              checked={state.copyPasteProtection}
              disabled={disabled}
              onChange={(checked) => onChange({ ...state, copyPasteProtection: checked })}
            />
            <ToggleRow
              label="Tab switch detection"
              checked={state.tabSwitchDetection}
              disabled={disabled}
              onChange={(checked) => onChange({ ...state, tabSwitchDetection: checked })}
            />
            <ToggleRow
              label="DevTools detection"
              checked={state.devtoolsDetection}
              disabled={disabled}
              onChange={(checked) => onChange({ ...state, devtoolsDetection: checked })}
            />
            <ToggleRow
              label="Right-click disabled"
              checked={state.rightClickDisable}
              disabled={disabled}
              onChange={(checked) => onChange({ ...state, rightClickDisable: checked })}
            />
            <ToggleRow
              label="Fullscreen enforcement"
              checked={state.fullscreenEnforcement}
              disabled={disabled}
              onChange={(checked) => onChange({ ...state, fullscreenEnforcement: checked })}
            />
            <ToggleRow
              label="Allow result review"
              checked={state.allowResultReview}
              disabled={disabled}
              onChange={(checked) => onChange({ ...state, allowResultReview: checked })}
            />
            <ToggleRow
              label="Show correct answers"
              checked={state.showCorrectAnswers}
              disabled={disabled}
              onChange={(checked) => onChange({ ...state, showCorrectAnswers: checked })}
            />
          </div>
        </>
      ) : null}
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
  onChange,
}: {
  item: EditableItem;
  disabled: boolean;
  onChange: (nextItem: EditableItem) => void;
}) {
  if (item.body.kind === 'CHOICE' || item.body.kind === 'MATCHING') {
    return (
      <ChoiceItemAuthor
        value={toChoiceAuthorValue(item.body)}
        disabled={disabled}
        onChange={(nextValue) => onChange({ ...item, ...fromChoiceAuthorValue(item, nextValue) })}
      />
    );
  }

  if (item.body.kind === 'OPEN_TEXT') {
    const body = item.body;
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="open-text-prompt">Prompt</Label>
          <Textarea
            id="open-text-prompt"
            value={body.prompt}
            disabled={disabled}
            className="min-h-32"
            onChange={(event) => onChange({ ...item, body: { ...body, kind: 'OPEN_TEXT', prompt: event.target.value } })}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
          <div className="space-y-2">
            <Label htmlFor="open-text-min-words">Minimum words</Label>
            <Input
              id="open-text-min-words"
              type="number"
              min={0}
              value={body.min_words ?? ''}
              disabled={disabled}
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
            <Label htmlFor="open-text-rubric">Rubric</Label>
            <Textarea
              id="open-text-rubric"
              value={body.rubric ?? ''}
              disabled={disabled}
              className="min-h-24"
              onChange={(event) => onChange({ ...item, body: { ...body, kind: 'OPEN_TEXT', rubric: event.target.value || null } })}
            />
          </div>
        </div>
      </div>
    );
  }

  if (item.body.kind === 'FILE_UPLOAD') {
    const body = item.body;
    const constraints: FileUploadConstraints = {
      kind: 'FILE_UPLOAD',
      allowed_mime_types: body.mimes,
      max_file_size_mb: body.max_mb ?? null,
      max_files: body.max_files,
    };

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="file-upload-prompt">Prompt</Label>
          <Textarea
            id="file-upload-prompt"
            value={body.prompt}
            disabled={disabled}
            className="min-h-24"
            onChange={(event) => onChange({ ...item, body: { ...body, kind: 'FILE_UPLOAD', prompt: event.target.value } })}
          />
        </div>
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
    const body = item.body;
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="form-prompt">Prompt</Label>
          <Textarea
            id="form-prompt"
            value={body.prompt}
            disabled={disabled}
            className="min-h-24"
            onChange={(event) => onChange({ ...item, body: { ...body, kind: 'FORM', prompt: event.target.value } })}
          />
        </div>

        <div className="space-y-3">
          {body.fields.map((field, index) => (
            <div
              key={field.id}
              className="rounded-lg border p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Field {index + 1}</span>
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
                <div className="space-y-2">
                  <Label htmlFor={`form-field-label-${field.id}`}>Label</Label>
                  <Input
                    id={`form-field-label-${field.id}`}
                    value={field.label}
                    disabled={disabled}
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
                <div className="space-y-2">
                  <Label htmlFor={`form-field-type-${field.id}`}>Type</Label>
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
                    <NativeSelectOption value="text">Text</NativeSelectOption>
                    <NativeSelectOption value="textarea">Textarea</NativeSelectOption>
                    <NativeSelectOption value="number">Number</NativeSelectOption>
                    <NativeSelectOption value="date">Date</NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className="flex items-end">
                  <ToggleRow
                    label="Required"
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
          Add field
        </Button>
      </div>
    );
  }

  return <div className="text-muted-foreground text-sm">Unsupported item kind.</div>;
}

function buildDefaultItemPayload(kind: SupportedStudioItemKind) {
  if (kind === 'CHOICE') {
    return {
      kind,
      title: 'Untitled item',
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
      title: 'Untitled item',
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
      title: 'Untitled item',
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
      title: 'Untitled item',
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
    title: 'Untitled item',
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
        : typeof settings.attempt_limit === 'number'
          ? String(settings.attempt_limit)
          : '1',
    timeLimitMinutes:
      typeof assessment.assessment_policy?.time_limit_seconds === 'number'
        ? String(Math.max(1, Math.ceil(assessment.assessment_policy.time_limit_seconds / 60)))
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
    kind:
      body.variant === 'TRUE_FALSE' ? 'TRUE_FALSE' : body.multiple ? 'CHOICE_MULTIPLE' : 'CHOICE_SINGLE',
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
        explanation: item.body.kind === 'MATCHING' ? item.body.explanation ?? null : null,
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
      explanation: item.body.kind === 'CHOICE' ? item.body.explanation ?? null : null,
    },
  };
}

function getItemIssues(item: Pick<AssessmentItem, 'title' | 'body'>): string[] {
  const issues: string[] = [];
  if (!item.title.trim()) {
    issues.push('Title is required.');
  }

  if (item.body.kind === 'CHOICE') {
    if (!item.body.prompt.trim()) issues.push('Prompt is required.');
    if (item.body.options.length < 2) issues.push('Add at least two options.');
    const correctCount = item.body.options.filter((option) => option.is_correct).length;
    if (correctCount === 0) issues.push('Mark at least one correct option.');
    if (!item.body.multiple && correctCount > 1) issues.push('Single-choice items can only have one correct option.');
  }

  if (item.body.kind === 'MATCHING') {
    if (!item.body.prompt.trim()) issues.push('Prompt is required.');
    if (!item.body.pairs.length) issues.push('Add at least one pair.');
    if (item.body.pairs.some((pair) => !pair.left.trim() || !pair.right.trim())) {
      issues.push('Every pair needs both left and right values.');
    }
  }

  if (item.body.kind === 'OPEN_TEXT' && !item.body.prompt.trim()) {
    issues.push('Prompt is required.');
  }

  if (item.body.kind === 'FILE_UPLOAD') {
    if (!item.body.prompt.trim()) issues.push('Prompt is required.');
    if (item.body.max_files < 1) issues.push('Allow at least one file.');
  }

  if (item.body.kind === 'FORM') {
    if (!item.body.prompt.trim()) issues.push('Prompt is required.');
    if (!item.body.fields.length) issues.push('Add at least one field.');
    if (item.body.fields.some((field) => !field.label.trim())) issues.push('Each field needs a label.');
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

async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  const detail = payload && typeof payload === 'object' ? (payload as { detail?: unknown }).detail : null;
  if (typeof detail === 'string' && detail) return detail;
  if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') {
    return detail.message;
  }
  return fallback;
}
