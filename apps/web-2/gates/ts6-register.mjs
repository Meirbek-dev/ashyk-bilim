// The app is pinned to TypeScript 7 (native port: `vp check` uses it, and its package root exports no
// compiler JS API). @hey-api/openapi-ts calls the classic API (`ts.factory`, `ts.SyntaxKind`), so the
// codegen process gets the `typescript-6` alias instead. Same approach as apps/examples/tou-rent.
// Used as `node --import ./gates/ts6-register.mjs <openapi-ts bin>` (gates/codegen.ts).
import { register } from 'node:module'

register('./ts6-hooks.mjs', import.meta.url)
