import { useTransition } from 'react'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  GitCompareArrows,
  ListTodo,
  LoaderCircle,
  TextCursorInput,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useAssessmentStudioContext } from '../context'
import {
  dedupeIssues,
  itemIssues as persistedItemIssues,
  localItemValidationIssues,
} from '@/features/assessments/domain/readiness'
import { InlineIssueMessage } from './ValidationIssues'
import { buildDefaultItemPayload, responseError } from '../utils'
import type { SupportedStudioItemKind } from '../utils'

const KIND_ICONS: Record<SupportedStudioItemKind, typeof ListTodo> = {
  CHOICE: ListTodo,
  OPEN_TEXT: BookOpen,
  FORM: TextCursorInput,
  MATCHING: GitCompareArrows,
}

interface NativeItemOutlineProps {
  allowedKinds: SupportedStudioItemKind[]
  itemNoun: string
  itemNounKey?: 'question' | 'task'
}

export function NativeItemOutline({ allowedKinds, itemNoun, itemNounKey }: NativeItemOutlineProps) {
  const {
    assessment,
    items,
    selectedItemUuid,
    setSelectedItemUuid,
    refresh,
    isEditable,
    totalPoints,
    validationIssues,
  } = useAssessmentStudioContext()
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio')
  const displayItemNoun = itemNounKey ? t(`itemNouns.${itemNounKey}` as unknown as Parameters<typeof t>[0]) : itemNoun
  const kindLabels: Record<SupportedStudioItemKind, string> = {
    CHOICE: t('kindLabels.choice'),
    OPEN_TEXT: t('kindLabels.openText'),
    FORM: t('kindLabels.form'),
    MATCHING: t('kindLabels.matching'),
  }
  const [isCreating, startTransition] = useTransition()

  const createItem = (kind: SupportedStudioItemKind) => {
    startTransition(async () => {
      try {
        const response = await apiFetch(`assessments/${assessment.assessment_uuid}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildDefaultItemPayload(kind, t('defaultItemTitle'))),
        })

        if (!response.ok) {
          throw new Error(await responseError(response, t('createFailed', { itemNoun: displayItemNoun.toLowerCase() })))
        }

        const created = (await response.json()) as { item_uuid?: string }
        toast.success(t('itemCreated', { itemNoun: displayItemNoun }))
        await refresh()
        if (typeof created.item_uuid === 'string') {
          setSelectedItemUuid(created.item_uuid)
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t('createFailed', { itemNoun: displayItemNoun.toLowerCase() }),
        )
      }
    })
  }

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
                <Button type="button" className="w-full justify-center" disabled={isCreating}>
                  {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <ListTodo className="size-4" />}
                  {t('newQuestion')}
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

      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
          {t('outlineEmptyMessage', { itemNoun: displayItemNoun.toLowerCase() })}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => {
            const Icon = KIND_ICONS[item.kind as SupportedStudioItemKind] ?? BookOpen
            const issues = dedupeIssues([
              ...localItemValidationIssues(item),
              ...persistedItemIssues(validationIssues, item.item_uuid),
            ])
            const selected = item.item_uuid === selectedItemUuid
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
                        {index + 1}.{' '}
                        {item.title ||
                          t('untitledItem', {
                            itemNoun: displayItemNoun.toLowerCase(),
                          })}
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
            )
          })}
        </div>
      )}
    </div>
  )
}
