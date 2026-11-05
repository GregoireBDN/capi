/**
 * Code points of bytes 0x80–0x9F in Windows-1252, in byte order. Every other
 * byte maps to the code point with the same value (ISO-8859-1). The five bytes
 * Windows-1252 leaves undefined (0x81, 0x8D, 0x8F, 0x90, 0x9D) map to the C1
 * control with the same value, as in the WHATWG Encoding Standard.
 */
export const WINDOWS_1252_HIGH_CODE_POINTS: readonly number[] = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6,
  0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161,
  0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
]

const CHUNK_SIZE = 8192

/**
 * Decodes Windows-1252 bytes.
 *
 * Implemented with an explicit table rather than
 * `new TextDecoder('windows-1252')`: some Node versions (e.g. 20.x) decode
 * that label as plain ISO-8859-1, turning `€`, `’` or `œ` into C1 controls.
 */
export function decodeWindows1252(bytes: Uint8Array): string {
  const parts: string[] = []
  for (let start = 0; start < bytes.length; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, bytes.length)
    const codes = new Array<number>(end - start)
    for (let i = start; i < end; i++) {
      const byte = bytes[i]
      codes[i - start] =
        byte >= 0x80 && byte <= 0x9f
          ? WINDOWS_1252_HIGH_CODE_POINTS[byte - 0x80]
          : byte
    }
    parts.push(String.fromCharCode(...codes))
  }
  return parts.join('')
}
