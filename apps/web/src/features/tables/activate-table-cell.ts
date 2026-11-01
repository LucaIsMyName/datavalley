import type { Column, RowRecord } from '@datavalley/api-client'
import { fillableColumn } from './cell-display'

export function activateTableCell({
  row,
  column,
  readOnly,
  onOpenFormula,
  onBeginEdit,
}: {
  row: RowRecord
  column: Column
  readOnly: boolean
  onOpenFormula: (row: RowRecord, column: Column) => void
  onBeginEdit: (columnId: string) => void
}) {
  if (readOnly) return
  if (column.type === 'formula') {
    onOpenFormula(row, column)
    return
  }
  if (!fillableColumn(column) || column.type === 'checkbox') return
  onBeginEdit(column.id)
}
