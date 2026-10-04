import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach } from 'vite-plus/test'
import { page } from 'vite-plus/test/browser'

import appCss from '#/styles/globals.css?url'

const mounted: Root[] = []
afterEach(() => {
  for (const root of mounted.splice(0)) root.unmount()
  document.body.replaceChildren()
})

let stylesheet: Promise<unknown> | null = null
const loadStylesheet = () => {
  stylesheet ??= new Promise((resolve, reject) => {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: appCss })
    link.addEventListener('load', resolve)
    link.addEventListener('error', reject)
    document.head.append(link)
  })
  return stylesheet
}

/** Browser tests: renders kit UI inside a real router (Link needs one) with the app stylesheet. */
export async function renderInRouter(ui: ReactNode) {
  await loadStylesheet()
  const router = createRouter({ routeTree: createRootRoute({ component: () => ui }), history: createMemoryHistory() })
  await router.load()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push(root)
  root.render(<RouterProvider router={router} />)
  return page.elementLocator(host)
}
