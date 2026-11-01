import type { CatalogItem, Column, MediaFile, RowRecord } from '@datavalley/api-client'
import { useTranslation } from 'react-i18next'
import { SelectField } from '../../components/ui/select'
import { CellEditor } from './cells'
import { displayCellValue } from './cell-display'
import { editFailureMessage } from './edit-error'
import { formatFormulaValue } from './formula-help'
import { sync } from '../../lib/sync'
import { toast } from 'sonner'

function showEditError(message: string) {
  toast.error(message, { id: 'table-edit-error' })
}

function showCell(value: unknown) {
  return formatFormulaValue(value)
}

export function TableCellInput({
  column,
  row,
  active,
  tableId,
  tags,
  statuses,
  members,
  relationRows,
  readOnly,
  invalid,
  onScheduleCell,
  onClearInvalid,
  onDeactivate,
  onActivate,
  onOpen,
  onCreated,
  onOptionChange,
  onMediaLibrary,
  onMediaPreview,
  onMediaRequestUpload,
  onMediaUploading,
  onMediaCommit,
  onDateMode,
}: {
  column: Column
  row: RowRecord
  active: boolean
  tableId: string
  tags: CatalogItem[]
  statuses: CatalogItem[]
  members: { userId: string; username: string }[]
  relationRows: RowRecord[]
  readOnly: boolean
  invalid?: { text: string; message: string }
  onScheduleCell: (row: RowRecord, column: Column, value: unknown, delay?: number) => void
  onClearInvalid: (rowId: string, columnId: string) => void
  onDeactivate: () => void
  onActivate: () => void
  onOpen?: () => void
  onCreated: (kind: 'tag' | 'status', item: CatalogItem) => void
  onOptionChange: (
    columnId: string,
    option: { id: string; label: string; color: string | null; position: string },
    deleted?: boolean,
  ) => void
  onMediaLibrary?: (existingIds: string[]) => void
  onMediaPreview?: (file: MediaFile) => void
  onMediaRequestUpload?: () => void
  onMediaUploading?: boolean
  onMediaCommit?: (value: { fileIds: string[] } | null) => Promise<void>
  onDateMode?: (patch: { range?: boolean; includeTime?: boolean }) => void
}) {
  const { t, i18n } = useTranslation()
  const value = row.cells[column.id]
  const text = invalid?.text ?? displayCellValue(column, value, i18n.language)
  const writable = !readOnly && column.type !== 'formula' && column.type !== 'lookup'
  const cellKey = `cell:${row.id}:${column.id}`

  if (active && column.type === 'relation') {
    return (
      <SelectField
        label={t('editColumn', { name: column.name })}
        className="h-9 border-0 bg-transparent px-0"
        value={typeof value === 'string' ? value : ''}
        onValueChange={(next) => {
          onScheduleCell(row, column, next, 0)
          void sync.flush(cellKey)
          onDeactivate()
        }}
        options={[
          { value: '', label: t('none') },
          ...relationRows.map((target) => ({
            value: target.id,
            label: showCell(
              Object.values(target.cells).find((item) => typeof item === 'string' && item) ??
                target.id.slice(0, 8),
            ),
          })),
        ]}
      />
    )
  }

  return (
    <CellEditor
      column={column}
      row={row}
      active={active && writable}
      text={text}
      tableId={tableId}
      tags={tags}
      statuses={statuses}
      members={members}
      hint={invalid?.message}
      onEdit={(value, delay) => onScheduleCell(row, column, value, delay)}
      onFlush={() => {
        void sync
          .flush(cellKey)
          .catch((error: unknown) => {
            const message = editFailureMessage(error, t('error'), { cell: true })
            if (message) showEditError(message)
          })
          .finally(() => onDeactivate())
      }}
      onCancel={() => {
        sync.cancel(cellKey)
        onClearInvalid(row.id, column.id)
        onDeactivate()
      }}
      onOpen={onOpen ?? onActivate}
      onActivate={onActivate}
      onSelectEditorClose={() => {
        void sync
          .flush(cellKey)
          .catch((error: unknown) => {
            const message = editFailureMessage(error, t('error'), { cell: true })
            if (message) showEditError(message)
          })
          .finally(() => onDeactivate())
      }}
      onCreated={onCreated}
      onOptionChange={onOptionChange}
      onMediaLibrary={onMediaLibrary}
      onMediaPreview={onMediaPreview}
      onMediaRequestUpload={onMediaRequestUpload}
      onMediaUploading={onMediaUploading}
      onMediaCommit={onMediaCommit}
      onDateMode={onDateMode}
    />
  )
}
