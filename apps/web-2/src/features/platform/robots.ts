// The rules for crawlers (UX-discover-40) and where the sitemap is (B-CAT-30). Served by src/routes/robots[.]txt.ts:
// the Sitemap line needs the site's own address.
const RULES = `User-agent: *
Allow: /
# Signed-in areas: a crawler only meets their sign-in detour (/login?redirect=...).
Disallow: /home
Disallow: /learning
Disallow: /learn/
Disallow: /teach
Disallow: /admin
Disallow: /settings
Disallow: /notifications
Disallow: /achievements
Disallow: /collections/*/edit
# Search results and links that carry a one-time code.
Disallow: /search
Disallow: /verify-email
Disallow: /reset-password
`

export const robotsTxt = (origin: string): string => `${RULES}\nSitemap: ${origin}/sitemap.xml\n`
