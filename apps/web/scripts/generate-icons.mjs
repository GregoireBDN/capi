// Regenerates the PWA icons and favicon from `public/logo.svg`, and their
// staging variants on a yellow tile (#454, `public/icons/staging/`).
//
//   pnpm --filter @finances/web icons
//
// Outputs are committed: re-run this only when the logo or the colours change.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const publicDir = path.join(root, 'public')
const iconsDir = path.join(publicDir, 'icons')
const logo = path.join(publicDir, 'logo.svg')

/** Light theme `--background` (oklch(0.975 0.007 260)), as in manifest.json. */
const BACKGROUND = '#f4f7fc'

/**
 * Staging's yellow (#454): light `--env-banner` (oklch(0.88 0.16 95),
 * `@finances/ui/globals.css`), as in manifest-staging.json.
 */
const STAGING_BACKGROUND = '#f9d544'

/**
 * Renders the logo at `size * scale` and centres it on a `size` square.
 * `radius` (fraction of the size) rounds the tile corners; 0 = full bleed.
 */
async function tile({ size, scale, radius = 0, background = BACKGROUND }) {
  const inner = Math.round(size * scale)
  const mark = await sharp(logo, { density: 600 })
    .resize(inner, inner, { fit: 'contain', background: '#0000' })
    .png()
    .toBuffer()

  const r = Math.round(size * radius)
  const base = background
    ? Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${background}"/></svg>`,
      )
    : {
        create: {
          width: size,
          height: size,
          channels: 4,
          background: '#0000',
        },
      }

  const offset = Math.round((size - inner) / 2)
  return sharp(base)
    .composite([{ input: mark, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/** Minimal ICO container holding PNG images (supported by every browser). */
function ico(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(pngs.length, 4)

  const entries = []
  let offset = 6 + 16 * pngs.length
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1) // height
    entry.writeUInt8(0, 2) // palette
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += data.length
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)])
}

await mkdir(path.join(iconsDir, 'staging'), { recursive: true })

/** The app icons (`any`, maskable, iOS) on `background`, under `dir`. */
async function appIcons(dir, background) {
  return {
    // `any` icons: rounded tile, the launcher shows them as-is.
    [`${dir}/icon-192.png`]: await tile({
      size: 192,
      scale: 0.72,
      radius: 0.22,
      background,
    }),
    [`${dir}/icon-512.png`]: await tile({
      size: 512,
      scale: 0.72,
      radius: 0.22,
      background,
    }),
    // Maskable: full bleed, the mark fits inside the 80 % safe-zone circle
    // (0.56 × √2 ≈ 0.79 of the size, so even its corners stay inside).
    [`${dir}/icon-maskable-512.png`]: await tile({
      size: 512,
      scale: 0.56,
      background,
    }),
    // iOS ignores transparency (fills it with black) and rounds corners itself.
    [`${dir}/apple-touch-icon.png`]: await tile({
      size: 180,
      scale: 0.7,
      background,
    }),
  }
}

const outputs = {
  ...(await appIcons('icons', BACKGROUND)),
  'favicon.ico': ico([
    { size: 16, data: await tile({ size: 16, scale: 1, background: null }) },
    { size: 32, data: await tile({ size: 32, scale: 1, background: null }) },
    { size: 48, data: await tile({ size: 48, scale: 1, background: null }) },
  ]),
  // Staging (#454): the same icons on a yellow tile, so its home-screen
  // install and its browser tab never pass for production's. Its favicon
  // keeps a tile too: a bare mark would look like production's.
  ...(await appIcons('icons/staging', STAGING_BACKGROUND)),
  'icons/staging/favicon.ico': ico(
    await Promise.all(
      [16, 32, 48].map(async (size) => ({
        size,
        data: await tile({
          size,
          scale: 0.8,
          radius: 0.22,
          background: STAGING_BACKGROUND,
        }),
      })),
    ),
  ),
}

for (const [file, data] of Object.entries(outputs)) {
  await writeFile(path.join(publicDir, file), data)
  console.warn(`wrote public/${file} (${data.length} bytes)`)
}
