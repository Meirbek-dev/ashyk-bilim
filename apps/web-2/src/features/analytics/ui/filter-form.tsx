import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { FilterOption } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { Button } from '#/shared/ui/button'

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
  onApplied: () => void
}

/** "Apply" writes the filters to the URL; the tab's page, sort and drill-down start over. */
export function FilterForm({ filters, courses, cohorts, onApplied }: FilterFormProps) {
  const navigate = useNavigate()
  const form = useAppForm(filterFormSchema, {
    defaultValues: toFilterForm(filters),
    onSubmit: async value => {
      onApplied()
      await navigate({ to: '.', search: fromFilterForm(value) })
    },
  })
  return (
    <search>
      <form
        aria-label={m.ui_filters()}
        className="flex flex-col gap-4 @2xl:flex-row @2xl:flex-wrap @2xl:items-end"
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
        <Button type="submit" variant="outline">
          {m.analytics_filter_apply()}
        </Button>
      </form>
    </search>
  )
}
