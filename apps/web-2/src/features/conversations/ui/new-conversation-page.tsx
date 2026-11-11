import { Link as RouterLink, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { RecipientPicker } from './recipient-picker'
import { ToPerson } from './to-person'

const back = (
  <RouterLink to="/conversations" className={buttonVariants({ variant: 'ghost' })}>
    <ArrowLeft aria-hidden />
    {m.conversations_back()}
  </RouterLink>
)

/**
 * /conversations/new (docs/DIALOGS.md 9): with `to`, the composer for that person (an existing conversation was
 * already redirected to by the route); without it, the people the viewer may write to. The first message sent opens
 * the conversation.
 */
export function NewConversationPage() {
  const { to, course, activity, intervention } = useSearch({ from: '/_authed/conversations/new' })
  return (
    <DetailPage back={back} title={m.conversations_new_title()}>
      {to ? <ToPerson to={to} context={{ course, activity, intervention }} /> : <RecipientPicker />}
    </DetailPage>
  )
}
