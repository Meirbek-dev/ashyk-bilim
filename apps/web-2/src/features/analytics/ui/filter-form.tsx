import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

import { m } from '#/paraglide/messages'
import type { FilterOption } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'

import {
  BUCKETS,
  COMPARES,
  type Filters,
  filterFormSchema,
  fromFilterForm,
  toFilterForm,
  WINDOWS,
} from '../model/filters'
import { bucketLabels, compareLabels, windowLabels } from './labels'

type FilterFormProps = {
  filters: Filters
  /** The server's choices for the caller's scope. */
  courses: readonly FilterOption[]
  cohorts: readonly FilterOption[]
}

/**
 * Each pick writes the filters to the URL at once (an «Apply» button was one more step that teachers missed); the
 * tab's page, sort and drill-down start over. The form stays mounted, so focus stays on the select just changed;
 * "back" to other filters refills it from the URL.
 */
export function FilterForm({ filters, courses, cohorts }: FilterFormProps) {
  const navigate = useNavigate()
  const apply = (value: ReturnType<typeof toFilterForm>) => navigate({ to: '.', search: fromFilterForm(value) })
  const form = useAppForm(filterFormSchema, { defaultValues: toFilterForm(filters), onSubmit: apply, onChange: apply })
  const fromUrl = JSON.stringify(toFilterForm(filters))
  useEffect(() => {
    if (JSON.stringify(form.state.values) !== fromUrl) form.reset(JSON.parse(fromUrl))
  }, [form, fromUrl])
  return (
    <search>
      <form
        aria-label={m.ui_filters()}
        className="grid items-end gap-3 @2xl:grid-cols-3 @5xl:grid-cols-5 [&_[data-slot=field-label]]:text-xs [&_[data-slot=field-label]]:font-normal [&_[data-slot=field-label]]:text-muted-foreground"
        onSubmit={event => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.AppField name="window">
          {field => (
            <field.SelectField
              label={m.analytics_filter_window()}
              options={WINDOWS.map(value => ({ value, label: windowLabels[value]() }))}
            />
          )}
        </form.AppField>
        <form.AppField name="compare">
          {field => (
            <field.SelectField
              label={m.analytics_filter_compare()}
              options={COMPARES.map(value => ({ value, label: compareLabels[value]() }))}
            />
          )}
        </form.AppField>
        <form.AppField name="bucket">
          {field => (
            <field.SelectField
              label={m.analytics_filter_bucket()}
              options={BUCKETS.map(value => ({ value, label: bucketLabels[value]() }))}
            />
          )}
        </form.AppField>
        <form.AppField name="course">
          {field => (
            <field.SelectField
              label={m.analytics_filter_course()}
              options={[{ value: '', label: m.analytics_filter_all_courses() }, ...courses]}
            />
          )}
        </form.AppField>
        <form.AppField name="cohort">
          {field => (
            <field.SelectField
              label={m.analytics_filter_cohort()}
              options={[{ value: '', label: m.analytics_filter_all_cohorts() }, ...cohorts]}
            />
          )}
        </form.AppField>
      </form>
    </search>
  )
}
