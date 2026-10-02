import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_public/collections/$collectionId')({
  staticData: { title: m.platform_page_collection },
  component: UnderConstruction,
})
