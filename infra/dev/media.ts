#!/usr/bin/env bun
// `just restore-media [--slot N] [--sample 20] [--max-mb 50] [--activity <id>] [--from <origin>]`: copy public media a
// restored database points at but local storage lacks (backups leave big videos out) from production's anonymous
// `/content/<key>` into the dev bucket, so a review on real data shows real videos, PDFs and pictures.
//
// Read-only on production: plain GETs of public files. Order: lesson media (videos, PDFs), page blocks, course
// pictures, avatars; stops after --sample copies; a file over --max-mb is listed and skipped (`--activity <id>`
// takes that activity's files at any size). Writes only the slot's local bucket (AB__STORAGE__*).
import { S3Client, SQL } from 'bun'

import { databaseUrl, devEnv, readManifest } from './lib.ts'

const PROD = 'https://cs-mooc.tou.edu.kz'

function die(message: string): never {
  process.stderr.write(`restore-media: ${message}\n`)
  process.exit(1)
}

function parse(argv: string[]) {
  const o = { slot: '1', sample: 20, maxMb: 50, activity: '', from: PROD }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => argv[++i] ?? die(`${arg} needs a value`)
    if (arg === '--slot') o.slot = value()
    else if (arg === '--sample') o.sample = Number(value())
    else if (arg === '--max-mb') o.maxMb = Number(value())
    else if (arg === '--activity') o.activity = value()
    else if (arg === '--from') o.from = value().replace(/\/$/, '')
    else die(`unknown argument ${arg} (see the header of infra/dev/media.ts)`)
  }
  return o
}

/** Every public key the database refers to, most useful first (or one activity's). */
async function referencedKeys(sql: SQL, activity: string): Promise<string[]> {
  const rows: { key: string }[] = activity
    ? await sql`
        SELECT content ->> 'filename' AS key FROM activities WHERE id = ${activity}::uuid
        UNION ALL SELECT content ->> 'file_key' FROM blocks WHERE activity_id = ${activity}::uuid`
    : await sql`
        SELECT key FROM (
          SELECT content ->> 'filename' AS key, 1 AS rank FROM activities WHERE published
          UNION ALL SELECT content ->> 'file_key', 2 FROM blocks
          UNION ALL SELECT thumbnail_image_key, 3 FROM courses WHERE archived_at IS NULL
          UNION ALL SELECT avatar_key, 4 FROM users
        ) refs WHERE coalesce(key, '') <> '' AND key NOT LIKE 'http%' GROUP BY key ORDER BY min(rank), key`
  return rows.map(row => row.key).filter(Boolean)
}

const headers = async (url: string) => {
  const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20_000) })
  return {
    ok: response.ok,
    size: Number(response.headers.get('content-length') ?? 0),
    type: response.headers.get('content-type'),
  }
}

async function main(): Promise<void> {
  const o = parse(process.argv.slice(2))
  const env = devEnv()
  const db = readManifest(o.slot)?.db ?? die(`slot ${o.slot} is not running (just stack up ${o.slot})`)
  const endpoint = (env['AB__STORAGE__ENDPOINT'] ?? '').replace('//localhost:', '//127.0.0.1:')
  const bucket = env['AB__STORAGE__PUBLIC_BUCKET'] ?? 'ab-public'
  const s3 = new S3Client({
    endpoint,
    bucket,
    accessKeyId: env['AB__STORAGE__ACCESS_KEY'],
    secretAccessKey: env['AB__STORAGE__SECRET_KEY'],
  })
  const sql = new SQL(databaseUrl(env, db).replace('@localhost:', '@127.0.0.1:'), { max: 1 })
  const keys = await referencedKeys(sql, o.activity).finally(() => sql.close())
  let copied = 0
  let present = 0
  let skipped = 0
  for (const key of keys) {
    if (copied >= o.sample && !o.activity) break
    const path = key.split('/').map(encodeURIComponent).join('/')
    if ((await headers(`${endpoint}/${bucket}/${path}`).catch(() => ({ ok: false }))).ok) {
      present++
      continue
    }
    // One line per missing file, written as it goes: a big one takes a while (production serves ~1.5 MB/s).
    process.stdout.write(`${key}: `)
    const remote = await headers(`${o.from}/content/${path}`).catch(() => null)
    const mb = Math.round((remote?.size ?? 0) / 1048576)
    if (!remote?.ok || (!o.activity && remote.size > o.maxMb * 1024 * 1024)) {
      skipped++
      process.stdout.write(
        remote?.ok ? `${mb} MB, over --max-mb ${o.maxMb} (--activity takes it)\n` : 'not on production\n',
      )
      continue
    }
    const response = await fetch(`${o.from}/content/${path}`, { signal: AbortSignal.timeout(900_000) })
    const body = await response.arrayBuffer()
    await s3.write(key, body, { type: remote.type ?? 'application/octet-stream' })
    copied++
    process.stdout.write(`copied, ${Math.max(1, Math.round(body.byteLength / 1024))} KB\n`)
  }
  process.stdout.write(`restore-media: ${db}: ${copied} copied, ${present} already local, ${skipped} skipped\n`)
}

await main()
