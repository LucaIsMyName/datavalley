import { useQuery } from '@tanstack/react-query'
import { duplicateKey, duplicateKind } from '@datavalley/shared'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Badge } from '../../components/ui/badge'
import { api } from '../../lib/api'

export function DuplicateHint({
  tableId,
  column,
  rowId,
  value,
  className,
}: {
  tableId: string
  column: { id: string; type: string; name: string }
  rowId: string
  value: unknown
  className?: string
}) {
  const { t } = useTranslation()
  const kind = duplicateKind(column)
  const key = kind && typeof value === 'string' ? duplicateKey(kind, value) : null
  const matches = useQuery({
    queryKey: ['duplicates', tableId, column.id, key, rowId],
    enabled: Boolean(key),
    queryFn: () =>
      api.request<{ rows: { rowId: string; title: string; href: string }[] }>(
        `/tables/${tableId}/duplicates?columnId=${encodeURIComponent(column.id)}&value=${encodeURIComponent(String(value))}&excludeRowId=${encodeURIComponent(rowId)}`,
      ),
  })
  const rows = matches.data?.rows ?? []
  if (!key || rows.length === 0) return null
  return (
    <p className={className ?? 'px-0 py-1 text-xs text-muted-foreground'}>
      {t('duplicateMatches')}{' '}
      {rows.map((row, index) => (
        <span key={row.rowId}>
          {index > 0 ? ', ' : ''}
          <Link to={row.href}>
            <Badge className="text-primary text-[10px]">{row.title}</Badge>
          </Link>
        </span>
      ))}
    </p>
  )
}
