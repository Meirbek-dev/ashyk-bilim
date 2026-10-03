import { useMutation } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { AdminUser } from '#/shared/api/gen/types.gen'
import { useIdempotencyKey } from '#/shared/api/idempotency'
import { ErrorAlert } from '#/shared/components/error-alert'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

import { awardFormSchema } from '../model/admin'
import { awardOptions } from '../queries'

/**
 * "Award XP" to the user of the panel (shown with `admin.gamification`). The contract carries the idempotency key in
 * the body (`idempotency_key`, not the header): one key per award until the server answers.
 */
export function AwardXp({ user }: { user: AdminUser }) {
  const award = useMutation(awardOptions())
  const idempotency = useIdempotencyKey()
  const form = useAppForm(awardFormSchema, {
    defaultValues: { amount: '', reason: '' },
    onSubmit: ({ amount, reason }) =>
      award.mutateAsync(
        {
          body: {
            user_id: user.id,
            amount: Number(amount),
            reason: reason.trim() || undefined,
            idempotency_key: idempotency.key,
          },
        },
        {
          onSuccess: result => {
            idempotency.settle()
            toast.add({ title: m.admin_award_done({ total: result.profile.total_xp }) })
            form.reset()
          },
          onError: error => idempotency.settle(error),
        },
      ),
  })
  return (
    <form
      noValidate
      aria-labelledby="user-award"
      className="flex flex-col gap-2"
      onSubmit={event => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <h3 id="user-award" className="font-medium">
        {m.admin_award_title()}
      </h3>
      <p className="text-sm text-muted-foreground">{m.admin_award_hint()}</p>
      <form.AppField name="amount">
        {field => <field.TextField label={m.admin_award_amount()} inputMode="numeric" required />}
      </form.AppField>
      <form.AppField name="reason">{field => <field.TextField label={m.admin_award_reason()} />}</form.AppField>
      {award.error ? <ErrorAlert>{presentError(award.error)}</ErrorAlert> : null}
      <div>
        <Button type="submit" variant="outline" disabled={award.isPending}>
          {award.isPending ? <Spinner data-icon="inline-start" /> : null}
          {m.admin_award_submit()}
        </Button>
      </div>
    </form>
  )
}
