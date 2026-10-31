import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Binary,
  Circle,
  CircleDot,
  Coins,
  Copy,
  Divide,
  DollarSign,
  Euro,
  EyeOff,
  Filter,
  Fingerprint,
  Hash,
  JapaneseYen,
  ListOrdered,
  Minus,
  Palette,
  Pencil,
  Percent,
  PoundSterling,
  Sigma,
  SwissFranc,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import type { MenuEntry } from '../../components/context-menu'
import { COLUMN_ICONS, defaultIcon } from './icons'

export const COLUMN_TYPES = [
  'text',
  'long_text',
  'mail',
  'url',
  'number',
  'date',
  'datetime',
  'checkbox',
  'select',
  'tags',
  'status',
  'user',
  'row_id',
  'formula',
  'relation',
] as const

const NUMBER_VARIANTS = ['float', 'integer', 'money'] as const
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY'] as const
const ROW_STYLES = ['sequence', 'uuid'] as const

const VARIANT_ICONS: Record<(typeof NUMBER_VARIANTS)[number], LucideIcon> = {
  float: Hash,
  integer: Binary,
  money: Coins,
}

const CURRENCY_ICONS: Record<(typeof CURRENCIES)[number], LucideIcon> = {
  USD: DollarSign,
  EUR: Euro,
  GBP: PoundSterling,
  CHF: SwissFranc,
  JPY: JapaneseYen,
}

const STYLE_ICONS: Record<(typeof ROW_STYLES)[number], LucideIcon> = {
  sequence: ListOrdered,
  uuid: Fingerprint,
}

const FOOTER_ICONS: Record<string, LucideIcon> = {
  count: Hash,
  sum: Sigma,
  avg: Divide,
  median: Minus,
  min: ArrowDown,
  max: ArrowUp,
  unique: Fingerprint,
  empty: Circle,
  filled: CircleDot,
  percent_empty: Percent,
  percent_filled: Percent,
}

function footerChoices(type: string) {
  if (type === 'number' || type === 'currency')
    return ['count', 'sum', 'avg', 'median', 'min', 'max', 'empty', 'filled']
  return ['count', 'unique', 'empty', 'filled', 'percent_empty', 'percent_filled']
}

function action(
  onSelect: (id: string) => void,
  item: { id: string; label: string; icon: LucideIcon; disabled?: boolean; danger?: boolean },
): MenuEntry {
  return { ...item, onSelect: () => onSelect(item.id) }
}

export function buildColumnHeaderMenu(input: {
  column: { type: string; config: Record<string, unknown> }
  checkedCount: number
  label: (key: string) => string
  onSelect: (id: string) => void
}): MenuEntry[] {
  const { column, label, onSelect } = input
  const entries: MenuEntry[] = [{ kind: 'heading', id: 'datatypes', label: label('menuDatatypes') }]

  for (const type of COLUMN_TYPES) {
    entries.push(
      action(onSelect, {
        id: `type-${type}`,
        label: label(`type_${type}`),
        icon: COLUMN_ICONS[defaultIcon(type)] ?? Hash,
        disabled: type === column.type,
      }),
    )
  }

  if (column.type === 'number') {
    for (const variant of NUMBER_VARIANTS) {
      entries.push(
        action(onSelect, {
          id: `variant-${variant}`,
          label: label(variant),
          icon: VARIANT_ICONS[variant],
          disabled: String(column.config.variant ?? 'float') === variant,
        }),
      )
    }
  }

  if (column.type === 'currency' || column.config.variant === 'money') {
    for (const currency of CURRENCIES) {
      entries.push(
        action(onSelect, {
          id: `currency-${currency}`,
          label: currency,
          icon: CURRENCY_ICONS[currency],
          disabled: String(column.config.currency ?? 'USD') === currency,
        }),
      )
    }
  }

  if (column.type === 'row_id') {
    for (const style of ROW_STYLES) {
      entries.push(
        action(onSelect, {
          id: `style-${style}`,
          label: label(style),
          icon: STYLE_ICONS[style],
          disabled: String(column.config.style ?? 'sequence') === style,
        }),
      )
    }
  }

  entries.push(
    { kind: 'heading', id: 'actions', label: label('menuActions') },
    action(onSelect, { id: 'rename', label: label('rename'), icon: Pencil }),
    action(onSelect, { id: 'hide', label: label('hideColumn'), icon: EyeOff }),
    action(onSelect, { id: 'sort', label: label('sort'), icon: ArrowUpDown }),
    action(onSelect, { id: 'filter', label: label('filter'), icon: Filter }),
    action(onSelect, { id: 'left', label: label('insertLeft'), icon: ArrowLeft }),
    action(onSelect, { id: 'right', label: label('insertRight'), icon: ArrowRight }),
    action(onSelect, { id: 'duplicate', label: label('duplicate'), icon: Copy }),
    action(onSelect, {
      id: 'fill',
      label: label('fillDown'),
      icon: ArrowDownToLine,
      disabled: input.checkedCount < 2,
    }),
    action(onSelect, { id: 'delete', label: label('delete'), icon: Trash2, danger: true }),
    { kind: 'heading', id: 'footer', label: label('footer') },
  )

  for (const calc of footerChoices(column.type)) {
    entries.push(
      action(onSelect, {
        id: `footer-${calc}`,
        label: label(calc),
        icon: FOOTER_ICONS[calc] ?? Hash,
      }),
    )
  }

  entries.push(
    { kind: 'heading', id: 'conditions', label: label('menuConditions') },
    action(onSelect, { id: 'conditional', label: label('conditionalColor'), icon: Palette }),
  )

  return entries
}
