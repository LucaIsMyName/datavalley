import {
  normalizeTableDisplay,
  sanitizeTableDisplay,
  type DisplayColumn,
  type TableDisplayState,
} from '@datavalley/shared'

export function savedViewDefinition(input: {
  filter: unknown
  sort: unknown
  formatting: unknown
  display: TableDisplayState
}) {
  return {
    filter: input.filter,
    sort: input.sort,
    formatting: input.formatting,
    display: sanitizeTableDisplay(input.display),
  }
}

export function displayFromSavedView(
  definition: { display?: unknown } | Record<string, unknown> | null | undefined,
  columns: DisplayColumn[],
) {
  if (!definition || definition.display == null) return null
  return normalizeTableDisplay(definition.display, columns)
}
