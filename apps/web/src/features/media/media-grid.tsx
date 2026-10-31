import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import type { MediaFile } from '@datavalley/api-client'
import { FileText } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatMediaBytes, isRasterImageMime, mediaDownloadUrl } from '../../lib/media'

const HEADER = 'bg-card'

export function MediaGrid({
  files,
  activeId,
  onSelect,
}: {
  files: MediaFile[]
  activeId: string | null
  onSelect: (file: MediaFile) => void
}) {
  const { t } = useTranslation()
  const columns = useMemo<ColumnDef<MediaFile>[]>(
    () => [
      {
        id: 'thumb',
        header: '',
        size: 52,
        cell: ({ row }) => {
          const file = row.original
          if (isRasterImageMime(file.mime)) {
            return (
              <img
                src={mediaDownloadUrl(file.id)}
                alt=""
                className="size-9 border border-border object-cover"
              />
            )
          }
          return (
            <span className="inline-flex size-9 items-center justify-center border border-border bg-muted">
              <FileText className="size-4 text-muted-foreground" />
            </span>
          )
        },
      },
      {
        accessorKey: 'name',
        header: t('name'),
        cell: ({ row }) => <span className="block truncate font-medium">{row.original.name}</span>,
      },
      {
        id: 'size',
        header: t('mediaColumnSize'),
        size: 96,
        cell: ({ row }) => <span className="text-muted-foreground">{formatMediaBytes(row.original.size)}</span>,
      },
      {
        id: 'mime',
        header: t('mediaColumnType'),
        size: 120,
        cell: ({ row }) => <span className="truncate text-muted-foreground">{row.original.mime}</span>,
      },
      {
        id: 'createdAt',
        header: t('mediaColumnUploaded'),
        size: 168,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleString()}
          </span>
        ),
      },
    ],
    [t],
  )

  const grid = useReactTable({
    data: files,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const rows = grid.getRowModel().rows

  return (
    <div className="min-h-0 flex-1 overflow-auto border border-border">
      <table className="table-grid w-full table-fixed border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          {grid.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th
                  key={header.id}
                  className={`h-10 px-2 text-left font-medium ${HEADER}`}
                  style={{ width: header.column.getSize() === 0 ? undefined : header.column.getSize() }}
                >
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row) => {
            const file = row.original
            const selected = activeId === file.id
            return (
              <tr
                key={row.id}
                role="button"
                tabIndex={0}
                className={`cursor-pointer ${selected ? 'bg-accent' : 'hover:bg-muted/60'}`}
                onClick={() => onSelect(file)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(file)
                  }
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="h-11 border-t border-border px-2 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
