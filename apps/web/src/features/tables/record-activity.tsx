import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export type RecordActivityItem = {
  at: string
  kind: 'notes' | 'record'
  text: string
  tableId: string
  tableName: string
  rowId: string
  title: string
}

export function visibleActivity(items: RecordActivityItem[], notes: string, rowId: string) {
  const next = items.map((item) =>
    item.kind === 'notes' && item.rowId === rowId ? { ...item, text: notes } : item,
  )
  const visible = next.filter((item) => item.kind !== 'notes' || item.text.trim())
  if (notes.trim() && !visible.some((item) => item.kind === 'notes' && item.rowId === rowId)) {
    visible.unshift({
      at: new Date().toISOString(),
      kind: 'notes',
      text: notes,
      tableId: '',
      tableName: '',
      rowId,
      title: '',
    })
  }
  return visible
}

export function RecordActivityList({
  projectId,
  items,
}: {
  projectId: string
  items: RecordActivityItem[]
}) {
  const { t } = useTranslation()
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t('activityEmpty')}</p>
  return (
    <ol className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={`${item.kind}:${item.rowId}:${item.at}`} className="border border-border px-3 py-2 text-sm">
          <time className="text-muted-foreground" dateTime={item.at}>
            {formatWhen(item.at)}
          </time>
          {item.kind === 'notes' ? (
            <div>
              <p className="font-medium">{t('notes')}</p>
              <p className="whitespace-pre-wrap">{item.text}</p>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col">
              <Link
                to={`/projects/${projectId}/tables/${item.tableId}/rows/${item.rowId}`}
                className="truncate font-medium"
              >
                {item.tableName}: {item.title}
              </Link>
              {item.text.trim() ? <p className="whitespace-pre-wrap text-muted-foreground">{item.text}</p> : null}
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}
