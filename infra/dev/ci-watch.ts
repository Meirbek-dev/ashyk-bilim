// `just ci-watch <run>`: one persistent process, output only when a job/step changes.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { root } from './lib.ts'

type Job = {
  name: string
  status: string
  conclusion: string
  steps?: { name: string; status: string; startedAt?: string }[]
}
export type Run = { status: string; conclusion: string; jobs: Job[]; url: string }

export function jobStates(run: Run): Map<string, string> {
  return new Map(
    run.jobs.map(job => [
      job.name,
      job.conclusion || job.steps?.find(step => step.status === 'in_progress')?.name || job.status,
    ]),
  )
}

export function transitions(previous: Map<string, string>, run: Run): string[] {
  return [...jobStates(run)]
    .filter(([name, state]) => previous.get(name) !== state)
    .map(([name, state]) => `${name}: ${state}`)
}

async function watch(id: string): Promise<number> {
  if (!/^\d+$/.test(id)) throw new Error('usage: just ci-watch <numeric run id>')
  const dir = join(root, 'tmp/ci', id)
  mkdirSync(dir, { recursive: true })
  let previous = new Map<string, string>()
  const stalled = new Set<string>()
  let errors = 0
  while (true) {
    const child = Bun.spawn(['gh', 'run', 'view', id, '--json', 'status,conclusion,jobs,url'], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
      windowsHide: true,
    })
    const [code, json, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    if (code !== 0) {
      console.error(`CI status unavailable: ${stderr.slice(0, 500)}`)
      if (++errors >= 3) return 1
    } else {
      errors = 0
      writeFileSync(join(dir, 'status.json'), json)
      const run = JSON.parse(json) as Run
      for (const line of transitions(previous, run)) console.log(line)
      previous = jobStates(run)
      for (const job of run.jobs) {
        const step = job.steps?.find(step => step.status === 'in_progress')
        const key = `${job.name}:${step?.name}:${step?.startedAt}`
        if (step?.startedAt && Date.now() - Date.parse(step.startedAt) > 5 * 60_000 && !stalled.has(key)) {
          console.log(`${job.name}: ${step.name} has run over 5 minutes; inspect before retrying`)
          stalled.add(key)
        }
      }
      if (run.status === 'completed') {
        console.log(`${run.conclusion}: ${run.url}`)
        if (run.conclusion === 'success') return 0
        const path = join(dir, 'failed.log')
        const logs = Bun.spawn(['gh', 'run', 'view', id, '--log-failed'], {
          cwd: root,
          stdout: Bun.file(path),
          stderr: Bun.file(join(dir, 'logs-error.log')),
          windowsHide: true,
        })
        await logs.exited
        console.log(`Saved failed logs: ${path}\nInspect: just diagnose "${path}"\nRetry: just ci-retry ${id}`)
        return 1
      }
    }
    await Bun.sleep(30_000)
  }
}

if (import.meta.main) {
  try {
    process.exit(await watch(process.argv[2] ?? ''))
  } catch (error) {
    console.error(String(error).slice(0, 1000))
    process.exit(1)
  }
}
