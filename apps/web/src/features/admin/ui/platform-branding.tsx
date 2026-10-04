import { useMutation, useQueryClient } from '@tanstack/react-query'

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
import { type BaseVersion, useIfMatch } from './use-if-match'

const defaultValues: UpdatePlatformRequest = {}

/** Public storage keys are served anonymously at /content/<key>. */
const contentUrl = (key: string) => `/content/${key}`

/**
 * Logo and cover: a picked image uploads at once (`platform-logo` / `platform-thumbnail`), "Save" claims it. An empty
 * field leaves the current image as it is. Saved with `If-Match`; a 412 opens the conflict dialog.
 */
export function PlatformBranding({ platform, base }: { platform: Platform; base: BaseVersion }) {
  const queryClient = useQueryClient()
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
    onSubmit: body => write.save({ body, reset: () => form.reset() }),
  })
  const images = [
    { key: platform.logo_key, label: m.admin_platform_logo() },
    { key: platform.thumbnail_key, label: m.admin_platform_thumbnail() },
  ]
  return (
    <>
      <SettingsSection
        title={m.admin_platform_branding()}
        description={m.admin_platform_branding_hint()}
        onSubmit={() => form.handleSubmit()}
        pending={update.isPending}
        error={isStale(update.error) ? null : update.error}
      >
        <div className="flex flex-wrap gap-4">
          {images.map(image => (
            <figure key={image.label} className="flex flex-col gap-1">
              {image.key ? (
                <img
                  src={contentUrl(image.key)}
                  alt={image.label}
                  className="h-20 w-auto rounded-md bg-muted object-contain"
                />
              ) : (
                <p className="text-sm text-muted-foreground">{m.admin_platform_no_image()}</p>
              )}
              <figcaption className="text-sm text-muted-foreground">{image.label}</figcaption>
            </figure>
          ))}
        </div>
        <form.AppField name="logo_upload_id">
          {() => <FileField label={m.admin_platform_logo()} purpose="platform-logo" />}
        </form.AppField>
        <form.AppField name="thumbnail_upload_id">
          {() => <FileField label={m.admin_platform_thumbnail()} purpose="platform-thumbnail" />}
        </form.AppField>
      </SettingsSection>
      <ConflictDialog {...write.dialog} />
    </>
  )
}
