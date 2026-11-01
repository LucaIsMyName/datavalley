import type { Column } from '@datavalley/api-client'
import { formatDateCellValue, isDateColumnType } from '@datavalley/shared'
import { formatFormulaValue } from './formula-help'

export function cellWritable(column: Column) {
  return column.type !== 'formula' && column.type !== 'lookup'
}

export function fillableColumn(column: Column) {
  return column.type !== 'lookup' && column.type !== 'row_id'
}

export function displayCellValue(column: Column, value: unknown, language: string) {
  if (isDateColumnType(column.type)) {
    return formatDateCellValue(value, column, language)
  }
  return formatFormulaValue(value)
}
