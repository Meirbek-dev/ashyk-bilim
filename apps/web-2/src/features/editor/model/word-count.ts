/** Words of the page's text: runs between spaces that hold a letter or a digit (a lone «-» is not a word). */
export const wordCount = (text: string) => text.split(/\s+/u).filter(word => /[\p{L}\p{N}]/u.test(word)).length

/** Minutes a learner needs to read it, at 180 words a minute; at least 1 once there is a word. */
export const readingMinutes = (words: number) => (words === 0 ? 0 : Math.max(1, Math.round(words / 180)))
