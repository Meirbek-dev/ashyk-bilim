// G-03: catalogs agree across locales, follow the naming rules, match the glossary, and are all used.
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { allowlist, appDir, type Finding, read, walk } from './lib.ts'

type Catalog = Record<string, unknown>

// Plural categories each locale must spell out (spec 7.9).
const PLURAL_FORMS: Record<string, string[]> = {
  ru: ['few', 'many', 'one', 'other'],
  kk: ['one', 'other'],
  en: ['one', 'other'],
}

const text = (value: unknown): string => (typeof value === 'string' ? value : (JSON.stringify(value) ?? ''))
const params = (value: unknown): string[] =>
  [...new Set([...text(value).matchAll(/\{(\w+)\}|input (\w+)/g)].map(match => match[1] ?? match[2] ?? ''))].toSorted()
/** Plural categories of a variant message (`countPlural=few` -> few), or null for a plain string. */
const pluralForms = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null
  const match: unknown = value[0]?.match
  return typeof match === 'object' && match
    ? Object.keys(match)
        .map(key => key.split('=')[1] ?? '')
        .toSorted()
    : []
}

function settings(): { locales: string[]; patterns: string[] } {
  const raw: { locales: string[]; 'plugin.inlang.messageFormat': { pathPattern: string[] } } = JSON.parse(
    read('project.inlang/settings.json'),
  )
  return { locales: raw.locales, patterns: raw['plugin.inlang.messageFormat'].pathPattern }
}

function checkFiles(locales: string[], patterns: string[], findings: Finding[]): string[] {
  const features = patterns.map(pattern => /\{locale\}\/([\w-]+)\.json$/.exec(pattern)?.[1] ?? pattern)
  for (const locale of locales) {
    const onDisk = readdirSync(resolve(appDir, 'messages', locale)).map(name => name.replace(/\.json$/, ''))
    for (const name of onDisk.filter(file => !features.includes(file))) {
      findings.push({
        file: `messages/${locale}/${name}.json`,
        rule: 'i18n-unlisted',
        fix: `add "./messages/{locale}/${name}.json" to project.inlang/settings.json pathPattern (unlisted files are silently ignored)`,
      })
    }
    for (const name of features.filter(
      feature => !existsSync(resolve(appDir, 'messages', locale, `${feature}.json`)),
    )) {
      findings.push({
        file: `messages/${locale}/${name}.json`,
        rule: 'i18n-missing-file',
        fix: 'create the catalog for this locale',
      })
    }
  }
  return features
}

function checkMessage(key: string, feature: string, values: Record<string, unknown>, findings: Finding[]): void {
  const file = `messages/ru/${feature}.json`
  const ru = values['ru']
  if (!new RegExp(`^${feature}_[a-z0-9_]+$`).test(key)) {
    findings.push({ file, rule: 'i18n-key-name', fix: `rename "${key}" to snake_case with the "${feature}_" prefix` })
  }
  const sameAllowed = allowlist().i18nSameAsRu.some(entry => entry.key === key)
  for (const [locale, value] of Object.entries(values)) {
    const where = `messages/${locale}/${feature}.json`
    if (value === undefined) {
      findings.push({
        file: where,
        rule: 'i18n-missing-key',
        fix: `"${key}" is missing here: every locale has the same keys`,
      })
      continue
    }
    if (params(value).join() !== params(ru).join()) {
      findings.push({
        file: where,
        rule: 'i18n-params',
        fix: `"${key}" must use the params of ru: ${params(ru).join(', ')}`,
      })
    }
    const forms = pluralForms(value)
    const expected = PLURAL_FORMS[locale] ?? []
    if (forms && forms.join() !== expected.join()) {
      findings.push({
        file: where,
        rule: 'i18n-plural',
        fix: `"${key}" needs exactly the ${locale} forms ${expected.join(', ')}`,
      })
    }
    if (locale === 'kk' && text(value) === text(ru) && !sameAllowed) {
      findings.push({
        file: where,
        rule: 'i18n-untranslated',
        fix: `"${key}" equals ru: translate it, or allowlist with a reason`,
      })
    }
    if (locale === 'kk' && text(value) !== text(ru) && sameAllowed) {
      findings.push({
        file: 'gates/allowlist.json',
        rule: 'i18n-untranslated',
        fix: `"${key}" no longer equals ru in kk: drop it from i18nSameAsRu`,
      })
    }
  }
}

type Term = { ru?: string; kk?: string; en?: string; not?: string[] }

/** The ru stem starts a word (so "курс" skips "дискурс") and that word is not one of `not` ("курсив", "работает"). */
function usesTerm(ruText: string, term: Term): boolean {
  const stem = term.ru
  if (!stem) return false
  return ruText
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .some((_, index, words) => {
      const rest = words.slice(index).join(' ')
      return rest.startsWith(stem) && !(term.not ?? []).some(word => rest.startsWith(word))
    })
}

function checkGlossary(catalogs: Record<string, Catalog>, feature: string, findings: Finding[]): void {
  const glossary: { terms: Term[] } = JSON.parse(read('messages/glossary.json'))
  for (const [key, ruValue] of Object.entries(catalogs['ru'] ?? {})) {
    for (const term of glossary.terms) {
      if (!usesTerm(text(ruValue), term)) continue
      for (const locale of ['kk', 'en'] as const) {
        const required = term[locale]
        if (required && !text(catalogs[locale]?.[key]).toLowerCase().includes(required)) {
          findings.push({
            file: `messages/${locale}/${feature}.json`,
            rule: 'i18n-glossary',
            fix: `"${key}" must use the glossary term "${required}" (ru "${term.ru}")`,
          })
        }
      }
    }
  }
}

export function i18n(): Finding[] {
  const findings: Finding[] = []
  const { locales, patterns } = settings()
  const features = checkFiles(locales, patterns, findings)
  const sources = walk('src', /\.tsx?$/)
    .map(read)
    .join('\n')
  for (const feature of features) {
    const catalogs: Record<string, Catalog> = {}
    for (const locale of locales) {
      const path = `messages/${locale}/${feature}.json`
      catalogs[locale] = existsSync(resolve(appDir, path)) ? JSON.parse(read(path)) : {}
    }
    const keys = new Set(locales.flatMap(locale => Object.keys(catalogs[locale] ?? {})))
    for (const key of keys) {
      checkMessage(key, feature, Object.fromEntries(locales.map(locale => [locale, catalogs[locale]?.[key]])), findings)
      if (!new RegExp(`\\bm\\.${key}\\b`).test(sources)) {
        findings.push({
          file: `messages/ru/${feature}.json`,
          rule: 'i18n-unused',
          fix: `"${key}" is used nowhere in src: remove it`,
        })
      }
    }
    checkGlossary(catalogs, feature, findings)
  }
  return findings
}
