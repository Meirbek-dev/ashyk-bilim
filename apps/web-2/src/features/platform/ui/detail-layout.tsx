import { Outlet, useMatch } from '@tanstack/react-router'

import { DetailPage } from '#/shared/ui/templates/detail-page'

import { TabLinks } from './tab-links'

/** A layout route of an object with tabs (course page, course workspace, analytics): title and tabs from staticData. */
export function DetailLayout() {
  const { staticData } = useMatch({ strict: false })
  return (
    <DetailPage title={staticData.title?.() ?? ''} tabs={<TabLinks tabs={staticData.tabs ?? []} />}>
      <Outlet />
    </DetailPage>
  )
}
