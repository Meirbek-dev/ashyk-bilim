import { useTranslations } from 'next-intl'
import type { ValidationIssue } from '@/features/assessments/domain/view-models'
import type { classifyValidationIssue } from '@/features/assessments/domain/readiness'

export function useIssueMessage(issue: ValidationIssue): string {
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio.validation')
  return t(issue.code.replaceAll('.', '_'))
}

export function InlineIssueMessage({ issue }: { issue: ValidationIssue }) {
  return <>{useIssueMessage(issue)}</>
}

interface InlineIssueListProps {
  issues: ReturnType<typeof classifyValidationIssue>[]
}

export function InlineIssueList({ issues }: InlineIssueListProps) {
  if (issues.length === 0) return null

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <ul className="space-y-1">
        {issues.map(issue => (
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
  )
}
