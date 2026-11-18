import { cn } from '@finances/ui/lib/utils'
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
  CheckIcon,
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
  SplitIcon,
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
import type { CSSProperties } from 'react'
import { CategoryIcon } from '#/api/types.gen'

/** Every icon a category can take, with its French name (#266). */
export const CATEGORY_ICONS: Record<
  CategoryIcon,
  { icon: LucideIcon; label: string }
> = {
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
}

/** Icon keys in the order the picker shows them. */
export const CATEGORY_ICON_KEYS = Object.values(CategoryIcon)

/** Icon given to a new category until one is chosen. */
export const DEFAULT_CATEGORY_ICON: CategoryIcon = 'tag'

const ICONS_BY_KEY = new Map<string, LucideIcon>(
  Object.entries(CATEGORY_ICONS).map(([key, { icon }]) => [key, icon]),
)

/** The component of a stored icon; a tag when none (or an unknown one). */
export function categoryIconComponent(icon: string | null): LucideIcon {
  const known = icon === null ? undefined : ICONS_BY_KEY.get(icon)
  return known ?? TagIcon
}

type AvatarCategory = { color: string | null; icon: string | null }

interface CategoryAvatarProps {
  /** The category, `'split'` for a transaction split between several, or null. */
  category: AvatarCategory | 'split' | null
  selected?: boolean
  /** Adds the warning dot of a transaction to review. */
  review?: boolean
  className?: string
}

/**
 * Round icon of a category, tinted with its colour (`color-mix`, readable in
 * both themes). A check replaces it when the row is selected.
 */
export function CategoryAvatar({
  category,
  selected = false,
  review = false,
  className,
}: CategoryAvatarProps) {
  const Icon = selected
    ? CheckIcon
    : category === 'split'
      ? SplitIcon
      : category === null
        ? CircleHelpIcon
        : categoryIconComponent(category.icon)
  const color =
    category !== null && category !== 'split' ? category.color : null
  const style: CSSProperties | undefined =
    !selected && color
      ? {
          color,
          backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
        }
      : undefined
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative flex size-7 shrink-0 items-center justify-center rounded-full',
        selected
          ? 'bg-primary text-primary-foreground'
          : !color && 'bg-muted text-muted-foreground',
        className,
      )}
      style={style}
    >
      <Icon className="size-[0.85rem]" />
      {review && !selected && (
        <span className="bg-warning ring-background absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2" />
      )}
    </span>
  )
}
