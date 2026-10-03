import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { Platform, UpdatePlatformRequest } from '#/shared/api/gen/types.gen'
import { vUpdatePlatformRequest } from '#/shared/api/gen/valibot.gen'
import { FileField } from '#/shared/ui/form/file-field'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { SettingsSection } from '#/shared/ui/templates/settings-section'

import { updatePlatformOptions } from '../queries'

const defaultValues: UpdatePlatformRequest = { logo_upload_id: null, thumbnail_upload_id: null }

/** Public storage keys are served anonymously at /content/<key>. */
const contentUrl = (key: string) => `/content/${key}`

/**
 * Logo and cover: a picked image uploads at once (`platform-logo` / `platform-thumbnail`), "Save" claims it. An empty
 * field leaves the current image as it is.
 */
export function PlatformBranding({ platform }: { platform: Platform }) {
  const update = useMutation(updatePlatformOptions(useQueryClient()))
  const form = useAppForm(vUpdatePlatformRequest, {
    defaultValues,
    onSubmit: body =>
      update.mutateAsync(
        { body },
        {
          onSuccess: () => {
            toast(m.admin_saved())
            form.reset()
          },
        },
      ),
  })
  const images = [
    { key: platform.logo_key, label: m.admin_platform_logo() },
    { key: platform.thumbnail_key, label: m.admin_platform_thumbnail() },
  ]
  return (
    <SettingsSection
      title={m.admin_platform_branding()}
      description={m.admin_platform_branding_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={update.isPending}
      error={update.error}
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
  )
}
