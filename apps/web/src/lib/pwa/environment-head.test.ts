import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PUBLIC_SHELL_FILES } from '#/sw/precache'
import { ENVIRONMENT_HEAD } from './environment-head'

const publicDir = path.resolve(import.meta.dirname, '../../../public')

interface Icon {
  src: string
}
interface Manifest {
  name: string
  short_name: string
  description: string
  theme_color: string
  background_color: string
  icons: Icon[]
  shortcuts: { icons: Icon[] }[]
}

function manifest(href: string): Manifest {
  return JSON.parse(
    readFileSync(path.join(publicDir, href), 'utf8'),
  ) as Manifest
}

/** Every public file the head and its manifest point at. */
function referencedFiles(env: keyof typeof ENVIRONMENT_HEAD): string[] {
  const head = ENVIRONMENT_HEAD[env]
  const m = manifest(head.manifest)
  return [
    head.manifest,
    head.favicon,
    head.appleTouchIcon,
    ...(head.svgIcon ? [head.svgIcon] : []),
    ...m.icons.map((icon) => icon.src),
    ...m.shortcuts.flatMap((s) => s.icons.map((icon) => icon.src)),
  ]
}

describe('ENVIRONMENT_HEAD (#454)', () => {
  it('keeps production’s head, named Capi (#464)', () => {
    expect(ENVIRONMENT_HEAD.production).toEqual({
      appName: 'Capi',
      manifest: '/manifest.json',
      favicon: '/favicon.ico',
      svgIcon: '/brand/capi-favicon.svg',
      appleTouchIcon: '/icons/apple-touch-icon.png',
      themeColor: { light: '#f4f7fc', dark: '#090c1a' },
    })
  })

  it('gives staging its own manifest, yellow icons and a yellow theme', () => {
    const staging = ENVIRONMENT_HEAD.staging
    const m = manifest(staging.manifest)
    expect(m.name).toBe('Capi (staging)')
    expect(m.short_name).toBe(staging.appName)
    expect(m.theme_color).toBe(staging.themeColor.light)
    expect(m.background_color).toBe(staging.themeColor.light)
    for (const file of referencedFiles('staging')) {
      if (file !== staging.manifest) expect(file).toMatch(/^\/icons\/staging\//)
    }
  })

  it.each(['production', 'staging'] as const)(
    'points %s at files that exist and are precached',
    (env) => {
      for (const file of referencedFiles(env)) {
        expect(existsSync(path.join(publicDir, file)), file).toBe(true)
        expect(PUBLIC_SHELL_FILES as readonly string[]).toContain(file.slice(1))
      }
    },
  )

  it('keeps the staging manifest in step with production’s', () => {
    const production = manifest('/manifest.json')
    const staging = manifest('/manifest-staging.json')
    const icons = (m: Manifest) => ({
      icons: m.icons.map((icon) => ({
        ...icon,
        src: icon.src.replace('/icons/staging/', '/icons/'),
      })),
      shortcuts: m.shortcuts.map((s) => ({
        ...s,
        icons: s.icons.map((icon) => ({
          ...icon,
          src: icon.src.replace('/icons/staging/', '/icons/'),
        })),
      })),
    })
    const own = {
      name: '',
      short_name: '',
      description: '',
      theme_color: '',
      background_color: '',
    }
    expect({ ...staging, ...own, ...icons(staging) }).toEqual({
      ...production,
      ...own,
      ...icons(production),
    })
  })
})
