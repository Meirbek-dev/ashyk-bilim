// One serial scenario in one worker. Retries start from authoring with empty state.
const state = new Map<string, string>()
export const getEnv = (key: string): string | undefined => state.get(key)
export const setEnv = (key: string, value: string): string => {
  state.set(key, value)
  return value
}
export const resetJourney = () => state.clear()
