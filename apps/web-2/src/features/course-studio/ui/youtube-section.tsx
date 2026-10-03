import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { ActivityDetail } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { SettingsSection } from '#/shared/ui/templates/settings-section'

import { updateActivityOptions } from '../curriculum-queries'
import { mediaSource, youtubeContent, youtubeSchema } from '../model/studio'

/** A YouTube video's link: youtube.com or youtu.be only, saved with `If-Match: version`. */
export function YoutubeSection({ courseId, activity }: { courseId: string; activity: ActivityDetail }) {
  const update = useMutation(updateActivityOptions(useQueryClient(), courseId))
  const source = mediaSource(activity)
  const form = useAppForm(youtubeSchema, {
    defaultValues: { uri: source.kind === 'youtube' ? source.uri : '' },
    onSubmit: ({ uri }) =>
      update.mutateAsync(
        {
          path: { activity_id: activity.id },
          body: { content: youtubeContent(uri) },
          headers: { 'If-Match': activity.version },
        },
        { onSuccess: () => toast(m.studio_saved()) },
      ),
  })
  return (
    <SettingsSection
      title={m.studio_media_title()}
      description={m.studio_media_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={update.isPending}
      error={update.error}
    >
      <form.AppField name="uri">
        {field => (
          <field.TextField
            label={m.studio_youtube_field()}
            description={m.studio_youtube_hint()}
            type="url"
            inputMode="url"
            required
          />
        )}
      </form.AppField>
    </SettingsSection>
  )
}
