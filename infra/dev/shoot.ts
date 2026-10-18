#!/usr/bin/env bun
// `just shoot`: screenshots of web-2 pages on a running dev slot, as real accounts, for design review.
//
//   just shoot [--slot N] [--pages file.json] [--page name=/path ...] [--as <login>] [--filter <regex>]
//              [--widths 1440,390] [--modes light,dark] [--label after] [--ref <git-ref>]
//
// Pages: `--pages` is a JSON list of { "name", "path", "as"? } (`as`: a username or email, signed in through the
// dev-only /auth/dev-login; none: `--as`, else a guest). `--page name=/path` adds one more.
// Each shot: load, `html[data-mode]`, wait until no `[data-slot=skeleton]` remains (never `networkidle`: the
// /me/events stream keeps the network busy), then the page in slices of two viewport heights, so a tall page stays
// legible when an image is shrunk for reading: tmp/shots/<label>/<name>-<width>-<mode>[-<n>].png.
// One line per shot; flags: HSCROLL (wider than the viewport), ERR (page errors), SKELETON (still loading at 30 s).
// `--ref HEAD` shoots the web-2 of that commit instead (the "before"): a detached worktree under tmp/shoot/ (kept
// while the ref stays the same; own bun install + codegen) served by `vp dev` on a free port against this slot's API.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { devLogin, freePort, httpUp, killTree, readManifest, root, slotPorts, waitFor } from './lib.ts'

type Page = { name: string; path: string; as?: string }

function die(message: string): never {
  process.stderr.write(`shoot: ${message}\n`)
  process.exit(1)
}

function parse(argv: string[]) {
  const o = {
    slot: 1,
    pages: [] as Page[],
    as: '',
    filter: /./,
    widths: [1440, 390],
    modes: ['light', 'dark'],
    label: '',
    ref: '',
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? ''
    const value = () => argv[++i] ?? die(`${arg} needs a value`)
    if (arg === '--slot') o.slot = Number(value())
    else if (arg === '--pages') o.pages.push(...(JSON.parse(readFileSync(value(), 'utf8')) as Page[]))
    else if (arg === '--page') {
      // Split at the first `=` only: a path's query has its own (`?run=...`).
      const spec = value()
      const name = spec.slice(0, spec.indexOf('='))
      const raw = spec.slice(spec.indexOf('=') + 1)
      if (!spec.includes('=') || !name || !raw) die('--page takes name=/path')
      // Git Bash rewrites `x=/admin` into `x=C:/Program Files/Git/admin` on the way to a Windows program.
      const path = raw.replace(/^[A-Za-z]:[\\/].*?[\\/]Git(?=[\\/])/, '').replaceAll('\\', '/')
      o.pages.push({ name, path: path.startsWith('/') ? path : `/${path}` })
    } else if (arg === '--as') o.as = value()
    else if (arg === '--filter') o.filter = new RegExp(value())
    else if (arg === '--widths') o.widths = value().split(',').map(Number)
    else if (arg === '--modes') o.modes = value().split(',')
    else if (arg === '--label') o.label = value()
    else if (arg === '--ref') o.ref = value()
    else die(`unknown argument ${arg} (see the header of infra/dev/shoot.ts)`)
  }
  if (o.pages.length === 0) die('no pages: --pages file.json or --page name=/path')
  o.label ||= o.ref ? `ref-${o.ref.replace(/[^\w.-]/g, '_')}` : 'shots'
  return o
}

const git = (...args: string[]) => {
  const result = Bun.spawnSync(['git', ...args], { cwd: root })
  if (!result.success) die(`git ${args.join(' ')}: ${result.stderr.toString()}`)
  return result.stdout.toString().trim()
}

/** The web-2 of `ref` on a free port (worktree reused while the ref resolves to the same commit). */
async function serveRef(ref: string, slot: number): Promise<{ base: string; stop: () => void }> {
  const sha = git('rev-parse', '--verify', `${ref}^{commit}`).slice(0, 12)
  const dir = join(root, 'tmp/shoot')
  const tree = join(dir, sha)
  mkdirSync(dir, { recursive: true })
  // One "before" tree at a time: each holds its own node_modules.
  for (const old of readdirSync(dir).filter(name => name !== sha)) {
    Bun.spawnSync(['git', 'worktree', 'remove', '--force', join(dir, old)], { cwd: root })
    rmSync(join(dir, old), { recursive: true, force: true })
  }
  Bun.spawnSync(['git', 'worktree', 'prune'], { cwd: root })
  const app = join(tree, 'apps/web-2')
  if (!existsSync(join(app, 'node_modules'))) {
    if (!existsSync(tree)) git('worktree', 'add', '--detach', tree, sha)
    process.stdout.write(`shoot: ${ref} = ${sha}: bun install + codegen in ${tree}\n`)
    for (const cmd of [
      ['bun', 'install', '--frozen-lockfile'],
      ['bun', 'run', 'codegen'],
    ]) {
      const result = Bun.spawnSync(cmd, { cwd: app, stdout: 'ignore', stderr: 'pipe' })
      if (!result.success) die(`${cmd.join(' ')} in ${app}: ${result.stderr.toString().slice(-2000)}`)
    }
  }
  const port = await freePort()
  const api = `http://127.0.0.1:${slotPorts(slot).api}`
  const child = Bun.spawn([process.execPath, 'x', 'vp', 'dev', '--port', String(port), '--strictPort'], {
    cwd: app,
    env: { ...process.env, API_PROXY_TARGET: api, INTERNAL_API_URL: api, PUBLIC_ORIGIN: `http://localhost:${port}` },
    stdout: 'ignore',
    stderr: 'ignore',
  })
  const base = `http://localhost:${port}`
  await waitFor(`vp dev of ${ref}`, () => httpUp(`${base}/favicon.ico`), 180)
  return { base, stop: () => killTree(child.pid) }
}

async function main(): Promise<void> {
  const o = parse(process.argv.slice(2))
  if (!readManifest(String(o.slot))) die(`slot ${o.slot} is not running (just stack up ${o.slot})`)
  const pages = o.pages.map(page => ({ ...page, as: page.as ?? o.as })).filter(page => o.filter.test(page.name))
  const cookies = new Map<string, string>()
  for (const login of new Set(pages.map(page => page.as).filter(Boolean)))
    cookies.set(login, (await devLogin(login, o.slot)).cookie.replace(/^ab_session=/, ''))
  const server = o.ref ? await serveRef(o.ref, o.slot) : null
  const base = server?.base ?? `http://localhost:${slotPorts(o.slot).web2}`
  const out = join(root, 'tmp/shots', o.label)
  mkdirSync(out, { recursive: true })
  // Playwright from web-2's dependencies (the root workspace has none).
  const { chromium } = createRequire(join(root, 'apps/web-2/package.json'))('playwright') as typeof import('playwright')
  const browser = await chromium.launch()
  try {
    for (const page of pages)
      for (const mode of o.modes)
        for (const width of o.widths)
          await shot(browser, { page, mode, width, base, out, cookie: cookies.get(page.as) })
  } finally {
    await browser.close()
    server?.stop()
  }
  process.stdout.write(`shoot: ${out}\n`)
}

type ShotArgs = { page: Page; mode: string; width: number; base: string; out: string; cookie: string | undefined }

async function shot(browser: import('playwright').Browser, { page, mode, width, base, out, cookie }: ShotArgs) {
  const height = width > 800 ? 900 : 844
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: mode === 'dark' ? 'dark' : 'light',
    locale: 'ru-RU',
  })
  if (cookie) await context.addCookies([{ name: 'ab_session', value: cookie, domain: 'localhost', path: '/' }])
  const tab = await context.newPage()
  const flags: string[] = []
  tab.on('pageerror', error => flags.push(`ERR ${error.message.slice(0, 160)}`))
  try {
    await tab.goto(base + page.path, { waitUntil: 'load', timeout: 60_000 })
    await tab.evaluate(value => document.documentElement.setAttribute('data-mode', value), mode)
    await tab
      .waitForFunction(() => !document.querySelector('[data-slot=skeleton]'), null, { timeout: 30_000 })
      .catch(() => flags.push('SKELETON'))
    await tab.waitForTimeout(500)
    const size = await tab.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      full: document.documentElement.scrollHeight,
    }))
    if (size.scroll > width) flags.push(`HSCROLL ${size.scroll}px`)
    const stem = join(out, `${page.name}-${width}-${mode}`)
    const slice = height * 2
    const parts = Math.max(1, Math.ceil(size.full / slice))
    for (let n = 0; n < parts; n++) {
      const y = n * slice
      await tab.screenshot({
        path: parts === 1 ? `${stem}.png` : `${stem}-${n + 1}.png`,
        fullPage: true,
        clip: { x: 0, y, width, height: Math.min(slice, size.full - y) },
      })
    }
    process.stdout.write(`${page.name}-${width}-${mode}${parts > 1 ? ` (${parts} parts)` : ''} ${flags.join(' ')}\n`)
  } catch (error) {
    process.stdout.write(`${page.name}-${width}-${mode} FAILED ${error instanceof Error ? error.message : error}\n`)
  } finally {
    await context.close()
  }
}

await main()
