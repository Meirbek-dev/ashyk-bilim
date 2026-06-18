import type { AssessmentWorkspaceView } from '../studioTypes'

const WORKSPACE_VIEWS = new Set<AssessmentWorkspaceView>(['SETUP', 'BUILDER', 'ACCESS', 'RESULTS', 'PUBLISH'])

export interface AssessmentWorkspaceUrlState {
  view: AssessmentWorkspaceView
  selectedItemUuid: string | null
  selectedIssueCode: string | null
}

export function readAssessmentWorkspaceUrlState(search: string): AssessmentWorkspaceUrlState {
  const params = new URLSearchParams(search)
  const rawView = (params.get('view') ?? params.get('tab') ?? '').toUpperCase()
  const view = WORKSPACE_VIEWS.has(rawView as AssessmentWorkspaceView)
    ? (rawView as AssessmentWorkspaceView)
    : 'BUILDER'

  return {
    view,
    selectedItemUuid: cleanParam(params.get('item')),
    selectedIssueCode: cleanParam(params.get('issue')),
  }
}

export function writeAssessmentWorkspaceUrlState(href: string, patch: Partial<AssessmentWorkspaceUrlState>): string {
  const url = new URL(href)
  const current = readAssessmentWorkspaceUrlState(url.search)
  const next = { ...current, ...patch }

  url.searchParams.set('view', next.view.toLowerCase())
  url.searchParams.delete('tab')
  setNullableParam(url.searchParams, 'item', next.selectedItemUuid)
  setNullableParam(url.searchParams, 'issue', next.selectedIssueCode)
  return url.toString()
}

function cleanParam(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed || null
}

function setNullableParam(params: URLSearchParams, key: string, value: string | null | undefined): void {
  if (value) {
    params.set(key, value)
    return
  }
  params.delete(key)
}
