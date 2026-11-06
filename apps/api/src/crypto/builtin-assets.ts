import type { CryptoAsset } from './price-provider'

/**
 * Common assets offered by the picker when the price API is disabled or
 * unreachable. Ids are CoinGecko ids, so prices can still be fetched later.
 */
export const BUILTIN_ASSETS: readonly CryptoAsset[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', rank: null },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', rank: null },
  { id: 'tether', symbol: 'USDT', name: 'Tether', rank: null },
  { id: 'binancecoin', symbol: 'BNB', name: 'BNB', rank: null },
  { id: 'solana', symbol: 'SOL', name: 'Solana', rank: null },
  { id: 'usd-coin', symbol: 'USDC', name: 'USDC', rank: null },
  { id: 'ripple', symbol: 'XRP', name: 'XRP', rank: null },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', rank: null },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano', rank: null },
  { id: 'tron', symbol: 'TRX', name: 'TRON', rank: null },
  { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche', rank: null },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink', rank: null },
  { id: 'polkadot', symbol: 'DOT', name: 'Polkadot', rank: null },
  { id: 'litecoin', symbol: 'LTC', name: 'Litecoin', rank: null },
  { id: 'cosmos', symbol: 'ATOM', name: 'Cosmos Hub', rank: null },
  { id: 'the-open-network', symbol: 'TON', name: 'Toncoin', rank: null },
  {
    id: 'polygon-ecosystem-token',
    symbol: 'POL',
    name: 'POL (ex-MATIC)',
    rank: null,
  },
  { id: 'render-token', symbol: 'RENDER', name: 'Render', rank: null },
]

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Built-in assets whose id, symbol or name contains `query`. */
export function searchBuiltinAssets(query: string): CryptoAsset[] {
  const needle = fold(query.trim())
  if (needle === '') return []
  return BUILTIN_ASSETS.filter((asset) =>
    [asset.id, asset.symbol, asset.name].some((field) =>
      fold(field).includes(needle),
    ),
  )
}
