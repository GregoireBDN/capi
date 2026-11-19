import * as React from 'react'
import {
  ArrowLeftRightIcon,
  BabyIcon,
  BaggageClaimIcon,
  BanknoteIcon,
  BeerIcon,
  BikeIcon,
  BookOpenIcon,
  BriefcaseIcon,
  Building2Icon,
  BusIcon,
  CarIcon,
  CircleHelpIcon,
  CoffeeIcon,
  CoinsIcon,
  DropletIcon,
  DumbbellIcon,
  FilmIcon,
  FlameIcon,
  Flower2Icon,
  FuelIcon,
  Gamepad2Icon,
  GiftIcon,
  GraduationCapIcon,
  HammerIcon,
  HandCoinsIcon,
  HandHeartIcon,
  HeartHandshakeIcon,
  HeartPulseIcon,
  HouseIcon,
  KeyRoundIcon,
  LandmarkIcon,
  MusicIcon,
  PartyPopperIcon,
  PawPrintIcon,
  PiggyBankIcon,
  PillIcon,
  PlaneIcon,
  ReceiptIcon,
  RepeatIcon,
  ScissorsIcon,
  ShieldIcon,
  ShirtIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  SmartphoneIcon,
  SofaIcon,
  SparklesIcon,
  StethoscopeIcon,
  TagIcon,
  TicketIcon,
  TrainFrontIcon,
  TrendingUpIcon,
  TvIcon,
  Undo2Icon,
  UsersIcon,
  UtensilsIcon,
  WalletIcon,
  WifiIcon,
  WrenchIcon,
  ZapIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '../lib/utils'

/**
 * Every icon a category can take (#266, #287), keyed by its Lucide name, with
 * its French name for the picker. The API accepts exactly these keys
 * (`apps/api/src/categories/category-icons.ts`, same order): the picker and
 * `CategoryIcon` both read this one module, so lucide is never imported
 * dynamically.
 */
const CATEGORY_ICONS = {
  house: { icon: HouseIcon, label: 'Maison' },
  'key-round': { icon: KeyRoundIcon, label: 'Clé' },
  sofa: { icon: SofaIcon, label: 'Canapé' },
  wrench: { icon: WrenchIcon, label: 'Clé à molette' },
  hammer: { icon: HammerIcon, label: 'Marteau' },
  zap: { icon: ZapIcon, label: 'Éclair' },
  flame: { icon: FlameIcon, label: 'Flamme' },
  droplet: { icon: DropletIcon, label: 'Goutte' },
  wifi: { icon: WifiIcon, label: 'Wi-Fi' },
  smartphone: { icon: SmartphoneIcon, label: 'Téléphone' },
  tv: { icon: TvIcon, label: 'Télévision' },
  'shopping-cart': { icon: ShoppingCartIcon, label: 'Caddie' },
  utensils: { icon: UtensilsIcon, label: 'Couverts' },
  coffee: { icon: CoffeeIcon, label: 'Café' },
  beer: { icon: BeerIcon, label: 'Bière' },
  car: { icon: CarIcon, label: 'Voiture' },
  fuel: { icon: FuelIcon, label: 'Carburant' },
  bus: { icon: BusIcon, label: 'Bus' },
  'train-front': { icon: TrainFrontIcon, label: 'Train' },
  bike: { icon: BikeIcon, label: 'Vélo' },
  plane: { icon: PlaneIcon, label: 'Avion' },
  'baggage-claim': { icon: BaggageClaimIcon, label: 'Bagages' },
  repeat: { icon: RepeatIcon, label: 'Répétition' },
  shield: { icon: ShieldIcon, label: 'Bouclier' },
  'heart-pulse': { icon: HeartPulseIcon, label: 'Santé' },
  pill: { icon: PillIcon, label: 'Médicament' },
  stethoscope: { icon: StethoscopeIcon, label: 'Stéthoscope' },
  'shopping-bag': { icon: ShoppingBagIcon, label: 'Sac' },
  shirt: { icon: ShirtIcon, label: 'Vêtement' },
  scissors: { icon: ScissorsIcon, label: 'Ciseaux' },
  sparkles: { icon: SparklesIcon, label: 'Étincelles' },
  ticket: { icon: TicketIcon, label: 'Billet' },
  film: { icon: FilmIcon, label: 'Cinéma' },
  music: { icon: MusicIcon, label: 'Musique' },
  'gamepad-2': { icon: Gamepad2Icon, label: 'Jeux' },
  dumbbell: { icon: DumbbellIcon, label: 'Sport' },
  'book-open': { icon: BookOpenIcon, label: 'Livre' },
  'graduation-cap': { icon: GraduationCapIcon, label: 'Études' },
  'party-popper': { icon: PartyPopperIcon, label: 'Fête' },
  baby: { icon: BabyIcon, label: 'Bébé' },
  'paw-print': { icon: PawPrintIcon, label: 'Animaux' },
  'flower-2': { icon: Flower2Icon, label: 'Fleur' },
  gift: { icon: GiftIcon, label: 'Cadeau' },
  users: { icon: UsersIcon, label: 'Personnes' },
  'heart-handshake': { icon: HeartHandshakeIcon, label: 'Entraide' },
  landmark: { icon: LandmarkIcon, label: 'Banque' },
  banknote: { icon: BanknoteIcon, label: 'Billet de banque' },
  receipt: { icon: ReceiptIcon, label: 'Reçu' },
  wallet: { icon: WalletIcon, label: 'Portefeuille' },
  tag: { icon: TagIcon, label: 'Étiquette' },
  briefcase: { icon: BriefcaseIcon, label: 'Travail' },
  'building-2': { icon: Building2Icon, label: 'Immeuble' },
  'hand-heart': { icon: HandHeartIcon, label: 'Main et cœur' },
  'hand-coins': { icon: HandCoinsIcon, label: 'Aide' },
  'undo-2': { icon: Undo2Icon, label: 'Retour' },
  coins: { icon: CoinsIcon, label: 'Pièces' },
  'arrow-left-right': { icon: ArrowLeftRightIcon, label: 'Virement' },
  'piggy-bank': { icon: PiggyBankIcon, label: 'Tirelire' },
  'trending-up': { icon: TrendingUpIcon, label: 'Placement' },
  'circle-help': { icon: CircleHelpIcon, label: 'Point d’interrogation' },
} as const satisfies Record<string, { icon: LucideIcon; label: string }>

/** Lucide name of a category icon (the API's `CategoryIcon` enum). */
type CategoryIconName = keyof typeof CATEGORY_ICONS

/** Icon names in the picker's order (grouped by theme). */
const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS) as CategoryIconName[]

function isCategoryIconName(name: string): name is CategoryIconName {
  return Object.hasOwn(CATEGORY_ICONS, name)
}

/**
 * The component of a stored icon name; `fallback` (a tag by default) when
 * there is none or the name is unknown.
 */
function categoryIconComponent(
  name: string | null | undefined,
  fallback: LucideIcon = TagIcon,
): LucideIcon {
  return name && isCategoryIconName(name) ? CATEGORY_ICONS[name].icon : fallback
}

type CategoryIconProps = {
  /** Stored icon name; null or unknown → `fallback`. */
  icon?: string | null
  /**
   * Category colour, any CSS colour (`#d97706`, `var(--chart-other)`). Null
   * (unknown or deleted category) → a neutral tile.
   */
  color?: string | null
  /**
   * `sm` for legends and chips (about a line of small text high), `md` for
   * list rows (default).
   */
  size?: 'sm' | 'md'
  /** Glyph drawn without an icon (default: a tag). */
  fallback?: LucideIcon
  /**
   * Accessible name. Leave it out when the category name is written beside
   * the icon (the usual case): the icon is then hidden from screen readers.
   */
  label?: string
  className?: string
}

const SIZES = {
  sm: { tile: 'size-[1.15rem] rounded-[0.3rem]', glyph: 'size-[0.7rem]' },
  md: { tile: 'size-7 rounded-lg', glyph: 'size-[0.85rem]' },
} as const

/**
 * CategoryIcon
 * A category's icon in a rounded tile tinted with its colour: the glyph in
 * the colour (nudged towards the text colour, so it stays readable in light
 * and dark), the tile at ~14 % of it. Use it wherever a category is named.
 *
 * @example
 * <CategoryIcon icon={category.icon} color={category.color} />
 * <CategoryIcon icon={null} color={null} fallback={CircleHelpIcon} size="sm" />
 */
function CategoryIcon({
  icon,
  color,
  size = 'md',
  fallback,
  label,
  className,
}: CategoryIconProps) {
  const Glyph = categoryIconComponent(icon, fallback)
  const style: React.CSSProperties | undefined = color
    ? {
        color: `color-mix(in oklab, ${color} 82%, var(--foreground))`,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
      }
    : undefined
  return (
    <span
      data-slot="category-icon"
      data-size={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        SIZES[size].tile,
        !color && 'bg-muted text-muted-foreground',
        className,
      )}
      style={style}
    >
      <Glyph aria-hidden className={SIZES[size].glyph} />
    </span>
  )
}

export {
  CATEGORY_ICON_NAMES,
  CATEGORY_ICONS,
  CategoryIcon,
  categoryIconComponent,
  isCategoryIconName,
  type CategoryIconName,
  type CategoryIconProps,
}
