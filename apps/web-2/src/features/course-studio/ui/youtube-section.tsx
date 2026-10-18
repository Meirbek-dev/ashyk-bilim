import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Suspense } from 'react'

import { AuthorViewContext, BlockViewer } from '#/features/editor'

import { m } from '#/paraglide/messages'
import type { ActivityDetail } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { Skeleton } from '#/shared/ui/skeleton'
import { toast } from '#/shared/ui/toast'

import { updateActivityOptions } from '../curriculum-queries'
import { mediaSource, youtubeContent, youtubeSchema } from '../model/studio'

/**
 * A YouTube video's link: youtube.com or youtu.be only, saved with `If-Match: version`; the saved video plays under it
 * as learners get it (B-CST-29).
 */
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
        { onSuccess: () => toast.add({ title: m.studio_saved() }) },
      ),
  })
  return (
    <div className="flex max-w-prose flex-col gap-4">
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
      {source.kind === 'youtube' && source.uri ? (
        <Suspense fallback={<Skeleton className="aspect-video w-full rounded-xl" />}>
          <AuthorViewContext value>
            <BlockViewer
              content={{
                type: 'doc',
                content: [
                  { type: 'embedBlock', attrs: { type: 'youtube', url: source.uri, width: '100%', height: 360 } },
                ],
              }}
            />
          </AuthorViewContext>
        </Suspense>
      ) : null}
    </div>
  )
}
