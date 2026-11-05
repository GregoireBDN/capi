import { describe, expect, it } from 'vitest'
import {
  decodeWindows1252,
  WINDOWS_1252_HIGH_CODE_POINTS,
} from './windows-1252'

describe('decodeWindows1252', () => {
  it('decodes ASCII unchanged', () => {
    expect(decodeWindows1252(Buffer.from('Date;Solde\r\n', 'ascii'))).toBe(
      'Date;Solde\r\n',
    )
  })

  it('decodes Latin-1 range accents', () => {
    // D é b i t / C r é d i t / L i b e l l é / Ê / à / ç
    const bytes = Buffer.from([
      0x44, 0xe9, 0x62, 0x69, 0x74, 0x20, 0xca, 0xe0, 0xe7, 0xa0,
    ])
    expect(decodeWindows1252(bytes)).toBe(
      'Débit Êàç' + String.fromCharCode(0xa0),
    )
  })

  it('decodes the 0x80-0x9F range to typographic characters, not C1 controls', () => {
    // € ’ œ Œ “ ” – —
    const bytes = Buffer.from([0x80, 0x92, 0x9c, 0x8c, 0x93, 0x94, 0x96, 0x97])
    const decoded = decodeWindows1252(bytes)
    expect([...decoded].map((c) => c.codePointAt(0))).toEqual([
      0x20ac, 0x2019, 0x0153, 0x0152, 0x201c, 0x201d, 0x2013, 0x2014,
    ])
  })

  it('has one entry per byte from 0x80 to 0x9F', () => {
    expect(WINDOWS_1252_HIGH_CODE_POINTS).toHaveLength(32)
  })

  it('decodes inputs longer than one chunk', () => {
    const bytes = Buffer.alloc(20_000, 0xe9)
    const decoded = decodeWindows1252(bytes)
    expect(decoded).toHaveLength(20_000)
    expect(new Set(decoded)).toEqual(new Set(['é']))
  })
})
