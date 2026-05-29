'use client'

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Copy,
  FolderPlus,
  GitCompareArrows,
  GripVertical,
  ListTodo,
  LoaderCircle,
  Pencil,
  Plus,
  TextCursorInput,
  Trash2,
  X,
} from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslations } from 'next-intl'
import { useTransition, useCallback, useState, useRef, useEffect, useMemo } from 'react'
import { toast } from 'sonner'

import type { AssessmentItem, AssessmentItemMetadata, UnifiedItemKind } from '@/features/assessments/domain/items'
import {
  classifyValidationIssue,
  dedupeIssues,
  itemIssues as persistedItemIssues,
  localItemValidationIssues,
} from '@/features/assessments/domain/readiness'
import type { ValidationIssue } from '@/features/assessments/domain/view-models'
import type { EditableItem } from '@/features/assessments/studio/studioTypes'
import type { SaveState } from '@/features/assessments/shared/SaveStateBadge'
import SaveStateBadge from '@/features/assessments/shared/SaveStateBadge'
import QuestionInspectorPanel from './QuestionInspectorPanel'
import { apiFetch } from '@/lib/api-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type SupportedStudioItemKind = Exclude<UnifiedItemKind, 'CODE'>

const KIND_ICONS: Record<SupportedStudioItemKind, typeof ListTodo> = {
  CHOICE: ListTodo,
  OPEN_TEXT: BookOpen,
  FORM: TextCursorInput,
  MATCHING: GitCompareArrows,
}

interface BuilderCanvasTabProps {
  assessmentUuid: string
  items: AssessmentItem[]
  selectedItemUuid: string | null
  allowedKinds: SupportedStudioItemKind[]
  itemNoun: string
  isEditable: boolean
  validationIssues: ValidationIssue[]
  totalPoints: number
  itemState: EditableItem | null
  itemSaveState: SaveState
  onSelectItem: (uuid: string) => void
  onItemCreated: (uuid: string) => Promise<void>
  onItemDeleted: () => Promise<void>
  onItemDuplicated: (uuid: string) => Promise<void>
  onReorder: (orderedUuids: string[]) => Promise<void>
  onItemMetadataChange: (itemUuid: string, metadata: AssessmentItemMetadata) => Promise<void>
  onItemChange: (nextItem: EditableItem) => void
  renderItemBodyEditor: (item: EditableItem) => React.ReactNode
}

// ─── Exam Sections ───────────────────────────────────────────────────────────

export interface ExamSection {
  id: string
  label: string
  /** This section header appears immediately before the item with this uuid */
  beforeItemUuid: string
}

// ─────────────────────────────────────────────────────────────────────────────

export default function BuilderCanvasTab({
  assessmentUuid,
  items,
  selectedItemUuid,
  allowedKinds,
  itemNoun,
  isEditable,
  validationIssues,
  totalPoints,
  itemState,
  itemSaveState,
  onSelectItem,
  onItemCreated,
  onItemDeleted,
  onItemDuplicated,
  onReorder,
  onItemMetadataChange,
  onItemChange,
  renderItemBodyEditor,
}: BuilderCanvasTabProps) {
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio')
  const tBuilder = useTranslations('Features.Assessments.Studio.BuilderCanvas')
  const [isCreating, startCreateTransition] = useTransition()
  const [isDuplicating, startDuplicateTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const sections = useMemo(
    () =>
      items.flatMap(item => {
        const sectionLabel = item.metadata?.section_label
        return sectionLabel
          ? [
              {
                id: item.item_uuid,
                label: sectionLabel,
                beforeItemUuid: item.item_uuid,
              },
            ]
          : []
      }),
    [items],
  )

  const kindLabels: Record<SupportedStudioItemKind, string> = {
    CHOICE: t('kindLabels.choice'),
    OPEN_TEXT: t('kindLabels.openText'),
    FORM: t('kindLabels.form'),
    MATCHING: t('kindLabels.matching'),
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = items.findIndex(item => item.item_uuid === active.id)
      const newIndex = items.findIndex(item => item.item_uuid === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = [...items]
      const [moved] = reordered.splice(oldIndex, 1)
      if (moved) reordered.splice(newIndex, 0, moved)
      void onReorder(reordered.map(item => item.item_uuid))
    },
    [items, onReorder],
  )

  const createItem = (kind: SupportedStudioItemKind) => {
    startCreateTransition(async () => {
      try {
        const body = buildDefaultItemPayload(kind, t('defaultItemTitle'))
        const response = await apiFetch(`assessments/${assessmentUuid}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!response.ok) throw new Error('Failed to create item')
        const created = (await response.json()) as { item_uuid?: string }
        toast.success(t('itemCreated', { itemNoun }))
        if (typeof created.item_uuid === 'string') {
          await onItemCreated(created.item_uuid)
        }
      } catch {
        toast.error(t('createFailed', { itemNoun: itemNoun.toLowerCase() }))
      }
    })
  }

  const handleDuplicate = () => {
    if (!itemState) return
    startDuplicateTransition(async () => {
      try {
        const response = await apiFetch(`assessments/${assessmentUuid}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: itemState.kind,
            title: itemState.title ? t('copyOf', { title: itemState.title }) : t('copyOfItem', { itemNoun }),
            max_score: itemState.max_score,
            body: structuredClone(itemState.body),
            metadata: structuredClone(itemState.metadata),
          }),
        })
        if (!response.ok) throw new Error('Failed to duplicate item')
        const created = (await response.json()) as { item_uuid?: string }
        toast.success(t('itemDuplicated', { itemNoun }))
        if (typeof created.item_uuid === 'string') {
          await onItemDuplicated(created.item_uuid)
        }
      } catch {
        toast.error(t('duplicateFailed', { itemNoun: itemNoun.toLowerCase() }))
      }
    })
  }

  const handleDelete = () => {
    if (!itemState) return
    startDeleteTransition(async () => {
      try {
        const response = await apiFetch(`assessments/${assessmentUuid}/items/${itemState.item_uuid}`, {
          method: 'DELETE',
        })
        if (!response.ok) throw new Error('Failed to delete item')
        toast.success(t('itemDeleted', { itemNoun }))
        await onItemDeleted()
      } catch {
        toast.error(t('deleteFailed', { itemNoun: itemNoun.toLowerCase() }))
      }
    })
  }

  const patchItemMetadata = useCallback(
    async (itemUuid: string, metadata: AssessmentItemMetadata) => {
      await onItemMetadataChange(itemUuid, metadata)
    },
    [onItemMetadataChange],
  )

  return (
    <div className="flex h-[calc(100vh-120px)] overflow-hidden">
      {/* Left Outline Sidebar */}
      <aside className="bg-card/60 flex w-80 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{t('outlineTitle', { itemNoun })}</h2>
            <p className="text-muted-foreground text-xs">{t('outlinePoints', { points: totalPoints })}</p>
          </div>
        </div>

        {/* New question menu */}
        {isEditable ? (
          <div className="border-b p-3">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" className="w-full justify-center" disabled={isCreating}>
                    {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    {tBuilder('newQuestion')}
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="w-64">
                {allowedKinds.map(kind => {
                  const Icon = KIND_ICONS[kind]
                  return (
                    <DropdownMenuItem key={kind} onSelect={() => createItem(kind)}>
                      <Icon className="mr-2 size-4" />
                      {kindLabels[kind]}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}

        {/* Sortable item list */}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="text-muted-foreground flex h-full items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs">
              {t('outlineEmptyMessage', { itemNoun: itemNoun.toLowerCase() })}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map(item => item.item_uuid)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {items.map((item, index) => {
                    const itemSections = sections.filter(s => s.beforeItemUuid === item.item_uuid)
                    return (
                      <div key={item.item_uuid}>
                        {itemSections.map(section => (
                          <SectionHeader
                            key={section.id}
                            section={section}
                            isEditable={isEditable}
                            onRename={label => {
                              const item = items.find(candidate => candidate.item_uuid === section.beforeItemUuid)
                              if (!item) return
                              void patchItemMetadata(item.item_uuid, {
                                ...defaultMetadata(item.metadata),
                                section_label: label,
                              })
                            }}
                            onDelete={() => {
                              const item = items.find(candidate => candidate.item_uuid === section.beforeItemUuid)
                              if (!item) return
                              void patchItemMetadata(item.item_uuid, {
                                ...defaultMetadata(item.metadata),
                                section_label: null,
                              })
                            }}
                          />
                        ))}
                        <SortableOutlineItem
                          item={item}
                          index={index}
                          selected={item.item_uuid === selectedItemUuid}
                          kindLabel={kindLabels[item.kind as SupportedStudioItemKind] ?? item.kind}
                          validationIssues={validationIssues}
                          disabled={!isEditable}
                          onSelect={() => onSelectItem(item.item_uuid)}
                          {...(isEditable
                            ? {
                                onAddSectionBefore: () =>
                                  void patchItemMetadata(item.item_uuid, {
                                    ...defaultMetadata(item.metadata),
                                    section_label: tBuilder('defaultSectionLabel', {
                                      n: sections.length + 1,
                                    }),
                                  }),
                              }
                            : {})}
                        />
                      </div>
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </aside>

      {/* Middle Canvas */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {!itemState ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="max-w-sm text-center">
              <div className="bg-muted mx-auto mb-4 flex size-16 items-center justify-center rounded-full">
                <BookOpen className="text-muted-foreground size-7" />
              </div>
              <h3 className="text-lg font-semibold">
                {t('noItemSelectedTitle', { itemNoun: itemNoun.toLowerCase() })}
              </h3>
              <p className="text-muted-foreground mt-1.5 text-sm">
                {t('noItemSelectedDescription', {
                  itemNoun: itemNoun.toLowerCase(),
                })}
              </p>
              {isEditable && allowedKinds.length > 0 && allowedKinds[0]
                ? (() => {
                    const firstKind = allowedKinds[0]
                    return (
                      <Button className="mt-4" onClick={() => createItem(firstKind)} disabled={isCreating}>
                        <Plus className="size-4" />
                        {t('addKind', { kind: kindLabels[firstKind] })}
                      </Button>
                    )
                  })()
                : null}
            </div>
          </div>
        ) : (
          <ItemCanvas
            item={itemState}
            items={items}
            totalPoints={totalPoints}
            itemNoun={itemNoun}
            kindLabel={kindLabels[itemState.kind as SupportedStudioItemKind] ?? itemState.kind}
            saveState={itemSaveState}
            isEditable={isEditable}
            isDuplicating={isDuplicating}
            isDeleting={isDeleting}
            validationIssues={validationIssues}
            onChange={onItemChange}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            renderBodyEditor={renderItemBodyEditor}
          />
        )}
      </main>

      {/* Right Inspector */}
      {itemState ? (
        <QuestionInspectorPanel
          item={itemState}
          isEditable={isEditable}
          isOpen={inspectorOpen}
          onToggle={() => setInspectorOpen(v => !v)}
          onChange={onItemChange}
        />
      ) : null}
    </div>
  )
}

function SectionHeader({
  section,
  isEditable,
  onRename,
  onDelete,
}: {
  section: ExamSection
  isEditable: boolean
  onRename: (label: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(section.label)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed) onRename(trimmed)
    else setDraft(section.label)
    setEditing(false)
  }

  return (
    <div className="group mt-2 mb-1 flex items-center gap-1 px-1">
      <div className="bg-border h-px flex-1" />
      {editing ? (
        <Input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft(section.label)
              setEditing(false)
            }
          }}
          className="text-muted-foreground h-5 w-32 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase focus-visible:ring-1"
        />
      ) : (
        <span className="text-muted-foreground text-[10px] font-semibold tracking-wider whitespace-nowrap uppercase select-none">
          {section.label}
        </span>
      )}
      {isEditable ? (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setEditing(true)}
            className="hover:text-foreground text-muted-foreground h-5 w-5"
          >
            <Pencil className="size-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="h-5 w-5 text-red-400 hover:text-red-600"
          >
            <X className="size-3" />
          </Button>
        </div>
      ) : null}
      <div className="bg-border h-px flex-1" />
    </div>
  )
}

function SortableOutlineItem({
  item,
  index,
  selected,
  kindLabel,
  validationIssues,
  disabled,
  onSelect,
  onAddSectionBefore,
}: {
  item: AssessmentItem
  index: number
  selected: boolean
  kindLabel: string
  validationIssues: ValidationIssue[]
  disabled: boolean
  onSelect: () => void
  onAddSectionBefore?: () => void
}) {
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio')
  const tBuilder = useTranslations('Features.Assessments.Studio.BuilderCanvas')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.item_uuid,
    disabled,
  })

  const issues = dedupeIssues([
    ...localItemValidationIssues(item),
    ...persistedItemIssues(validationIssues, item.item_uuid),
  ])
  const hasIssues = issues.length > 0
  const Icon = KIND_ICONS[item.kind as SupportedStudioItemKind] ?? BookOpen

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className={cn('group relative', isDragging && 'z-50 opacity-60')}>
      <div
        role="button"
        tabIndex={0}
        id={`item-${item.item_uuid}`}
        onClick={onSelect}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
        className={cn(
          'h-auto w-full rounded-lg border p-3 text-left transition-all duration-150 cursor-pointer block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'hover:bg-muted/50',
          selected ? 'border-primary bg-primary/5 ring-primary/20 ring-2' : 'bg-background border-border',
        )}
      >
        <div className="flex items-start gap-2">
          {/* Drag handle */}
          {!disabled && (
            <div
              {...attributes}
              {...listeners}
              className="mt-0.5 shrink-0 cursor-grab touch-none opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
              onClick={e => e.stopPropagation()}
            >
              <GripVertical className="text-muted-foreground size-3.5" />
            </div>
          )}
          <Icon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">
              {index + 1}. {item.title || '—'}
            </p>
            <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[10px]">
              <span>{t('pointsCompact', { points: item.max_score ?? 0 })}</span>
              <span>·</span>
              <span>{kindLabel}</span>
            </div>
          </div>
          {hasIssues ? (
            <Tooltip>
              <TooltipTrigger render={<AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />} />
              <TooltipContent side="right" className="max-w-[200px]">
                <ul className="space-y-1 text-xs">
                  {issues.slice(0, 3).map((issue, i) => (
                    <li key={i}>• {issue.message}</li>
                  ))}
                  {issues.length > 3 && <li>{t('moreIssues', { count: issues.length - 3 })}</li>}
                </ul>
              </TooltipContent>
            </Tooltip>
          ) : (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-lime-500" />
          )}
          {onAddSectionBefore ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-0.5 h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100"
                    onClick={e => {
                      e.stopPropagation()
                      onAddSectionBefore()
                    }}
                  >
                    <FolderPlus className="text-muted-foreground size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="right">
                <span className="text-xs">{tBuilder('addSectionBefore')}</span>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ItemCanvas({
  item,
  items,
  totalPoints,
  itemNoun,
  kindLabel,
  saveState,
  isEditable,
  isDuplicating,
  isDeleting,
  validationIssues,
  onChange,
  onDuplicate,
  onDelete,
  renderBodyEditor,
}: {
  item: EditableItem
  items: AssessmentItem[]
  totalPoints: number
  itemNoun: string
  kindLabel: string
  saveState: SaveState
  isEditable: boolean
  isDuplicating: boolean
  isDeleting: boolean
  validationIssues: ValidationIssue[]
  onChange: (nextItem: EditableItem) => void
  onDuplicate: () => void
  onDelete: () => void
  renderBodyEditor: (item: EditableItem) => React.ReactNode
}) {
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio')
  const itemIssueList = dedupeIssues([
    ...localItemValidationIssues(item),
    ...persistedItemIssues(validationIssues, item.item_uuid),
  ]).map(classifyValidationIssue)
  const itemMetadataIssues = itemIssueList.filter(issue => issue.area === 'item-metadata')
  const hasMetadataIssue = (field: string) => itemMetadataIssues.some(issue => issue.field === field)
  const itemIndex = items.findIndex(i => i.item_uuid === item.item_uuid)

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8">
      {/* Canvas Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {kindLabel}
            </Badge>
            {itemIndex !== -1 ? <span className="text-muted-foreground text-xs">#{itemIndex + 1}</span> : null}
            <SaveStateBadge state={saveState} />
            {!isEditable ? (
              <Badge variant="secondary" className="text-xs">
                {t('readOnlyBadge')}
              </Badge>
            ) : null}
          </div>
          <h2 className="mt-2 text-xl font-semibold">
            {item.title || t('untitledItem', { itemNoun: itemNoun.toLowerCase() })}
          </h2>
          {totalPoints > 0 ? (
            <p className="text-muted-foreground mt-0.5 text-sm">
              {item.max_score || 0} {t('pointsAbbreviation')} ·{' '}
              {Math.round(((item.max_score || 0) / totalPoints) * 100)}% {t('weightLabel')}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!isEditable || isDuplicating}
            onClick={onDuplicate}
          >
            {isDuplicating ? <LoaderCircle className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
            {t('duplicate')}
          </Button>
          <Button type="button" variant="destructive" size="sm" disabled={!isEditable || isDeleting} onClick={onDelete}>
            {isDeleting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            {t('delete')}
          </Button>
        </div>
      </div>

      {/* Item Metadata */}
      <section className="bg-card rounded-xl border p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold">{t('itemMetadataTitle', { itemNoun })}</h3>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_10rem]">
          <div className="space-y-2">
            <Label htmlFor="canvas-item-title">{t('titleLabel')}</Label>
            <Input
              id="canvas-item-title"
              value={item.title}
              disabled={!isEditable}
              aria-invalid={hasMetadataIssue('title')}
              className={cn(hasMetadataIssue('title') && 'border-amber-500 focus-visible:ring-amber-500/40')}
              onChange={e => onChange({ ...item, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="canvas-item-points">{t('pointsLabel')}</Label>
            <Input
              id="canvas-item-points"
              type="number"
              min={0.01}
              step={0.5}
              value={item.max_score}
              disabled={!isEditable}
              aria-invalid={hasMetadataIssue('max_score')}
              className={cn(hasMetadataIssue('max_score') && 'border-amber-500 focus-visible:ring-amber-500/40')}
              onChange={e =>
                onChange({
                  ...item,
                  max_score: e.target.value ? Number(e.target.value) : 0,
                })
              }
            />
          </div>
        </div>
      </section>

      {/* Item Body Editor */}
      <section className="bg-card rounded-xl border p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold">{t('itemContentTitle', { itemNoun })}</h3>
        {renderBodyEditor(item)}
      </section>
    </div>
  )
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
    }
  }
  if (kind === 'MATCHING') {
    return {
      kind,
      title: defaultTitle,
      max_score: 1,
      body: { kind, prompt: '', pairs: [{ left: '', right: '' }] },
    }
  }
  if (kind === 'FORM') {
    return {
      kind,
      title: defaultTitle,
      max_score: 1,
      body: {
        kind,
        prompt: '',
        fields: [
          {
            id: `field_${crypto.randomUUID()}`,
            label: '',
            field_type: 'text',
            required: false,
          },
        ],
      },
    }
  }
  return {
    kind,
    title: defaultTitle,
    max_score: 1,
    body: { kind, prompt: '', min_words: null, rubric: null },
  }
}

function createChoiceOption() {
  return { id: `option_${crypto.randomUUID()}`, text: '', is_correct: false }
}

function defaultMetadata(metadata: AssessmentItemMetadata | null | undefined): AssessmentItemMetadata {
  return {
    section_label: metadata?.section_label ?? null,
    difficulty: metadata?.difficulty ?? null,
    tags: metadata?.tags ?? [],
    outcome_ids: metadata?.outcome_ids ?? [],
    estimated_minutes: metadata?.estimated_minutes ?? null,
  }
}
