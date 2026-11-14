import type { CryptoParseResult } from '../crypto-import.types'
import { findBinanceHeader, parseBinanceCsv } from './binance.parser'
import { findCoinbaseHeader, parseCoinbaseCsv } from './coinbase.parser'
import { readRecords } from './common'

/** Thrown when a file is neither a Binance nor a Coinbase export. */
export class UnsupportedCryptoExportError extends Error {
  constructor() {
    super('Not a Binance or Coinbase transactions export')
  }
}

/**
 * Decodes an exchange export (UTF-8, BOM dropped) and parses it with the
 * parser whose header it carries. Pure: no I/O, no logging.
 */
export function parseCryptoExport(buffer: Buffer): CryptoParseResult {
  const text = new TextDecoder('utf-8').decode(buffer)
  const { records } = readRecords(text)
  if (findBinanceHeader(records)) return parseBinanceCsv(text)
  if (findCoinbaseHeader(records)) return parseCoinbaseCsv(text)
  throw new UnsupportedCryptoExportError()
}
