import type { FilterNode } from '@datavalley/shared'
import { badRequest } from '../../errors.js'

export function parseFilterQuery(value: string | undefined): FilterNode | null {
  if (!value) return null
  try {
    return JSON.parse(value) as FilterNode
  } catch {
    throw badRequest('filter must be valid JSON')
  }
}