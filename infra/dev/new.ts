#!/usr/bin/env bun
// `just new <what> <name>`: the ceremony of a new slice in one step, so an agent writes logic instead of copying it from
// a reference feature file by file.
//   feature <name>        web-2 src/features/<name>/ (SPEC.md, index.ts, ui/<name>-page.tsx on a template), its three
//                         catalogs messages/{ru,kk,en}/<key>.json and the project.inlang/settings.json entry
//   endpoint <tag> <op>   server: crates/api/tests/<tag>_<op>_flow.rs (behaviors doc comment, an #[ab_testdb::test]
//                         over TestApp) and the checklist of every place the slice touches, with the current anchors
//   migration <name>      `just server migration <name>`
// It never overwrites: an existing target stops it. Next steps are printed; gates stay red until they are done.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '../..')
const [what = '', ...args] = process.argv.slice(2)

function die(message: string): never {
  console.error(`new: ${message}`)
  process.exit(1)
}

function create(path: string, text: string): void {
  const full = join(root, path)
  if (existsSync(full)) die(`${path} exists`)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, text)
  console.log(`created ${path}`)
}

const pascal = (name: string) => name.replace(/(^|[-_])([a-z0-9])/g, (_, __, c: string) => c.toUpperCase())

/** B-<PREFIX>: three letters of the name not used by another SPEC.md. */
function behaviorPrefix(name: string): string {
  const used = new Set<string>()
  const features = join(root, 'apps/web-2/src/features')
  for (const dir of readdirSync(features)) {
    const spec = join(features, dir, 'SPEC.md')
    if (existsSync(spec)) for (const m of readFileSync(spec, 'utf8').matchAll(/B-([A-Z]+)-\d+/g)) used.add(m[1]!)
  }
  const letters = name.replace(/[^a-z]/g, '').toUpperCase()
  for (let i = 2; i < letters.length; i++) {
    const prefix = `${letters.slice(0, 2)}${letters[i]}`
    if (!used.has(prefix)) return prefix
  }
  die(`no free B- prefix from "${name}": pick one by hand`)
}

function feature(name: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) die('feature name: lowercase kebab-case (e.g. "peer-review")')
  const dir = `apps/web-2/src/features/${name}`
  const key = name.replaceAll('-', '_')
  const prefix = behaviorPrefix(name)
  const page = `${pascal(name)}Page`
  create(
    `${dir}/SPEC.md`,
    `# ${name}

Операции:

## Поведение

<!-- Behaviors as "- B-${prefix}-01 <what the user sees>", each in a test title (gate trace). Next id:
     \`bun gates/gates.ts next-id ${name}\`. List the generated SDK operations the feature calls on the line above. -->

## Изменено

## Не переносится
`,
  )
  create(`${dir}/index.ts`, `export { ${page} } from './ui/${name}-page'\n`)
  create(
    `${dir}/ui/${name}-page.tsx`,
    `import { m } from '#/paraglide/messages'
import { ListPage } from '#/shared/components/templates/list-page'

/** The ${name} screen: say in one line what it is for. */
export function ${page}() {
  return <ListPage title={m.${key}_title()}>{null}</ListPage>
}
`,
  )
  const titles: Record<string, string> = { ru: 'Новый раздел', kk: 'Жаңа бөлім', en: 'New section' }
  for (const [locale, title] of Object.entries(titles))
    create(`apps/web-2/messages/${locale}/${key}.json`, `${JSON.stringify({ [`${key}_title`]: title }, null, 2)}\n`)
  const settingsPath = join(root, 'apps/web-2/project.inlang/settings.json')
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
  const patterns: string[] = settings['plugin.inlang.messageFormat'].pathPattern
  patterns.push(`./messages/{locale}/${key}.json`)
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
  console.log('updated apps/web-2/project.inlang/settings.json')
  spawnSync('bun', ['run', 'codegen', 'messages'], { cwd: join(root, 'apps/web-2'), stdio: 'inherit' })
  console.log(`
next (apps/web-2/AGENTS.md "Slice cycle"):
  1. ${dir}/SPEC.md: the "Операции:" line and B-${prefix}-01.. behaviors (<= 150 lines); drop the comment
  2. queries.ts (generated xOptions/xMutation), model/ (pure, unit-tested), ui/ on the right template
  3. bind ${page} in src/routes/ (beforeLoad guard, loader with staleTime: 'static'); route-level code in route.ts
  4. each B- id in a test title; texts in messages/{ru,kk,en}/${key}.json; then \`just check --wip\``)
}

function endpoint(tag: string, op: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(tag) || !/^[a-z][a-z0-9_]*$/.test(op))
    die('usage: just new endpoint <tag> <operation>, snake_case (e.g. `just new endpoint collections reorder`)')
  const api = 'apps/server/crates/api'
  const test = `${api}/tests/${tag}_${op}_flow.rs`
  create(
    test,
    `//! ${tag}: ${op}. Behaviors, one per test (AGENTS.md "Slice loop" step 1):
//! - TODO: who may call it, what it changes, what it refuses (status + ErrorCode).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use ab_testkit::TestApp;
use axum::http::StatusCode;
use sqlx::PgPool;

#[ab_testdb::test]
async fn ${op}_refuses_an_anonymous_caller(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    // TODO: the route of ${op}; an anonymous call is refused before the body is read.
    let response = app.get("/api/v2/TODO").await;
    assert_eq!(response.status, StatusCode::UNAUTHORIZED);
}
`,
  )
  const anchor = (path: string, pattern: RegExp) => {
    const full = join(root, path)
    if (!existsSync(full)) return `${path} (new file)`
    const line = readFileSync(full, 'utf8')
      .split('\n')
      .findIndex(l => pattern.test(l))
    return line >= 0 ? `${path}:${line + 1}` : path
  }
  console.log(`
next (apps/server/AGENTS.md "Slice loop"), in this order:
  1. ${test}: behaviors in the doc comment, a test per behavior (TestApp helpers: crates/testkit/src/lib.rs)
  2. migration if the schema changes: \`just new migration ${tag}_${op}\`; typed queries in crates/db/src/; \`just server prepare\`
  3. domain method, Actor first, permission via actor.require: ${anchor('apps/server/crates/domain/src/lib.rs', /^pub mod/)}
  4. DTOs (deny_unknown_fields, garde, ToSchema): ${anchor(`${api}/src/dto/${tag}.rs`, /^use /)}
  5. handler with #[utoipa::path]: ${anchor(`${api}/src/routes/${tag}.rs`, /^pub async fn/)}
  6. register it in routes!(): ${anchor(`${api}/src/app.rs`, new RegExp(`routes::${tag}::`))}
  7. classify the route: ${anchor(`${api}/tests/permission_matrix.rs`, /^const MATRIX/)} (fails until listed)
  8. new failure -> ErrorCode + registry snapshot; \`just contract\`, read the diff; \`just check\``)
}

if (what === 'feature' && args[0]) feature(args[0])
else if (what === 'endpoint' && args[0] && args[1]) endpoint(args[0], args[1])
else if (what === 'migration' && args[0])
  process.exit(spawnSync('just', ['server', 'migration', args[0]], { cwd: root, stdio: 'inherit' }).status ?? 1)
else die('usage: just new feature <name> | endpoint <tag> <operation> | migration <name>')
