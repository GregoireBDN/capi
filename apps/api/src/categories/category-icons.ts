/**
 * Icons a category can show (#266), as Lucide icon names: the web maps each
 * one to its component (`components/categories/category-icons.tsx`), and the
 * API only accepts these keys. Grouped by theme for the editor's picker.
 */
export const CATEGORY_ICONS = [
  // Home and bills
  'house',
  'key-round',
  'sofa',
  'wrench',
  'hammer',
  'zap',
  'flame',
  'droplet',
  'wifi',
  'smartphone',
  'tv',
  // Food
  'shopping-cart',
  'utensils',
  'coffee',
  'beer',
  // Getting around
  'car',
  'fuel',
  'bus',
  'train-front',
  'bike',
  'plane',
  'baggage-claim',
  // Health and cover
  'repeat',
  'shield',
  'heart-pulse',
  'pill',
  'stethoscope',
  // Shopping and leisure
  'shopping-bag',
  'shirt',
  'scissors',
  'sparkles',
  'ticket',
  'film',
  'music',
  'gamepad-2',
  'dumbbell',
  'book-open',
  'graduation-cap',
  'party-popper',
  // People
  'baby',
  'paw-print',
  'flower-2',
  'gift',
  'users',
  'heart-handshake',
  // Money
  'landmark',
  'banknote',
  'receipt',
  'wallet',
  'tag',
  'briefcase',
  'building-2',
  'hand-heart',
  'hand-coins',
  'undo-2',
  'coins',
  'arrow-left-right',
  'piggy-bank',
  'trending-up',
  'circle-help',
] as const

export type CategoryIcon = (typeof CATEGORY_ICONS)[number]

export const CATEGORY_ICON_DOC = {
  enum: CATEGORY_ICONS,
  enumName: 'CategoryIcon',
  nullable: true,
  description: 'Icon shown with the category (a Lucide icon name).',
} as const
