// ponytail: a six-rule sniff for the sessions list, not a UA database.
// Upgrade to a parser package if device names ever matter beyond this label.
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//u, 'Edge'],
  [/\bOPR\/|\bOpera\b/u, 'Opera'],
  [/\bYaBrowser\//u, 'Yandex Browser'],
  [/\bFirefox\/|\bFxiOS\//u, 'Firefox'],
  // No leading `\b`: `HeadlessChrome/…` is Chrome too.
  [/Chrome\/|\bCriOS\//u, 'Chrome'],
  [/\bSafari\//u, 'Safari'],
]
const SYSTEMS: [RegExp, string][] = [
  [/\bWindows\b/u, 'Windows'],
  [/\bAndroid\b/u, 'Android'],
  [/\b(?:iPhone|iPad|iPod)\b/u, 'iOS'],
  [/\bMac OS X\b|\bMacintosh\b/u, 'macOS'],
  [/\bCrOS\b/u, 'ChromeOS'],
  [/\bLinux\b/u, 'Linux'],
]

/** "Chrome · Windows" from a raw user-agent; `null` when nothing is recognised. */
export function describeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1]
  const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1]
  if (!browser && !system) return null
  return [browser, system].filter(Boolean).join(' · ')
}
