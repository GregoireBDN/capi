import type { CryptoChain } from '#/database/schema/domain-enums'
import type { EvmChain } from './chain-provider'

export interface ChainAsset {
  /** Price provider (CoinGecko) asset id. */
  id: string
  symbol: string
  name: string
}

/** Label of a chain, used as the location of its synced holdings. */
export const CHAIN_LABELS: Record<CryptoChain, string> = {
  bitcoin: 'Bitcoin',
  ethereum: 'Ethereum',
  arbitrum: 'Arbitrum',
  base: 'Base',
  optimism: 'Optimism',
  polygon: 'Polygon',
  bsc: 'BNB Chain',
}

export const BITCOIN_ASSET: ChainAsset = {
  id: 'bitcoin',
  symbol: 'BTC',
  name: 'Bitcoin',
}
export const BITCOIN_DECIMALS = 8

const ETHER: ChainAsset = { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' }

export interface EvmChainInfo {
  /** EIP-155 chain id, checked against the endpoint's `eth_chainId`. */
  chainId: number
  native: ChainAsset
  /** CoinGecko platform id, where token contracts are listed. */
  platform: string
  /** Key-less public JSON-RPC endpoint used when none is configured. */
  defaultRpcUrl: string
}

/** Native assets are 18-decimal on every supported chain. */
export const EVM_NATIVE_DECIMALS = 18

export const EVM_CHAINS: Record<EvmChain, EvmChainInfo> = {
  ethereum: {
    chainId: 1,
    native: ETHER,
    platform: 'ethereum',
    defaultRpcUrl: 'https://ethereum-rpc.publicnode.com',
  },
  arbitrum: {
    chainId: 42161,
    native: ETHER,
    platform: 'arbitrum-one',
    defaultRpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
  },
  base: {
    chainId: 8453,
    native: ETHER,
    platform: 'base',
    defaultRpcUrl: 'https://base-rpc.publicnode.com',
  },
  optimism: {
    chainId: 10,
    native: ETHER,
    platform: 'optimistic-ethereum',
    defaultRpcUrl: 'https://optimism-rpc.publicnode.com',
  },
  polygon: {
    chainId: 137,
    native: {
      id: 'polygon-ecosystem-token',
      symbol: 'POL',
      name: 'POL (ex-MATIC)',
    },
    platform: 'polygon-pos',
    defaultRpcUrl: 'https://polygon-bor-rpc.publicnode.com',
  },
  bsc: {
    chainId: 56,
    native: { id: 'binancecoin', symbol: 'BNB', name: 'BNB' },
    platform: 'binance-smart-chain',
    defaultRpcUrl: 'https://bsc-rpc.publicnode.com',
  },
}

export const EVM_CHAIN_IDS = Object.keys(EVM_CHAINS) as EvmChain[]

/** Assets that are a native coin of a supported chain (never a token). */
export const NATIVE_ASSET_IDS = new Set([
  BITCOIN_ASSET.id,
  ...EVM_CHAIN_IDS.map((chain) => EVM_CHAINS[chain].native.id),
])

/** The chain of a CoinGecko platform id, if supported. */
export function chainOfPlatform(platform: string): EvmChain | undefined {
  return EVM_CHAIN_IDS.find((chain) => EVM_CHAINS[chain].platform === platform)
}

/**
 * RPC endpoint per chain: the defaults, overridden by `EVM_RPC_URLS` (a JSON
 * object keyed by chain id, e.g. `{"1":"https://my-node/rpc"}`; an empty
 * string turns a chain off). Throws on an unknown chain id or a bad URL.
 */
export function evmRpcUrls(override: string | undefined): Map<EvmChain, URL> {
  const urls = new Map<EvmChain, URL>(
    EVM_CHAIN_IDS.map((chain) => [
      chain,
      new URL(EVM_CHAINS[chain].defaultRpcUrl),
    ]),
  )
  if (!override || override.trim() === '') return urls
  let parsed: unknown
  try {
    parsed = JSON.parse(override)
  } catch {
    throw new Error('EVM_RPC_URLS must be a JSON object keyed by chain id')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('EVM_RPC_URLS must be a JSON object keyed by chain id')
  }
  for (const [id, value] of Object.entries(parsed)) {
    const chain = EVM_CHAIN_IDS.find(
      (candidate) => String(EVM_CHAINS[candidate].chainId) === id,
    )
    if (!chain) throw new Error(`EVM_RPC_URLS: unsupported chain id ${id}`)
    if (value === '') {
      urls.delete(chain)
      continue
    }
    if (typeof value !== 'string' || !/^https?:\/\//.test(value)) {
      throw new Error(`EVM_RPC_URLS: chain ${id} needs an http(s) URL`)
    }
    urls.set(chain, new URL(value))
  }
  return urls
}
