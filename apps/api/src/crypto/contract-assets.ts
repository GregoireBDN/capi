/**
 * Tokens added by their contract address (#269) have no price provider id:
 * their holdings use `erc20.<chain id>.<lower-case contract>` as asset id.
 * Such ids are never sent to the price API (they would name the contract),
 * and a line without a price does not hold the account's valuation back.
 */
const PREFIX = 'erc20.'

export function contractAssetId(chainId: number, contract: string): string {
  return `${PREFIX}${chainId}.${contract.toLowerCase()}`
}

export function isContractAssetId(assetId: string): boolean {
  return assetId.startsWith(PREFIX)
}
