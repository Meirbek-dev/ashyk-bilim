import { createFileRoute } from '@tanstack/react-router'

// Public pages render on the server: first paint, OG tags, links in messengers (spec 7.4).
export const Route = createFileRoute('/_public')({ ssr: true })
