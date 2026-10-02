import { currentSessionQueryKey, loginMutation, logoutMutation } from '#/shared/api/gen/@tanstack/react-query.gen'

export const loginOptions = () => ({ ...loginMutation(), meta: { invalidates: [currentSessionQueryKey()] } })

export const logoutOptions = () => ({ ...logoutMutation(), meta: { invalidates: [currentSessionQueryKey()] } })
