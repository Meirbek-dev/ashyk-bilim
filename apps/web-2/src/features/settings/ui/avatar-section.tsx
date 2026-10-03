import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { UserProfile } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { FileButton } from '#/shared/components/file-button'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { AVATAR_MAX_MB, avatarProblem, contentUrl } from '../model/settings'
import { avatarOptions } from '../queries'
import { PlainSection } from './plain-section'

/** The photo is checked, uploaded and set as soon as it is picked; removing it asks first. */
export function AvatarSection({ profile }: { profile: UserProfile }) {
  const queryClient = useQueryClient()
  const replace = useMutation(avatarOptions(queryClient))
  const remove = useMutation(avatarOptions(queryClient))
  const [problem, setProblem] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const pick = (file: File) => {
    const refused = avatarProblem(file)
    setProblem(refused)
    if (!refused) replace.mutate(file, { onSuccess: () => toast.add({ title: m.settings_avatar_saved() }) })
  }
  const confirmRemove = () =>
    remove.mutate(null, {
      onSuccess: () => {
        setConfirming(false)
        toast.add({ title: m.settings_avatar_removed() })
      },
    })
  return (
    <PlainSection title={m.settings_avatar_title()} description={m.settings_avatar_hint({ mb: AVATAR_MAX_MB })}>
      {profile.avatar_key ? (
        <img src={contentUrl(profile.avatar_key)} alt="" className="size-20 rounded-full bg-muted object-cover" />
      ) : (
        <p className="text-sm text-muted-foreground">{m.settings_avatar_none()}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <FileButton label={m.settings_avatar_choose()} accept="image/*" onFile={pick} pending={replace.isPending} />
        {profile.avatar_key ? (
          <ConfirmDialog
            open={confirming}
            onOpenChange={next => {
              setConfirming(next)
              if (!next) remove.reset()
            }}
            trigger={<Button variant="ghost">{m.settings_avatar_remove()}</Button>}
            title={m.settings_avatar_remove_title()}
            consequence={m.settings_avatar_remove_consequence()}
            confirmLabel={m.settings_avatar_remove()}
            onConfirm={confirmRemove}
            pending={remove.isPending}
            error={remove.error}
          />
        ) : null}
      </div>
      {problem ? <ErrorAlert>{problem}</ErrorAlert> : null}
      {replace.error ? <ErrorAlert>{presentError(replace.error)}</ErrorAlert> : null}
    </PlainSection>
  )
}
