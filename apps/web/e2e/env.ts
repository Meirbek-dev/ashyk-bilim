export const getEnv = (key: string): string | undefined => process.env[key]

export const getEnvOr = (key: string, fallback: string): string => getEnv(key) ?? fallback

export const requireEnv = (key: string): string => {
  const value = getEnv(key)
  if (value === undefined) {
    throw new Error(`[e2e] Missing required environment variable: ${key}`)
  }
  return value
}

export const setEnv = (key: string, value: string): string => {
  process.env[key] = value
  return value
}
