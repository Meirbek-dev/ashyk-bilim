import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Platform, UpdatePlatformRequest } from '#/shared/api/gen/types.gen'
import { vUpdatePlatformRequest } from '#/shared/api/gen/valibot.gen'
import { FileField } from '#/shared/components/form/file-field'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { toast } from '#/shared/ui/toast'

import { isStale } from '../model/admin'
import { platformVersion, updatePlatformOptions } from '../queries'
import { PlatformImagePreview } from './platform-image-preview'
import { PlatformThumbnailRemove } from './platform-thumbnail-remove'
import { type BaseVersion, useIfMatch } from './use-if-match'

const defaultValues: UpdatePlatformRequest = {}

/**
 * The link cover: a picked image uploads at once (`platform-thumbnail`) and becomes the platform's
 * right away, like a course cover (it was left unclaimed when the admin missed «Сохранить»). An empty field leaves
 * the current image as it is; «Убрать обложку» clears it after a confirmation. Saved with `If-Match`; a 412 opens the
 * conflict dialog.
 */
export function PlatformBranding({ platform, base }: { platform: Platform; base: BaseVersion }) {
  const queryClient = useQueryClient()
  const [removing, setRemoving] = useState(false)
  const update = useMutation(updatePlatformOptions(queryClient))
  const write = useIfMatch(
    base,
    // `reset` empties the fields once the images are claimed (a retry from the conflict dialog included).
    ({ body, reset }: { body: UpdatePlatformRequest; reset: () => void }, version: number) =>
      update.mutateAsync(
        { body, headers: { 'If-Match': version } },
        {
          onSuccess: () => {
            toast.add({ title: m.admin_saved() })
            reset()
          },
        },
      ),
    () => platformVersion(queryClient),
  )
  const form = useAppForm(vUpdatePlatformRequest, {
    defaultValues,
    leaveGuard: true,
    onSubmit: body => write.save({ body, reset: () => form.reset() }),
  })
  // The cover at its own shape, 16:9 like every course picture. The logo picker is gone (OPEN-C-1): the shell, sign-in
  // and certificates carry the fixed «Ashyq» artwork (DESIGN.md), so an uploaded logo was shown nowhere.
  const images = [
    {
      key: platform.thumbnail_key,
      label: m.admin_platform_thumbnail(),
      name: 'thumbnail_upload_id',
      purpose: 'platform-thumbnail',
      shape: 'aspect-video w-36',
    },
  ] as const
  return (
    <>
      <SettingsSection
        title={m.admin_platform_branding()}
        description={m.admin_platform_branding_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={update.isPending}
        error={isStale(update.error) ? null : update.error}
        saveButton={false}
      >
        {images.map(image => (
          <div key={image.name} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <PlatformImagePreview imageKey={image.key} label={image.label} shape={image.shape} />
            <div className="min-w-0 flex-1">
              <form.AppField name={image.name} listeners={{ onChange: () => void form.handleSubmit() }}>
                {() => <FileField label={image.label} purpose={image.purpose} />}
              </form.AppField>
            </div>
            {image.key ? (
              <PlatformThumbnailRemove
                open={removing}
                onOpenChange={next => {
                  setRemoving(next)
                  if (!next) update.reset()
                }}
                onConfirm={() =>
                  void write
                    .save({ body: { remove_thumbnail: true }, reset: () => setRemoving(false) })
                    .catch(() => undefined)
                }
                pending={update.isPending}
                error={isStale(update.error) ? null : update.error}
              />
            ) : null}
          </div>
        ))}
      </SettingsSection>
      <ConflictDialog {...write.dialog(() => form.handleSubmit())} />
    </>
  )
}
