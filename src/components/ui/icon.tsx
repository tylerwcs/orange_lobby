import {
  Armchair, Bell, Calendar, Check, ChevronDown, Clock, Ticket, Download, Filter, Flag,
  Grid3x3, GripVertical, Home, Info, Layers, LogOut, Megaphone, MessageSquare, Mic,
  Phone, Plus, QrCode, Scan, Search, Settings, Star, User, Users, X,
  File as FileIcon, Link as LinkIcon, Map as MapIcon,
  type LucideIcon,
} from "lucide-react";

/*
  D60, revised 2026-09-12. The original plan was to delete this file and import lucide components
  directly everywhere. That does not work for every call site: `events.modules` is a jsonb column
  (migration 0002) whose rows carry an icon *name* validated by `z.enum(MODULE_ICONS)`, so ten call
  sites only learn which icon to draw at runtime. A name -> component registry is structurally
  required for those. Static call sites import from lucide-react directly instead.

  The 31 names are the vocabulary the database already uses. Renaming one is a data migration.
*/
export const ICONS = {
  calendar: Calendar,
  seat: Armchair,
  map: MapIcon,
  info: Info,
  megaphone: Megaphone,
  mic: Mic,
  file: FileIcon,
  chat: MessageSquare,
  check: Check,
  phone: Phone,
  link: LinkIcon,
  home: Home,
  grid: Grid3x3,
  user: User,
  qr: QrCode,
  chevron: ChevronDown,
  search: Search,
  star: Star,
  logout: LogOut,
  scan: Scan,
  users: Users,
  download: Download,
  settings: Settings,
  layers: Layers,
  flag: Flag,
  bell: Bell,
  plus: Plus,
  filter: Filter,
  grip: GripVertical,
  close: X,
  clock: Clock,
  ticket: Ticket,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export function isIconName(value: string): value is IconName {
  return value in ICONS;
}

/** Draws an icon chosen at runtime. For a name known at author time, import the lucide component. */
export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  const Glyph = ICONS[name];
  return <Glyph size={size} className={className} aria-hidden="true" />;
}
