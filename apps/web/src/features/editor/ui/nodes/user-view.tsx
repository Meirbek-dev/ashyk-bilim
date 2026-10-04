import { CatchBoundary } from '@tanstack/react-router'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { Suspense } from 'react'

import { m } from '#/paraglide/messages'
import { Skeleton } from '#/shared/ui/skeleton'

import { AttrForm } from './attr-form'
import { stringAttr } from './align'
import { UserCard } from './user-card'

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
const missing = <p className="text-sm text-muted-foreground">{m.editor_user_missing()}</p>

/** blockUser: a person's public card (a teacher, a guest lecturer). Authoring sets the user id. */
export function UserView({ node, editor, selected, updateAttributes }: ReactNodeViewProps) {
  const userId = String(node.attrs['user_id'] ?? '').trim()
  const valid = UUID.test(userId)
  return (
    <NodeViewWrapper className="my-4 flex max-w-md flex-col gap-2">
      {valid ? (
        <CatchBoundary getResetKey={() => userId} errorComponent={() => missing}>
          <Suspense fallback={<Skeleton className="h-row w-full" />}>
            <UserCard userId={userId} />
          </Suspense>
        </CatchBoundary>
      ) : (
        missing
      )}
      {editor.isEditable && (selected || !valid) ? (
        <AttrForm
          fields={[{ name: 'user_id', label: m.editor_field_user_id(), check: value => UUID.test(value) }]}
          values={{ user_id: stringAttr(node.attrs['user_id']) }}
          onApply={values => updateAttributes(values)}
        />
      ) : null}
    </NodeViewWrapper>
  )
}
