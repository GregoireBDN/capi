/*
 * The colour each common coin is known by, for its badge and its part of a
 * split (owner, 19/11: « les petits icônes avec marqué BTC, ETH avec les
 * couleurs »). Keyed by ticker, as shown; others get the chart palette.
 */
const ASSET_COLORS: Record<string, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  USDT: '#26A17B',
  BNB: '#F3BA2F',
  SOL: '#9945FF',
  USDC: '#2775CA',
  XRP: '#23292F',
  DOGE: '#C2A633',
  ADA: '#0033AD',
  TRX: '#EB0029',
  AVAX: '#E84142',
  LINK: '#2A5ADA',
  DOT: '#E6007A',
  LTC: '#345D9D',
  ATOM: '#2E3148',
  TON: '#0098EA',
  POL: '#8247E5',
  MATIC: '#8247E5',
  RENDER: '#CF1011',
  BCH: '#8DC351',
  ETC: '#328332',
  ARB: '#28A0F0',
  OP: '#FF0420',
  SHIB: '#FFA409',
  UNI: '#FF007A',
  DAI: '#F5AC37',
}

/** The coin's own colour (`#rrggbb`), undefined when it has none here. */
export function assetColor(symbol: string): string | undefined {
  return ASSET_COLORS[symbol.trim().toUpperCase()]
}

/** Relative luminance (WCAG) of a `#rrggbb` colour, 0 to 1. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/**
 * Above this luminance a disc is light (BTC orange, BNB and DOGE yellows,
 * DAI, SHIB, BCH): the ticker goes near black there. Below, white, as on the
 * coins' own logos (ETH, USDT, SOL…), though a little less contrasted.
 */
const LIGHT_DISC = 0.38

/** The ticker's colour on a disc of `hex`. */
export function textOn(hex: string): string {
  return luminance(hex) > LIGHT_DISC ? '#111111' : '#ffffff'
}

export function isHexColor(color: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(color)
}
