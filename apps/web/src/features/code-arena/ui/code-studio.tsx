import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'

import { findCodeItem } from '../model/arena'
import { challengeOptions } from '../queries'
import { CodeItemForm } from './code-item-form'

/**
 * The `edit` tab of a code challenge (B-COD-13): its one code item. The server creates it with the challenge; one
 * that has none (old data) says so.
 */
export function CodeStudio({ activityId }: { activityId: string }) {
  const { data: challenge } = useSuspenseQuery(challengeOptions(activityId))
  const code = findCodeItem(challenge)
  if (!challenge || !code) return <p className="text-muted-foreground">{m.code_not_configured_title()}</p>
  return <CodeItemForm key={code.item.id} activityId={activityId} challenge={challenge} code={code} />
}
