import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import { presentError } from '#/shared/i18n/errors'
import { Alert } from '#/shared/ui/alert'
import { Button } from '#/shared/ui/button'
import { FileButton } from '#/shared/ui/file-button'
import { ConfirmDialog } from '#/shared/ui/templates/confirm-dialog'

import { AVATAR_MAX_MB, avatarProblem, contentUrl } from '../model/settings'
import { avatarOptions, type VersionedProfile } from '../queries'
import { PlainSection } from './plain-section'

/** The photo is checked, uploaded and set as soon as it is picked; removing it asks first. */
export function AvatarSection({ profile }: { profile: VersionedProfile }) {
  const queryClient = useQueryClient()
  const replace = useMutation(avatarOptions(queryClient))
  const remove = useMutation(avatarOptions(queryClient))
  const [problem, setProblem] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const pick = (file: File) => {
    const refused = avatarProblem(file)
    setProblem(refused)
    if (!refused) replace.mutate(file, { onSuccess: () => toast(m.settings_avatar_saved()) })
  }
  const confirmRemove = () =>
    remove.mutate(null, {
      onSuccess: () => {
        setConfirming(false)
        toast(m.settings_avatar_removed())
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
      {problem ? <Alert>{problem}</Alert> : null}
      {replace.error ? <Alert>{presentError(replace.error)}</Alert> : null}
    </PlainSection>
  )
}
