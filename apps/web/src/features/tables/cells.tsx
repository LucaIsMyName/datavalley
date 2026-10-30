import { useState } from 'react'
import type { CatalogItem, Column, RowRecord } from '@datavalley/api-client'
import { CircleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../../components/ui/badge'
import { api } from '../../lib/api'

const money: Record<string, string> = { USD: 'USD', EUR: 'EUR', GBP: 'GBP', CHF: 'CHF', JPY: 'JPY' }
const palette = ['amber', 'green', 'blue', 'red', 'violet', 'orange', 'pink', 'teal', 'slate', 'yellow']

export function formatCell(column: Column, value: unknown) {
  if (value == null || value === '') return ''
  if (column.type === 'number' || column.type === 'currency') {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return String(value)
    const variant = column.type === 'currency' ? 'money' : String(column.config.variant ?? 'float')
    if (variant === 'integer') return String(Math.trunc(numeric))
    if (variant === 'money') {
      const currency = money[String(column.config.currency ?? 'USD')] ?? 'USD'
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(numeric)
    }
    return String(numeric)
  }
  if (column.type === 'datetime' && typeof value === 'string' && value.includes('T')) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
  }
  return String(value)
}

function names(ids: unknown, catalog: CatalogItem[]) {
  const list = Array.isArray(ids) ? ids.map(String) : []
  return list.map((id) => catalog.find((item) => item.id === id) ?? { id, name: id, color: 'slate', tableId: '' })
}

export function CellEditor({
  column,
  row,
  active,
  text,
  tableId,
  tags,
  statuses,
  members,
  onEdit,
  onFlush,
  onCancel,
  onOpen,
  onCreated,
  hint,
}: {
  column: Column
  row: RowRecord
  active: boolean
  text: string
  tableId: string
  tags: CatalogItem[]
  statuses: CatalogItem[]
  members: { userId: string; username: string }[]
  onEdit: (value: string | string[], delay?: number) => void
  onFlush: () => void
  onCancel: () => void
  onOpen: () => void
  onCreated: (kind: 'tag' | 'status', item: CatalogItem) => void
  hint?: string | null
}) {
  if (column.type === 'row_id') {
    const shown = column.config.style === 'uuid' ? row.id : String(row.rowNumber || '')
    return <span className="block h-full truncate leading-9 text-muted-foreground">{shown}</span>
  }
  if (!active) {
    if (column.type === 'tags' || column.type === 'status') {
      const catalog = column.type === 'tags' ? tags : statuses
      const items = column.type === 'tags' ? names(row.cells[column.id], catalog) : names(row.cells[column.id] ? [row.cells[column.id]] : [], catalog)
      return (
        <button type="button" className="flex h-full w-full items-center gap-1 overflow-hidden text-left" aria-label={`Edit ${column.name}`} onClick={onOpen}>
          {items.map((item) => <Badge key={item.id} color={item.color}>{item.name}</Badge>)}
        </button>
      )
    }
    if (column.type === 'user') {
      const items = names(row.cells[column.id], members.map((member) => ({ id: member.userId, name: member.username, color: 'blue', tableId: '' })))
      return (
        <button type="button" className="flex h-full w-full items-center gap-1 overflow-hidden text-left" aria-label={`Edit ${column.name}`} onClick={onOpen}>
          {items.map((item) => <Badge key={item.id} color="blue">{item.name}</Badge>)}
        </button>
      )
    }
    const shown = hint ? text : column.type === 'number' || column.type === 'currency' || column.type === 'datetime' ? formatCell(column, row.cells[column.id]) : text
    return (
      <div className="flex h-full min-w-0 flex-1 items-center gap-1">
        <button type="button" className="h-9 min-w-0 flex-1 truncate text-left leading-9" aria-label={`Edit ${column.name}`} onClick={onOpen}>
          {shown}
        </button>
        {hint ? <FormatHint message={hint} /> : null}
      </div>
    )
  }
  if (column.type === 'date' || column.type === 'datetime') return <DateEditor column={column} value={row.cells[column.id]} onEdit={onEdit} onFlush={onFlush} />
  if (column.type === 'tags') return <TagEditor tableId={tableId} column={column} row={row} tags={tags} onEdit={onEdit} onFlush={onFlush} onCreated={onCreated} />
  if (column.type === 'status') return <StatusEditor tableId={tableId} column={column} row={row} statuses={statuses} onEdit={onEdit} onFlush={onFlush} onCreated={onCreated} />
  if (column.type === 'user') return <UserEditor column={column} row={row} members={members} onEdit={onEdit} onFlush={onFlush} />
  return (
    <div className="flex h-full min-w-0 flex-1 items-center gap-1">
      <TextEditor label={`Edit ${column.name}`} value={text} onEdit={(value) => onEdit(value)} onFlush={onFlush} onCancel={onCancel} />
      {hint ? <FormatHint message={hint} /> : null}
    </div>
  )
}

function FormatHint({ message }: { message: string }) {
  return (
    <span className="group/hint relative inline-flex shrink-0">
      <span tabIndex={0} aria-label={message} className="text-danger outline-none">
        <CircleAlert className="size-3.5" />
      </span>
      <span role="tooltip" className="pointer-events-none absolute bottom-full right-0 z-30 mb-1 hidden w-max max-w-56 rounded-md border border-border bg-card px-2 py-1 text-left text-xs font-normal leading-4 text-foreground shadow-md group-hover/hint:block group-focus-within/hint:block">
        {message}
      </span>
    </span>
  )
}

function TextEditor({ label, value, onEdit, onFlush, onCancel }: { label: string; value: string; onEdit: (value: string) => void; onFlush: () => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(value)
  return (
    <input
      autoFocus
      aria-label={label}
      className="h-9 min-w-0 flex-1 bg-transparent leading-9 outline-none"
      value={draft}
      onChange={(event) => { setDraft(event.target.value); onEdit(event.target.value) }}
      onBlur={onFlush}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') { event.preventDefault(); onCancel() }
      }}
    />
  )
}

function DateEditor({ column, value, onEdit, onFlush }: { column: Column; value: unknown; onEdit: (value: string, delay?: number) => void; onFlush: () => void }) {
  const { t } = useTranslation()
  const raw = typeof value === 'string' ? value : ''
  const [date, setDate] = useState(raw.includes('T') ? raw.slice(0, 10) : raw)
  const [time, setTime] = useState(raw.includes('T') ? raw.slice(11, 16) : '')
  function clear() {
    setDate('')
    setTime('')
    onEdit('', 0)
    onFlush()
  }
  return (
    <div className="flex h-full min-w-0 items-center gap-1">
      <input aria-label={`Edit ${column.name}`} type="date" className="h-9 min-w-0 bg-transparent outline-none" value={date} onChange={(event) => { const nextDate = event.target.value; setDate(nextDate); const next = column.type === 'datetime' && time ? `${nextDate}T${time}` : nextDate; onEdit(next, 0); onFlush() }} />
      {column.type === 'datetime' ? <input aria-label={`${column.name} time`} type="time" className="h-9 bg-transparent outline-none" value={time} onChange={(event) => { const nextTime = event.target.value; setTime(nextTime); onEdit(nextTime ? `${date}T${nextTime}` : date, 0); onFlush() }} /> : null}
      {date || time ? (
        <button type="button" aria-label={t('clearCell')} className="shrink-0 text-muted-foreground" onClick={clear}>
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

function TagEditor({ tableId, column, row, tags, onEdit, onFlush, onCreated }: { tableId: string; column: Column; row: RowRecord; tags: CatalogItem[]; onEdit: (value: string[], delay?: number) => void; onFlush: () => void; onCreated: (kind: 'tag' | 'status', item: CatalogItem) => void }) {
  const selected = Array.isArray(row.cells[column.id]) ? (row.cells[column.id] as string[]) : []
  const [name, setName] = useState('')
  function choose(next: string[]) {
    onEdit(next, 0)
    onFlush()
  }
  return (
    <div className="flex h-full items-center gap-1 overflow-hidden">
      {names(selected, tags).map((tag) => (
        <span key={tag.id} className="inline-flex items-center gap-0.5">
          <button type="button" onClick={() => choose(selected.filter((id) => id !== tag.id))}>
            <Badge color={tag.color}>{tag.name}</Badge>
          </button>
          <select
            aria-label={`${tag.name} color`}
            className="h-6 bg-transparent text-xs outline-none"
            value={palette.includes(tag.color) ? tag.color : 'slate'}
            onChange={(event) => {
              void api.request<{ tag: CatalogItem }>(`/tables/${tableId}/tags/${tag.id}`, { method: 'PATCH', body: JSON.stringify({ color: event.target.value }) }).then((result) => onCreated('tag', { ...result.tag, tableId }))
            }}
          >
            {palette.map((color) => <option key={color} value={color}>{color}</option>)}
          </select>
        </span>
      ))}
      <input
        autoFocus
        aria-label={`Edit ${column.name}`}
        className="h-7 min-w-16 flex-1 bg-transparent outline-none"
        value={name}
        placeholder="Tag"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          const trimmed = name.trim()
          if (!trimmed) return
          void api.request<{ tag: CatalogItem }>(`/tables/${tableId}/tags`, { method: 'POST', body: JSON.stringify({ name: trimmed }) }).then((result) => {
            onCreated('tag', { ...result.tag, tableId })
            choose(selected.includes(result.tag.id) ? selected : [...selected, result.tag.id])
            setName('')
          })
        }}
      />
    </div>
  )
}

function StatusEditor({ tableId, column, row, statuses, onEdit, onFlush, onCreated }: { tableId: string; column: Column; row: RowRecord; statuses: CatalogItem[]; onEdit: (value: string, delay?: number) => void; onFlush: () => void; onCreated: (kind: 'tag' | 'status', item: CatalogItem) => void }) {
  const [name, setName] = useState('')
  return (
    <div className="flex h-full items-center gap-1">
      <select
        autoFocus
        aria-label={`Edit ${column.name}`}
        className="h-7 bg-transparent outline-none"
        value={typeof row.cells[column.id] === 'string' ? String(row.cells[column.id]) : ''}
        onChange={(event) => { onEdit(event.target.value, 0); onFlush() }}
      >
        <option value="" />
        {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
      </select>
      {statuses.filter((status) => status.id === row.cells[column.id]).map((status) => (
        <select
          key={status.id}
          aria-label={`${status.name} color`}
          className="h-6 bg-transparent text-xs outline-none"
          value={palette.includes(status.color) ? status.color : 'slate'}
          onChange={(event) => {
            void api.request<{ status: CatalogItem }>(`/tables/${tableId}/statuses/${status.id}`, { method: 'PATCH', body: JSON.stringify({ color: event.target.value }) }).then((result) => onCreated('status', { ...result.status, tableId }))
          }}
        >
          {palette.map((color) => <option key={color} value={color}>{color}</option>)}
        </select>
      ))}
      <input
        aria-label="New status"
        className="h-7 w-20 bg-transparent outline-none"
        value={name}
        placeholder="New"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !name.trim()) return
          event.preventDefault()
          void api.request<{ status: CatalogItem }>(`/tables/${tableId}/statuses`, { method: 'POST', body: JSON.stringify({ name: name.trim() }) }).then((result) => {
            onCreated('status', { ...result.status, tableId })
            onEdit(result.status.id, 0)
            onFlush()
          })
        }}
      />
    </div>
  )
}

function UserEditor({ column, row, members, onEdit, onFlush }: { column: Column; row: RowRecord; members: { userId: string; username: string }[]; onEdit: (value: string[], delay?: number) => void; onFlush: () => void }) {
  const selected = Array.isArray(row.cells[column.id]) ? (row.cells[column.id] as string[]) : []
  return (
    <select
      autoFocus
      aria-label={`Edit ${column.name}`}
      className="h-7 w-full bg-transparent outline-none"
      value=""
      onChange={(event) => {
        if (!event.target.value) return
        onEdit(selected.includes(event.target.value) ? selected.filter((id) => id !== event.target.value) : [...selected, event.target.value], 0)
        onFlush()
      }}
    >
      <option value="">Add</option>
      {members.map((member) => <option key={member.userId} value={member.userId}>{selected.includes(member.userId) ? `− ${member.username}` : member.username}</option>)}
    </select>
  )
}

