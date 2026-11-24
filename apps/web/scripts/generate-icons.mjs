// Regenerates, from the owner's Capi files (#464: `public/logo.svg` the mark,
// `public/brand/capi-icone.svg` the tile, `public/brand/capi-nom-bleu.svg` the
// wordmark), what the app shows:
// - `public/brand/`: the wordmark and the mark cropped to their drawing (the
//   owner's files keep a wide margin, which made them look small in the
//   header and the tab), their light variants for dark mode, and the SVG
//   favicon (the mark, light on a dark tab bar);
// - the PWA icons and favicons on the tile, and their staging variants on a
//   yellow tile (#454, `public/icons/staging/`).
//
//   pnpm --filter @capi/web icons
//
// Outputs are committed: re-run this only when the logo or the colours change.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const publicDir = path.join(root, 'public')
const iconsDir = path.join(publicDir, 'icons')
const brandDir = path.join(publicDir, 'brand')
const logo = path.join(publicDir, 'logo.svg')

/**
 * The owner's blues and their light variants for dark mode: every light stop
 * is ≥ 4.9:1 on the dark `--background` `#090c1a` (the blue's darkest, 2.1:1).
 */
const LIGHT_STOPS = {
  '#5B8EF5': '#9DBBFA',
  '#2F63E0': '#6E98F4',
  '#1B3FA6': '#4A7BEA',
}

/** Drawing boxes (viewBox units) of the owner's files, 2 units of margin. */
const MARK_BOX = { x: 24.5, y: 48, size: 416 } // the « C », square
const WORDMARK_BOX = { x: 48, y: 48, width: 1090, height: 513 }

function withViewBox(svg, box) {
  return svg.replace(/viewBox="[^"]*"/, `viewBox="${box}"`)
}

function lighter(svg) {
  return Object.entries(LIGHT_STOPS).reduce(
    (out, [blue, light]) => out.replaceAll(blue, light),
    svg,
  )
}

/** The SVG favicon: blue, and its light stops on a dark tab bar. */
function adaptive(svg) {
  const rules = Object.entries(LIGHT_STOPS)
    .map(([blue, light]) => `[stop-color="${blue}"]{stop-color:${light}}`)
    .join('')
  return svg.replace(
    '<defs>',
    `<defs><style>@media (prefers-color-scheme: dark){${rules}}</style>`,
  )
}

const markSvg = await readFile(logo, 'utf8')
const wordmarkSvg = await readFile(
  path.join(brandDir, 'capi-nom-bleu.svg'),
  'utf8',
)
const markBox = `${MARK_BOX.x} ${MARK_BOX.y} ${MARK_BOX.size} ${MARK_BOX.size}`
const wordmarkBox = `${WORDMARK_BOX.x} ${WORDMARK_BOX.y} ${WORDMARK_BOX.width} ${WORDMARK_BOX.height}`
const brand = {
  'brand/capi-mark.svg': withViewBox(markSvg, markBox),
  'brand/capi-mark-clair.svg': lighter(withViewBox(markSvg, markBox)),
  'brand/capi-favicon.svg': adaptive(withViewBox(markSvg, markBox)),
  'brand/capi-nom.svg': withViewBox(wordmarkSvg, wordmarkBox),
  'brand/capi-nom-clair.svg': lighter(withViewBox(wordmarkSvg, wordmarkBox)),
}
/** The cropped mark, for the favicons. */
const croppedMark = Buffer.from(brand['brand/capi-mark.svg'])

/**
 * The Capi tile (`brand/capi-icone.svg`): white to `#EAF0FD`, top left to
 * bottom right, the mark scaled 0.78 in its middle, corners `rx 112` of 512.
 */
const BACKGROUND = { from: '#ffffff', to: '#eaf0fd' }
const MARK_SCALE = 0.78
const TILE_RADIUS = 112 / 512

/**
 * Staging's yellow (#454): light `--env-banner` (oklch(0.88 0.16 95),
 * `@capi/ui/globals.css`), as in manifest-staging.json.
 */
const STAGING_BACKGROUND = '#f9d544'

/** SVG fill for `background`: a colour, or a `{ from, to }` diagonal gradient. */
function fill(background) {
  if (typeof background === 'string') return { defs: '', paint: background }
  return {
    defs: `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${background.from}"/><stop offset="1" stop-color="${background.to}"/></linearGradient></defs>`,
    paint: 'url(#bg)',
  }
}

/**
 * Renders the logo at `size * scale` and centres it on a `size` square.
 * `radius` (fraction of the size) rounds the tile corners; 0 = full bleed.
 */
async function tile({
  size,
  scale,
  radius = 0,
  background = BACKGROUND,
  source = logo,
}) {
  const inner = Math.round(size * scale)
  const mark = await sharp(source, { density: 600 })
    .resize(inner, inner, { fit: 'contain', background: '#0000' })
    .png()
    .toBuffer()

  const r = Math.round(size * radius)
  const { defs, paint } = background ? fill(background) : {}
  const base = background
    ? Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${defs}<rect width="${size}" height="${size}" rx="${r}" fill="${paint}"/></svg>`,
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
    // `any` icons: the rounded tile, the launcher shows them as-is.
    [`${dir}/icon-192.png`]: await tile({
      size: 192,
      scale: MARK_SCALE,
      radius: TILE_RADIUS,
      background,
    }),
    [`${dir}/icon-512.png`]: await tile({
      size: 512,
      scale: MARK_SCALE,
      radius: TILE_RADIUS,
      background,
    }),
    // Maskable: full bleed. The mark is a ring of radius ~0.4 of its box, so
    // at 0.78 it stays within ~0.31 of the size from the centre, inside the
    // 0.4 safe-zone circle.
    [`${dir}/icon-maskable-512.png`]: await tile({
      size: 512,
      scale: MARK_SCALE,
      background,
    }),
    // iOS ignores transparency (fills it with black) and rounds corners itself.
    [`${dir}/apple-touch-icon.png`]: await tile({
      size: 180,
      scale: MARK_SCALE,
      background,
    }),
  }
}

/**
 * A favicon: the cropped mark, as large as the tab allows (like the other
 * sites' icons beside it); on staging, on its yellow tile.
 */
async function favicon(background) {
  return ico(
    await Promise.all(
      [16, 32, 48].map(async (size) => ({
        size,
        data: await tile({
          size,
          scale: background ? 0.84 : 1,
          radius: background ? TILE_RADIUS : 0,
          background,
          source: croppedMark,
        }),
      })),
    ),
  )
}

const outputs = {
  ...brand,
  ...(await appIcons('icons', BACKGROUND)),
  'favicon.ico': await favicon(null),
  // Staging (#454): the same icons on a yellow tile, so its home-screen
  // install and its browser tab never pass for production's.
  ...(await appIcons('icons/staging', STAGING_BACKGROUND)),
  'icons/staging/favicon.ico': await favicon(STAGING_BACKGROUND),
}

for (const [file, data] of Object.entries(outputs)) {
  await writeFile(path.join(publicDir, file), data)
  console.warn(`wrote public/${file} (${data.length} bytes)`)
}
