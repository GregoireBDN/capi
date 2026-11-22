import type { CryptoParseResult } from '../crypto-import.types'
import { findBinanceHeader, parseBinanceCsv } from './binance.parser'
import { findCoinbaseHeader, parseCoinbaseCsv } from './coinbase.parser'
import { readRecords } from './common'
import { findLedgerLiveHeader, parseLedgerLiveCsv } from './ledger-live.parser'

/** Thrown when a file is none of the supported crypto exports. */
export class UnsupportedCryptoExportError extends Error {
  constructor() {
    super('Not a Binance, Coinbase or Ledger Live export')
  }
}

/**
 * Decodes a crypto export (UTF-8, BOM dropped) and parses it with the
 * parser whose header it carries: Binance, Coinbase (#128) or Ledger Live
 * (#426). Pure: no I/O, no logging.
 */
export function parseCryptoExport(buffer: Buffer): CryptoParseResult {
  const text = new TextDecoder('utf-8').decode(buffer)
  const { records } = readRecords(text)
  if (findLedgerLiveHeader(records)) return parseLedgerLiveCsv(text)
  if (findBinanceHeader(records)) return parseBinanceCsv(text)
  if (findCoinbaseHeader(records)) return parseCoinbaseCsv(text)
  throw new UnsupportedCryptoExportError()
}
