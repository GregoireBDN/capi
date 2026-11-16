/**
 * Coarse description of the device behind a sign-in, for the sessions list
 * (#217): browser and system names only ("Safari · iPhone"). The raw
 * `User-Agent` (versions, build ids) is never stored or returned.
 */

const MAX_HEADER_LENGTH = 512

/** First match wins: order matters (Edge and Opera also say "Chrome"). */
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|Opera)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
  [/\b(?:iPhone|iPad)\b.*\bAppleWebKit\//, 'Safari'],
  [/\bcurl\//i, 'curl'],
]

const SYSTEMS: [RegExp, string][] = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bLinux\b/, 'Linux'],
]

function find(rules: [RegExp, string][], ua: string): string | undefined {
  return rules.find(([pattern]) => pattern.test(ua))?.[1]
}

/** `"Safari · iPhone"`, `"Chrome"`, or null when nothing is recognised. */
export function describeDevice(userAgent: string | undefined): string | null {
  if (!userAgent) return null
  const ua = userAgent.slice(0, MAX_HEADER_LENGTH)
  const parts = [find(BROWSERS, ua), find(SYSTEMS, ua)].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}
