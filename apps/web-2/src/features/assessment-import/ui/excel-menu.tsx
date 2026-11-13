import { Link as RouterLink } from '@tanstack/react-router'
import { ChevronDown, FileSpreadsheet } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AssessmentDetail } from '#/shared/api/gen/types.gen'
import { Anchor } from '#/shared/components/anchor'
import { Button } from '#/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

import { assessmentXlsxHref } from '../model/exports'

type ExcelMenuProps = {
  courseId: string
  activityId: string
  assessment: Pick<AssessmentDetail, 'id' | 'allowed_actions' | 'lifecycle' | 'items'>
}

/**
 * The builder's «Excel» menu: load questions from a DOT file (replace or append, an editable draft only, as the
 * server requires) and download the test in that format (a browser download; the server says when nothing fits).
 */
export function ExcelMenu({ courseId, activityId, assessment }: ExcelMenuProps) {
  const loadable = assessment.allowed_actions.includes('edit') && assessment.lifecycle === 'draft'
  const exportable = assessment.items.length > 0
  if (!loadable && !exportable) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <FileSpreadsheet aria-hidden data-icon="inline-start" />
        {m.assessment_import_menu()}
        <ChevronDown aria-hidden data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {loadable ? (
          <DropdownMenuItem
            render={
              <RouterLink to="/teach/courses/$courseId/import" params={{ courseId }} search={{ test: activityId }} />
            }
          >
            {m.assessment_import_menu_import()}
          </DropdownMenuItem>
        ) : null}
        {exportable ? (
          <DropdownMenuItem render={<Anchor href={assessmentXlsxHref(assessment.id)} download />}>
            {m.assessment_import_menu_export()}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
