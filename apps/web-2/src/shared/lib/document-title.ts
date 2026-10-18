import { m } from '#/paraglide/messages'

/** The document title: the page's name, then the brand («Python · Ashyq Bilim»); the brand alone without a name. */
export const documentTitle = (name?: string | null): string =>
  name ? `${name} · ${m.platform_brand()}` : m.platform_brand()
