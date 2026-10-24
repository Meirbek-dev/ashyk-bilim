import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { root } from './lib.ts'

/** Disposable, memory-backed Postgres: no shared dev data, WAL flushes or concurrent test-suite collisions. */
export async function checkDatabase() {
  const runtime = Bun.which('podman') ?? Bun.which('docker')
  if (!runtime) throw new Error('isolated checks need Podman or Docker')
  const image = readFileSync(join(root, 'compose.yaml'), 'utf8').match(/image: &pg-image (\S+)/)?.[1]
  if (!image) throw new Error('compose.yaml has no pinned Postgres image')
  const name = `ashyq-check-${crypto.randomUUID().slice(0, 8)}`
  const password = crypto.randomUUID()
  const envFile = join(root, 'tmp/check', `${name}.env`)
  mkdirSync(join(root, 'tmp/check'), { recursive: true })
  writeFileSync(
    envFile,
    `POSTGRES_USER=postgres\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=ashyq_test\nPOSTGRES_INITDB_ARGS=--no-sync\n`,
    { mode: 0o600 },
  )
  const run = async (args: string[]) => {
    const child = Bun.spawn([runtime, ...args], { stdout: 'pipe', stderr: 'pipe', windowsHide: true })
    const [code, out, err] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    if (code !== 0) throw new Error(err.slice(0, 500))
    return out.trim()
  }
  const stop = async () => {
    try {
      await run(['rm', '--force', name])
    } finally {
      rmSync(envFile, { force: true })
    }
  }
  try {
    // Ask Windows for an available port, avoiding its reserved ranges before publishing from the container VM.
    const listener = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response(null, { status: 404 }) })
    const port = listener.port
    await listener.stop(true)
    await run([
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '--env-file',
      envFile,
      '--publish',
      `127.0.0.1:${port}:5432`,
      '--tmpfs',
      '/var/lib/postgresql:rw,size=1g',
      image,
      'postgres',
      '-c',
      'fsync=off',
      '-c',
      'full_page_writes=off',
      '-c',
      'max_wal_size=128MB',
    ])
    for (let attempt = 0; ; attempt++) {
      try {
        await run(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'ashyq_test'])
        break
      } catch (error) {
        if (attempt === 30) throw error
        await Bun.sleep(500)
      }
    }
    console.log(`check: isolated Postgres ready (${name}, tmpfs; removed when checks finish)`)
    return { url: `postgres://postgres:${password}@127.0.0.1:${port}/ashyq_test`, stop }
  } catch (error) {
    await stop().catch(() => {})
    throw error
  }
}
