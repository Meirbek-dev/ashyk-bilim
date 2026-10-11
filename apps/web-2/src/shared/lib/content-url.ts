/**
 * Public storage keys (`avatar_key`, thumbnails...) are served anonymously at /content/<key>. Accounts migrated from
 * the old platform keep their Google photo as an absolute `https://` URL in `avatar_key`: that one is used as is.
 */
export const contentUrl = (key: string) => (/^https?:\/\//i.test(key) ? key : `/content/${key}`)
