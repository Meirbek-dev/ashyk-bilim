import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'
import { ListPage } from '#/shared/components/templates/list-page'

import { coursesFilter } from '../model/catalog'
import { CoursesList } from './courses-list'
import { SearchBox } from './search-box'
import { SortMenu } from './sort-menu'

/** The catalog: every course the caller may see, searchable and sortable in the URL. */
export function CoursesPage() {
  const search = useSearch({ from: '/_public/courses/' })
  const navigate = useNavigate({ from: '/courses/' })
  const { data: session } = useSuspenseQuery(sessionOptions())
  const filter = coursesFilter(search, session !== null)
  return (
    <ListPage
      title={m.catalog_courses_title()}
      // The order is the only control: beside the search box at every width, not one menu inside a «Фильтры» sheet.
      search={
        <>
          <SearchBox
            key={search.q ?? ''}
            q={search.q}
            label={m.catalog_courses_search_label()}
            onSearch={q => navigate({ search: prev => ({ ...prev, q }) })}
          />
          <SortMenu sort={filter.sort} signedIn={session !== null} />
        </>
      }
    >
      <CoursesList filter={filter} />
    </ListPage>
  )
}
