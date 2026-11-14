import type { AssetMapping } from './crypto-import.types'

/**
 * Tickers of the exchanges' exports → price ids (CoinGecko). Renamed or
 * merged tickers point to their current asset (`RNDR` → Render, `FTM` →
 * Sonic, `AGIX` → Fetch.ai): holdings are summed per price id, so the swap
 * lines an exchange writes on a migration (`-AGIX`, `+FET`) cancel out, and
 * a plain rename keeps its quantity. Other tickers are looked up with the
 * asset search when previewing.
 */
const KNOWN: Readonly<Record<string, Omit<AssetMapping, 'ticker'>>> = {
  BTC: { assetId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  ETH: { assetId: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  USDT: { assetId: 'tether', symbol: 'USDT', name: 'Tether' },
  BNB: { assetId: 'binancecoin', symbol: 'BNB', name: 'BNB' },
  SOL: { assetId: 'solana', symbol: 'SOL', name: 'Solana' },
  USDC: { assetId: 'usd-coin', symbol: 'USDC', name: 'USDC' },
  EURC: { assetId: 'euro-coin', symbol: 'EURC', name: 'EURC' },
  XRP: { assetId: 'ripple', symbol: 'XRP', name: 'XRP' },
  DOGE: { assetId: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
  ADA: { assetId: 'cardano', symbol: 'ADA', name: 'Cardano' },
  TRX: { assetId: 'tron', symbol: 'TRX', name: 'TRON' },
  AVAX: { assetId: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche' },
  LINK: { assetId: 'chainlink', symbol: 'LINK', name: 'Chainlink' },
  DOT: { assetId: 'polkadot', symbol: 'DOT', name: 'Polkadot' },
  LTC: { assetId: 'litecoin', symbol: 'LTC', name: 'Litecoin' },
  ATOM: { assetId: 'cosmos', symbol: 'ATOM', name: 'Cosmos Hub' },
  TON: { assetId: 'the-open-network', symbol: 'TON', name: 'Toncoin' },
  POL: {
    assetId: 'polygon-ecosystem-token',
    symbol: 'POL',
    name: 'POL (ex-MATIC)',
  },
  RENDER: { assetId: 'render-token', symbol: 'RENDER', name: 'Render' },
  FET: {
    assetId: 'fetch-ai',
    symbol: 'FET',
    name: 'Artificial Superintelligence Alliance',
  },
  S: { assetId: 'sonic-3', symbol: 'S', name: 'Sonic' },
  SHIB: { assetId: 'shiba-inu', symbol: 'SHIB', name: 'Shiba Inu' },
  UNI: { assetId: 'uniswap', symbol: 'UNI', name: 'Uniswap' },
  NEAR: { assetId: 'near', symbol: 'NEAR', name: 'NEAR Protocol' },
  ARB: { assetId: 'arbitrum', symbol: 'ARB', name: 'Arbitrum' },
  OP: { assetId: 'optimism', symbol: 'OP', name: 'Optimism' },
  XLM: { assetId: 'stellar', symbol: 'XLM', name: 'Stellar' },
  BCH: { assetId: 'bitcoin-cash', symbol: 'BCH', name: 'Bitcoin Cash' },
  DAI: { assetId: 'dai', symbol: 'DAI', name: 'Dai' },
  AAVE: { assetId: 'aave', symbol: 'AAVE', name: 'Aave' },
}

/** Old ticker → current one. */
export const RENAMED_TICKERS: Readonly<Record<string, string>> = {
  RNDR: 'RENDER',
  FTM: 'S',
  AGIX: 'FET',
  OCEAN: 'FET',
  MATIC: 'POL',
}

/**
 * Fiat currencies: moved by deposits, purchases and sales, but not held as
 * crypto (left out of the holdings). EUR spent in a purchase is its cost.
 */
export const FIAT_TICKERS: ReadonlySet<string> = new Set([
  'EUR',
  'USD',
  'GBP',
  'CHF',
])

/** Price id of a ticker from the built-in table, renames followed. */
export function knownAsset(ticker: string): AssetMapping | null {
  const known = KNOWN[RENAMED_TICKERS[ticker] ?? ticker]
  return known ? { ticker, ...known } : null
}
