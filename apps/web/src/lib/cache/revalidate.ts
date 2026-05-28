/**
 * Client-side Next.js cache revalidation.
 * Calls the /api/revalidate route handler which runs revalidateTag server-side.
 */
export const revalidateTags = async (tags: string[]) => {
  const uniqueTags = [...new Set(tags)]
    .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    .map(tag => tag.trim())

  if (uniqueTags.length === 0) return

  const baseUrl = typeof globalThis.window !== 'undefined' ? globalThis.location.origin : ''
  const endpoint = `${baseUrl}/api/revalidate`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: uniqueTags }),
    })
    if (!response.ok) {
      throw new Error(`Failed to revalidate tags (${response.status})`)
    }
  } catch (error) {
    console.warn('Failed to revalidate tags via POST, falling back to per-tag requests', {
      tags: uniqueTags,
      error,
    })
    await Promise.all(
      uniqueTags.map(tag => {
        const url = `${endpoint}?tag=${encodeURIComponent(tag)}`
        return fetch(url, { credentials: 'include' })
      }),
    )
  }
}
