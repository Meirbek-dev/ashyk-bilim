'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getPostAuthRedirect, normalizeReturnTo } from '@/lib/auth/redirect'
import { applyBackendSetCookies, postAuthForm, postAuthJson, serverAuthFetch } from '@/lib/auth/server-auth-fetch'

interface LoginActionInput {
  email: string
  password: string
  returnTo?: string | null
}

interface SignupActionInput {
  email: string
  firstName: string
  lastName: string
  password: string
}

interface AuthActionResult {
  ok: boolean
  reason?: 'login_failed' | 'login_after_signup_failed' | 'signup_failed' | 'service_unavailable'
  signupCode?: string
}

function getSignupCode(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined
  }

  if ('code' in payload && typeof payload.code === 'string') {
    return payload.code
  }

  const detail = (payload as { detail?: unknown }).detail
  if (typeof detail !== 'object' || detail === null || !('code' in detail)) {
    return undefined
  }

  return typeof detail.code === 'string' ? detail.code : undefined
}

async function performLoginFetch(email: string, password: string): Promise<Response> {
  const formData = new URLSearchParams()
  formData.append('username', email.trim().toLowerCase())
  formData.append('password', password)

  return postAuthForm('auth/login', formData, { includeAuthCookies: false })
}

function usernameBaseFrom(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '')
}

function buildSignupUsername(input: Pick<SignupActionInput, 'email' | 'firstName' | 'lastName'>): string {
  const nameBase = usernameBaseFrom(`${input.firstName}.${input.lastName}`)
  const emailBase = usernameBaseFrom(input.email.split('@')[0] ?? '')
  const base = (nameBase || emailBase || 'user').slice(0, 20).replace(/^\.+|\.+$/g, '') || 'user'
  const suffix = Math.floor(Math.random() * 10_000)
    .toString()
    .padStart(4, '0')
  return `${base}.${suffix}`
}

export async function loginAction(input: LoginActionInput): Promise<AuthActionResult> {
  let response: Response
  try {
    response = await performLoginFetch(input.email, input.password)
  } catch {
    return { ok: false, reason: 'service_unavailable' }
  }

  if (!response.ok) {
    const reason = response.status === 503 ? 'service_unavailable' : 'login_failed'
    return { ok: false, reason }
  }

  await applyBackendSetCookies(response.headers)
  revalidatePath('/', 'layout')
  redirect(getPostAuthRedirect(input.returnTo))
}

export async function signupAction(input: SignupActionInput): Promise<AuthActionResult> {
  const username = buildSignupUsername(input)
  let signupResponse: Response
  try {
    signupResponse = await postAuthJson(
      'auth/register',
      {
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName,
        password: input.password,
        username,
      },
      { includeAuthCookies: false },
    )
  } catch {
    return { ok: false, reason: 'service_unavailable' }
  }

  if (!signupResponse.ok) {
    const payload = await signupResponse.json().catch(() => null)
    const signupCode = getSignupCode(payload)
    return signupCode ? { ok: false, reason: 'signup_failed', signupCode } : { ok: false, reason: 'signup_failed' }
  }

  let loginResponse: Response
  try {
    loginResponse = await performLoginFetch(input.email, input.password)
  } catch {
    return { ok: false, reason: 'login_after_signup_failed' }
  }

  if (!loginResponse.ok) {
    return { ok: false, reason: 'login_after_signup_failed' }
  }

  await applyBackendSetCookies(loginResponse.headers)
  revalidatePath('/', 'layout')
  redirect('/redirect_from_auth')
}

export async function logoutAction(redirectTo?: string | null): Promise<void> {
  const response = await serverAuthFetch('auth/logout', { method: 'POST' })
  await applyBackendSetCookies(response.headers)
  revalidatePath('/', 'layout')

  if (redirectTo) {
    redirect(normalizeReturnTo(redirectTo))
  }
}
