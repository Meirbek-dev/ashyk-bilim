import { useMutation, useSuspenseQuery } from '@tanstack/react-query'

import { capabilitiesOptions, featureOn } from '#/features/ai'
import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import { searchCourseMutation } from '#/shared/api/gen/@tanstack/react-query.gen'
import type { CourseId, SearchRequest } from '#/shared/api/gen/types.gen'
import { vSearchRequest } from '#/shared/api/gen/valibot.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'

import { SearchHits } from './search-hits'

const defaultValues: SearchRequest = { query: '' }

/**
 * The search box of B-CON-12, only while the course page's AI capabilities (the panel's query) have
 * `semantic_search_enabled` on. Passages by meaning and by words, each with where it is and a link into the player.
 * Switched off between the capabilities read and a search, the server answers `ai-disabled`: one quiet line instead
 * of an error.
 */
export function CourseSearchBox({ courseId }: { courseId: CourseId }) {
  const { data: caps } = useSuspenseQuery(capabilitiesOptions({ courseId, surface: 'course-page' }))
  const search = useMutation(searchCourseMutation())
  const form = useAppForm(vSearchRequest, {
    defaultValues,
    onSubmit: body => search.mutateAsync({ path: { course_id: courseId }, body }),
  })
  const off = search.error instanceof ApiError && search.error.code === 'ai-disabled'
  if (!featureOn(caps, 'semantic_search_enabled')) return null
  return (
    <section aria-labelledby="course-search" className="flex flex-col gap-3">
      <h2 id="course-search" className="text-xl font-semibold">
        {m.concepts_search_title()}
      </h2>
      <form
        noValidate
        className="flex flex-wrap items-start gap-2"
        onSubmit={event => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <div className="min-w-0 flex-1">
          <form.AppField name="query">
            {field => <field.TextField type="search" label={m.concepts_search_label()} />}
          </form.AppField>
        </div>
        <SubmitButton type="submit" variant="outline" pending={search.isPending}>
          {m.concepts_search_submit()}
        </SubmitButton>
      </form>
      {off ? <p className="text-sm text-muted-foreground">{m.concepts_search_off()}</p> : null}
      {search.error && !off ? <ErrorAlert>{presentError(search.error)}</ErrorAlert> : null}
      {search.data ? <SearchHits courseId={courseId} hits={search.data} /> : null}
    </section>
  )
}
