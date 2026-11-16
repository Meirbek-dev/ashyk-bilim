import { createFileRoute } from '@tanstack/react-router'

// Pages anyone may open whose loader decides who reads them (the player: a course open without sign-in lets guests
// in, elsewhere a guest signs in first). Like `_authed`, loaders run on the server and components in the browser.
export const Route = createFileRoute('/_open')({ ssr: 'data-only' })
