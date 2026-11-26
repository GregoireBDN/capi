// Packs the « Capi » Skill (`skills/capi/`, #497) into `public/capi-skill.zip`,
// the file « Réglages › Claude et accès › Le Skill Capi » offers to download
// and upload to claude.ai. Run before `vite dev` and `vite build`; the zip is
// git-ignored. No dependency: a plain ZIP (deflate) with fixed timestamps, so
// the same Skill always gives the same bytes.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = join(here, '../../../skills/capi')
const OUT = join(here, '../public/capi-skill.zip')
/** The folder name inside the zip: claude.ai expects the Skill in a folder. */
const ROOT = 'capi'
/** 2026-01-01 00:00 in MS-DOS format. */
const DOS_TIME = 0
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

function files(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      if (entry.name.startsWith('.')) return []
      const path = join(dir, entry.name)
      return entry.isDirectory() ? files(path) : [path]
    })
}

export function buildSkillZip(skillDir = SKILL_DIR) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const path of files(skillDir)) {
    const name = Buffer.from(
      `${ROOT}/${relative(skillDir, path).split(sep).join('/')}`,
    )
    const data = readFileSync(path)
    const packed = deflateRawSync(data, { level: 9 })
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, packed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // made by
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(DOS_TIME, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += local.length + name.length + packed.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(centrals.length / 2, 8)
  end.writeUInt16LE(centrals.length / 2, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, buildSkillZip())
}
