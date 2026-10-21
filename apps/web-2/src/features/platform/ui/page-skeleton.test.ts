import { expect, test } from 'vite-plus/test'

import { skeletonShape } from './page-skeleton'

const m = (id: string, skeleton?: 'grid' | 'detail' | 'tiles', status = 'success') => ({
  id,
  status,
  staticData: { skeleton },
})

test('the loading shape comes from the route tree, not from load status: the server and the hydrating client agree', () => {
  const server = [
    m('__root__'),
    m('/_authed'),
    m('/_authed/teach/courses/$courseId', 'detail'),
    m('/_authed/x/gradebook'),
  ]
  const client = server.map((match, index) => (index > 1 ? { ...match, status: 'pending' } : match))
  expect(skeletonShape(server, '/_authed')).toBe('detail')
  expect(skeletonShape(client, '/_authed')).toBe(skeletonShape(server, '/_authed'))
  // A tab loading under its rendered workspace: rows (no shape at or under the tab), not a second workspace header.
  expect(skeletonShape(client, '/_authed/x/gradebook')).toBeUndefined()
  expect(skeletonShape([m('__root__'), m('/_authed'), m('/_authed/learning', 'grid')], undefined)).toBe('grid')
})
