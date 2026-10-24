// The app is pinned to TypeScript 7 (native port: `vp check` uses it, and its package root exports no
// compiler JS API). OpenAPI codegen needs the classic API; Paraglide uses it to emit declarations
// in memory instead of writing thousands of temporary files and spawning the TypeScript 7 CLI.
// Used as `node --import ./gates/ts6-register.mjs <openapi-ts bin>` (gates/codegen.ts).
import { registerHooks } from 'node:module'
import { resolve } from './ts6-hooks.mjs'

registerHooks({ resolve })
