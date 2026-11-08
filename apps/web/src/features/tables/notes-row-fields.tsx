import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CatalogItem, Column, MediaFile, RowRecord } from '@datavalley/api-client'
import { isDateColumnType } from '@datavalley/shared'
import { useState } from 'react'
import { api } from '../../lib/api'
import { activateTableCell } from './activate-table-cell'
import { readCachedRow } from './cache'
import { ColumnTitle } from './column-title'
import { DuplicateHint } from './duplicate-hint'
import { TableCellInput } from './table-cell-input'
import type { useRowCellEdit } from './use-row-cell-edit'

type CellEdit = Pick<
  ReturnType<typeof useRowCellEdit>,
  'scheduleCell' | 'applyMediaCell' | 'invalidFor' | 'clearInvalid'
>

export function NotesRowFields({
  tableId,
  row,
  columns,
  tags,
  statuses,
  members,
  readOnly,
  cellEdit,
  onMediaLibrary,
  onMediaPreview,
  onMediaRequestUpload,
  mediaUploadingKey,
  onDateMode,
  onCreated,
  onOptionChange,
  onOpenFormula,
  tables = [],
}: {
  tableId: string
  row: RowRecord
  columns: Column[]
  tags: CatalogItem[]
  statuses: CatalogItem[]
  members: { userId: string; username: string }[]
  readOnly: boolean
  cellEdit: CellEdit
  onMediaLibrary: (rowId: string, columnId: string, existingIds: string[]) => void
  onMediaPreview: (file: MediaFile, rowId: string, columnId: string) => void
  onMediaRequestUpload: (rowId: string, columnId: string) => void
  mediaUploadingKey: string | null
  onDateMode: (column: Column, patch: { range?: boolean; includeTime?: boolean }) => void
  onCreated: (kind: 'tag' | 'status', item: CatalogItem) => void
  onOptionChange: (
    columnId: string,
    option: { id: string; label: string; color: string | null; position: string },
    deleted?: boolean,
  ) => void
  onOpenFormula: (rowId: string, columnId: string, columnName: string) => void
  tables?: { id: string; icon: string }[]
}) {
  const queryClient = useQueryClient()
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null)
  const liveRow = readCachedRow(queryClient, tableId, row.id) ?? row

  const editingColumn = columns.find((column) => column.id === editingColumnId)
  const targetTableId =
    editingColumn?.type === 'relation' ? String(editingColumn.config.toTableId ?? '') : ''
  const targetRows = useQuery({
    queryKey: ['rows', targetTableId, 'link'],
    enabled: Boolean(targetTableId),
    queryFn: () => api.request<{ rows: RowRecord[] }>(`/tables/${targetTableId}/rows?limit=50`),
  })

  return (
    <div className="shrink-0 border border-border">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {columns.map((column) => {
            const active = editingColumnId === column.id
            const invalid = cellEdit.invalidFor(row.id, column.id)
            const dateEditing = active && isDateColumnType(column.type)
            function activateColumn() {
              activateTableCell({
                row: liveRow,
                column,
                readOnly,
                onOpenFormula: (targetRow, targetColumn) =>
                  onOpenFormula(targetRow.id, targetColumn.id, targetColumn.name),
                onBeginEdit: (columnId) => setEditingColumnId(columnId),
              })
            }

            return (
              <tr key={column.id} className="border-b border-border last:border-b-0">
                <th className="h-11 w-[38%] border-r border-border px-2 text-left align-middle font-medium text-muted-foreground">
                  <ColumnTitle
                    name={column.name}
                    type={column.type}
                    className="w-full truncate text-left font-medium text-muted-foreground"
                  />
                </th>
                <td
                  className={`relative px-2 align-middle ${
                    column.type === 'media' ? 'overflow-x-auto overflow-y-hidden' : dateEditing ? 'overflow-visible' : 'overflow-hidden'
                  } ${
                    column.type === 'number' || column.type === 'currency' || column.type === 'formula' || column.type === 'lookup'
                      ? 'font-mono'
                      : ''
                  }`}
                >
                  <div className="flex min-h-9 min-w-0 items-center">
                    <TableCellInput
                      column={column}
                      row={liveRow}
                      active={active}
                      tableId={tableId}
                      tags={tags}
                      statuses={statuses}
                      members={members}
                      relationRows={targetRows.data?.rows ?? []}
                      relationIcon={
                        column.type === 'relation'
                          ? tables.find((item) => item.id === String(column.config.toTableId ?? ''))?.icon
                          : undefined
                      }
                      readOnly={readOnly}
                      invalid={invalid}
                      onScheduleCell={cellEdit.scheduleCell}
                      onClearInvalid={(rowId, columnId) => cellEdit.clearInvalid(`cell:${rowId}:${columnId}`)}
                      onDeactivate={(key) => {
                        setEditingColumnId((current) =>
                          current && key === `${row.id}:${current}` ? null : current,
                        )
                      }}
                      onActivate={activateColumn}
                      onOpen={activateColumn}
                      onCreated={onCreated}
                      onOptionChange={onOptionChange}
                      onMediaLibrary={(existingIds) => onMediaLibrary(row.id, column.id, existingIds)}
                      onMediaPreview={(file) => onMediaPreview(file, row.id, column.id)}
                      onMediaRequestUpload={() => onMediaRequestUpload(row.id, column.id)}
                      onMediaUploading={mediaUploadingKey === `${row.id}:${column.id}`}
                      onMediaCommit={(value) => cellEdit.applyMediaCell(liveRow, column, value)}
                      onDateMode={(patch) => onDateMode(column, patch)}
                      mediaIdleActions={!readOnly}
                    />
                  </div>
                  <DuplicateHint tableId={tableId} column={column} rowId={row.id} value={liveRow.cells[column.id]} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
