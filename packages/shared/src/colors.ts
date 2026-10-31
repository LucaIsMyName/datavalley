export const SWATCH_NAMES = ['amber', 'green', 'blue', 'red', 'violet', 'orange', 'pink', 'teal', 'slate', 'yellow'] as const

export type SwatchName = (typeof SWATCH_NAMES)[number]
export type SwatchRole = 'background' | 'text'

const HEX_TO_NAME: Record<string, SwatchName> = {
  '#fde68a': 'amber',
  '#bbf7d0': 'green',
  '#bfdbfe': 'blue',
  '#fecaca': 'red',
  '#e9d5ff': 'violet',
  '#fed7aa': 'orange',
  '#e5e7eb': 'slate',
}

const names = new Set<string>(SWATCH_NAMES)

export function swatchName(value: string | null | undefined): SwatchName | null {
  if (!value) return null
  const lower = value.toLowerCase()
  if (names.has(lower)) return lower as SwatchName
  return HEX_TO_NAME[lower] ?? null
}

export function paintSwatch(value: string | null | undefined, role: SwatchRole): string | undefined {
  if (!value) return undefined
  const name = swatchName(value)
  if (!name) return value
  return `var(--swatch-${name}-${role === 'text' ? 'fg' : 'bg'})`
}
