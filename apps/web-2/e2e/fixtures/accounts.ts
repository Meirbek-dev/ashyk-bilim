import { createHmac, randomInt, randomUUID } from 'node:crypto'
import { closeSync, openSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createClient, createConfig } from '#/shared/api/gen/client'
import { login, register, totpEnroll, totpVerify } from '#/shared/api/gen/sdk.gen'

import { expect } from './test'

// Fresh accounts for the auth specs, made through the generated SDK. Self-registration is rate-limited per client
// address (10 per hour); each account comes from its own X-Real-IP, which the API trusts only from the edge (on the
// stand nginx overwrites it, so the cap still holds there).

export const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`

export type NewAccount = { username: string; email: string; password: string }

export function newAccount(): NewAccount {
  const username = `e2e-${randomUUID().slice(0, 12)}`
  return { username, email: `${username}@e2e.test`, password: `E2e-${randomUUID().slice(0, 8)}-Pw1!` }
}

/**
 * The stand (`just web2-e2e`) caps self-registration at 10 per hour for everyone (nginx sets the address): with
 * E2E_LEARNERS=<n> and E2E_LEARNERS_DIR a test takes the next untaken `seed-e2e --learners <n>` account (verified,
 * E2E_PASSWORD). A taken one is a file in that directory, so parallel workers and reruns never share an account.
 */
function poolAccount(): NewAccount | undefined {
  const size = Number(process.env['E2E_LEARNERS'] ?? 0)
  const dir = process.env['E2E_LEARNERS_DIR']
  const password = process.env['E2E_PASSWORD']
  if (!size || !dir || !password) return undefined
  for (let n = 1; n <= size; n++) {
    const id = String(n).padStart(3, '0')
    try {
      closeSync(openSync(join(dir, id), 'wx'))
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') continue
      throw error
    }
    return { username: `e2e-learner-${id}`, email: `learner-${id}@e2e.test`, password }
  }
  return undefined
}

/** A fresh account: a pool one when configured, unless `account` asks for a real (unverified) registration. */
export async function registerAccount(baseUrl: string, account?: NewAccount): Promise<NewAccount> {
  if (!account) {
    const pooled = poolAccount()
    if (pooled) return pooled
    account = newAccount()
  }
  const client = createClient(createConfig({ baseUrl }))
  await register({
    client,
    body: { ...account, first_name: 'E2E', last_name: 'Account', organization: 'E2E' },
    headers: { 'x-real-ip': randomIp() },
    throwOnError: true,
  })
  return account
}

/**
 * The emailed verification code. Without a mailer (`AB__RESEND__*` unset) the API logs it as
 * `... email: <address>, code: "<CODE>"`; E2E_API_LOG is the path of that log (the stand: `docker compose logs api`).
 */
export async function verificationCode(email: string): Promise<string> {
  const path = process.env['E2E_API_LOG']
  if (!path) throw new Error('Set E2E_API_LOG to the API log file: without a mailer the API logs verification codes')
  const pattern = new RegExp(`${email.replaceAll(/[.@+-]/g, '\\$&')}\\W+code\\W+([A-Z0-9]{4,})`)
  let code = ''
  await expect.poll(() => (code = pattern.exec(readFileSync(path, 'utf8'))?.[1] ?? '')).not.toBe('')
  return code
}

/** RFC 6238 code (SHA-1, 30 s, 6 digits) of a base32 secret, `steps` periods from now. */
export function totp(secret: string, steps = 0): string {
  const bits = secret
    .replaceAll('=', '')
    .toUpperCase()
    .split('')
    .map(char => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5, '0'))
    .join('')
  const key = Buffer.from(bits.match(/.{8}/g)?.map(byte => Number.parseInt(byte, 2)) ?? [])
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + steps))
  const hmac = createHmac('sha1', key).update(counter).digest()
  const offset = (hmac.at(-1) ?? 0) & 0xf
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

/** A registered account with an authenticator enrolled; returns its TOTP secret. */
export async function accountWithTotp(baseUrl: string): Promise<NewAccount & { secret: string }> {
  const account = await registerAccount(baseUrl)
  const client = createClient(createConfig({ baseUrl }))
  const signedIn = await login({
    client,
    body: { login: account.username, password: account.password },
    throwOnError: true,
  })
  const cookie = /^[^;]+/.exec(signedIn.response.headers.get('set-cookie') ?? '')?.[0] ?? ''
  const { data } = await totpEnroll({ client, headers: { cookie }, throwOnError: true })
  // The previous period's code: the sign-in under test then uses the current one, never a replay.
  await totpVerify({ client, body: { code: totp(data.secret, -1) }, headers: { cookie }, throwOnError: true })
  return { ...account, secret: data.secret }
}
