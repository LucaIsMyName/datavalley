import {
  AlignLeft,
  ArrowRightLeft,
  Calendar,
  CalendarClock,
  CheckSquare,
  CircleDot,
  Coins,
  Fingerprint,
  FunctionSquare,
  Hash,
  Link,
  List,
  Mail,
  Paperclip,
  Tags,
  Type,
  Users,
  FileText,
  FileAudio,
  FileVideo,
  FileImage,
  Play,
  Pause,
  Rewind,
  FastForward,
  SkipBack,
  SkipForward,
  Volume,
  Volume2,
  type LucideIcon,
} from 'lucide-react'

export const COLUMN_ICONS: Record<string, LucideIcon> = {
  Type,
  AlignLeft,
  Hash,
  Coins,
  Mail,
  Link,
  Calendar,
  CalendarClock,
  CheckSquare,
  List,
  Tags,
  Users,
  CircleDot,
  Fingerprint,
  FunctionSquare,
  ArrowRightLeft,
  Paperclip,
  FileText,
  FileAudio,
  FileVideo,
  FileImage,
  Play,
  Pause,
  Rewind,
  FastForward,
  SkipBack,
  SkipForward,
  Volume,
  Volume2,
}

export function defaultIcon(type: string, config?: Record<string, unknown>) {
  if (type === 'long_text') return 'AlignLeft'
  if (type === 'number') return 'Hash'
  if (type === 'currency') return 'Coins'
  if (type === 'mail') return 'Mail'
  if (type === 'url') return 'Link'
  if (type === 'datetime' || (type === 'date' && config?.includeTime)) return 'CalendarClock'
  if (type === 'date') return 'Calendar'
  if (type === 'checkbox') return 'CheckSquare'
  if (type === 'select' || type === 'status') return 'CircleDot'
  if (type === 'tags' || type === 'multi_select') return 'Tags'
  if (type === 'user') return 'Users'
  if (type === 'row_id') return 'Fingerprint'
  if (type === 'formula' || type === 'lookup') return 'FunctionSquare'
  if (type === 'relation') return 'ArrowRightLeft'
  if (type === 'media') return 'Paperclip'
  return 'Type'
}

export function ColumnIcon({ name, className = 'size-3.5' }: { name: string; className?: string }) {
  const Icon = COLUMN_ICONS[name] ?? Type
  return <Icon className={className} />
}
