import { CatchBoundary } from '@tanstack/react-router'
import { UserRoundSearch } from 'lucide-react'
import { use, lazy, Suspense, useState } from 'react'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '#/shared/ui/popover'
import { Skeleton } from '#/shared/ui/skeleton'

import { textAttr } from '../../model/document'
import { UserCard } from './user-card'
import { NodeParts, type ViewProps } from './parts'

// Authoring only: the people search (and the admin slice behind it) stays out of the viewer's chunk.
const PeoplePicker = lazy(() => import('#/features/admin').then(module => ({ default: module.PeoplePicker })))

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
const missing = <p className="text-sm text-muted-foreground">{m.editor_user_missing()}</p>

/** blockUser: a person's public card (a teacher, a guest lecturer). Authoring picks the person by name (B-EDT-27). */
export function UserView({ node, editor, selected, updateAttributes }: ViewProps) {
  const { Wrapper } = use(NodeParts)
  const [picking, setPicking] = useState(false)
  const userId = textAttr(node.attrs['user_id'])?.trim() ?? ''
  const valid = UUID.test(userId)
  const authoring = editor.isEditable
  return (
    <Wrapper className="my-4 flex max-w-md flex-col gap-2">
      {valid ? (
        <CatchBoundary getResetKey={() => userId} errorComponent={() => missing}>
          <Suspense fallback={<Skeleton className="h-row w-full" />}>
            <UserCard userId={userId} />
          </Suspense>
        </CatchBoundary>
      ) : authoring && userId === '' ? null : (
        // A new block has nobody yet: its author sees «Выбрать человека», not «unavailable».
        missing
      )}
      {authoring && (selected || !valid || picking) ? (
        // The search sits in a popover, outside the editor's DOM: an open combobox marks its siblings aria-hidden,
        // and inside the page those attribute changes made the editor redraw the block, so a click in the search
        // field focused the page and the typed name went into the lesson text.
        <Popover open={picking} onOpenChange={setPicking}>
          <PopoverTrigger
            render={
              <Button variant="outline" className="self-start">
                <UserRoundSearch aria-hidden />
                {valid ? m.editor_user_change() : m.editor_user_pick()}
              </Button>
            }
          />
          <PopoverContent align="start" className="w-80 max-w-dvw">
            <Suspense fallback={<Skeleton className="h-row w-full" />}>
              <PeoplePicker
                label={m.editor_field_user()}
                value={[]}
                onValueChange={people => {
                  const person = people.at(-1)
                  if (!person) return
                  updateAttributes({ user_id: person.id })
                  setPicking(false)
                }}
              />
            </Suspense>
          </PopoverContent>
        </Popover>
      ) : null}
    </Wrapper>
  )
}
