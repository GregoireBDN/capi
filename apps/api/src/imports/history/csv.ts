/**
 * Minimal RFC 4180 reader for the Google Sheets CSV export: `,`-separated,
 * fields optionally wrapped in double quotes, `""` is an escaped quote, and a
 * quoted field may span several lines. Pure: no I/O, no logging.
 */

export interface CsvRecord {
  /** 1-based physical line the record starts on. */
  lineNumber: number
  fields: string[]
}

export interface CsvReadResult {
  records: CsvRecord[]
  /** Start lines of records whose quoted field is never closed. */
  unterminatedLines: number[]
}

const SEPARATOR = ','

/**
 * Splits `text` into records. A record whose quoted field is still open at
 * the end of the input is reported in `unterminatedLines` and reading resumes
 * on the next physical line, so one stray quote does not swallow the rest of
 * the file.
 */
export function readCsv(text: string): CsvReadResult {
  const records: CsvRecord[] = []
  const unterminatedLines: number[] = []
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0
  let line = 1

  while (pos < text.length) {
    const start = { pos, line }
    const fields: string[] = []
    let field = ''
    let inQuotes = false
    let fieldStarted = false
    let ended = false

    while (pos < text.length) {
      const ch = text[pos]
      if (inQuotes) {
        if (ch === '"') {
          if (text[pos + 1] === '"') {
            field += '"'
            pos += 2
          } else {
            inQuotes = false
            pos++
          }
          continue
        }
        if (ch === '\r' || ch === '\n') line++
        if (ch === '\r' && text[pos + 1] === '\n') {
          field += '\n'
          pos += 2
          continue
        }
        field += ch === '\r' ? '\n' : ch
        pos++
        continue
      }
      if (ch === '"' && !fieldStarted) {
        inQuotes = true
        fieldStarted = true
        pos++
        continue
      }
      if (ch === SEPARATOR) {
        fields.push(field)
        field = ''
        fieldStarted = false
        pos++
        continue
      }
      if (ch === '\r' || ch === '\n') {
        pos += ch === '\r' && text[pos + 1] === '\n' ? 2 : 1
        line++
        ended = true
        break
      }
      // Lenient: text after a closing quote is kept (`"abc"def` → `abcdef`).
      field += ch
      fieldStarted = true
      pos++
    }

    if (inQuotes) {
      unterminatedLines.push(start.line)
      pos = nextLineStart(text, start.pos)
      line = start.line + 1
      continue
    }
    fields.push(field)
    records.push({ lineNumber: start.line, fields })
    if (!ended) break
  }

  return { records, unterminatedLines }
}

function nextLineStart(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\n') return i + 1
    if (text[i] === '\r') return text[i + 1] === '\n' ? i + 2 : i + 1
  }
  return text.length
}

/** True when every field is empty or whitespace (Sheets pads blank rows). */
export function isBlankRecord(record: CsvRecord): boolean {
  return record.fields.every((f) => f.trim() === '')
}
