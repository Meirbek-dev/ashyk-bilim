import {
  confirmPasswordResetMutation,
  currentSessionQueryKey,
  loginMutation,
  logoutMutation,
  registerMutation,
  requestPasswordResetMutation,
  resendVerificationMutation,
  verifyEmailMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'

export const loginOptions = () => ({ ...loginMutation(), meta: { invalidates: [currentSessionQueryKey()] } })

export const logoutOptions = () => ({ ...logoutMutation(), meta: { invalidates: [currentSessionQueryKey()] } })

// None of these opens a session (the user signs in next), so no cached data changes.
export const registerOptions = () => ({ ...registerMutation(), meta: { invalidates: [] } })

export const verifyEmailOptions = () => ({ ...verifyEmailMutation(), meta: { invalidates: [] } })

export const resendVerificationOptions = () => ({ ...resendVerificationMutation(), meta: { invalidates: [] } })

export const requestPasswordResetOptions = () => ({ ...requestPasswordResetMutation(), meta: { invalidates: [] } })

export const confirmPasswordResetOptions = () => ({ ...confirmPasswordResetMutation(), meta: { invalidates: [] } })
