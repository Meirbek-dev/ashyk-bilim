import { useSuspenseQuery } from '@tanstack/react-query'
import { ListFilter } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'
import { Sheet } from '#/shared/ui/sheet'

import { activeFilters, type Filters } from '../model/filters'
import { overviewOptions } from '../queries'
import { FilterForm } from './filter-form'

/** The shared filters: inline when the region is wide, in a "Filters (n)" sheet at phone width (DESIGN 6). */
export function FilterBar({ filters }: { filters: Filters }) {
  const { data } = useSuspenseQuery(overviewOptions(filters))
  const [open, setOpen] = useState(false)
  const count = activeFilters(filters)
  const form = (
    // Keyed by the URL value: "back" to other filters refills the form.
    <FilterForm
      key={JSON.stringify(filters)}
      filters={filters}
      courses={data.course_options}
      cohorts={data.cohort_options}
      onApplied={() => setOpen(false)}
    />
  )
  return (
    <>
      <div className="hidden @2xl:block">{form}</div>
      <div className="@2xl:hidden">
        <Sheet
          side="right"
          title={m.ui_filters()}
          open={open}
          onOpenChange={setOpen}
          trigger={
            <Button variant="outline">
              <ListFilter aria-hidden />
              {count > 0 ? m.ui_filters_count({ count }) : m.ui_filters()}
            </Button>
          }
        >
          {form}
        </Sheet>
      </div>
    </>
  )
}
