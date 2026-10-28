import * as v from 'valibot'

/**
 * A text value of the URL's search. The router reads every value as JSON when it can, so a typed, pasted or emailed
 * `?q=2024`, `?code=123456`, `?q=null` or `?q=[1]` arrives as a number, null or an array, and a plain `v.string()`
 * refused it: the whole page answered «Что-то пошло не так» (500). Here such a value is its text again. Use it wherever a
 * search param holds free text or a code; ids and enums take `v.fallback` instead.
 */
export const searchText = v.pipe(
  v.unknown(),
  v.transform(value => (typeof value === 'string' ? value : JSON.stringify(value))),
)
