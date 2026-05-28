import type { AssessmentItem } from '@/features/assessments/domain/items'
import type { CodeChallengeProblem, CodeChallengeSettings } from './codeChallenge.types'

export function codeItemToProblem(params: {
  activityUuid: string
  title?: string | null
  description?: string | null
  item: AssessmentItem
  settings: CodeChallengeSettings
}): CodeChallengeProblem {
  const body = params.item.body.kind === 'CODE' ? params.item.body : null
  const problem = {
    activityUuid: params.activityUuid,
    itemUuid: params.item.item_uuid,
    title: params.title || params.item.title || 'Code challenge',
    prompt: body?.prompt || params.description || '',
    inputSpec: body?.input_spec ?? '',
    outputSpec: body?.output_spec ?? '',
    constraints: body?.constraints ?? [],
    points: params.settings.points ?? params.item.max_score,
    ...(params.settings.difficulty ? { difficulty: params.settings.difficulty } : {}),
    ...(params.settings.time_limit !== undefined
      ? { timeLimitSeconds: params.settings.time_limit }
      : {}),
    ...(params.settings.memory_limit !== undefined
      ? { memoryLimitMb: params.settings.memory_limit }
      : {}),
  }

  return problem
}

export function normalizeStarterCode(
  settings: CodeChallengeSettings | null | undefined,
  languageId: number,
): string {
  if (!settings || languageId <= 0) return ''
  return settings.starter_code?.[String(languageId)] ?? ''
}
