import {
  currentSessionQueryKey,
  loginMutation,
  logoutMutation,
  registerMutation,
  verifyEmailMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'

export const loginOptions = () => ({ ...loginMutation(), meta: { invalidates: [currentSessionQueryKey()] } })

export const logoutOptions = () => ({ ...logoutMutation(), meta: { invalidates: [currentSessionQueryKey()] } })

// Neither opens a session (the user signs in next), so no cached data changes.
export const registerOptions = () => ({ ...registerMutation(), meta: { invalidates: [] } })

export const verifyEmailOptions = () => ({ ...verifyEmailMutation(), meta: { invalidates: [] } })
