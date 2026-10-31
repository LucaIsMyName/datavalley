import { useEffect, useRef, useState } from 'react'
import { ApiClientError, type CatalogItem, type Column, type RowRecord } from '@datavalley/api-client'
import { ChevronDown, CircleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AnchoredLayer } from '../../components/anchored-layer'
import { Badge } from '../../components/ui/badge'
import { SelectField } from '../../components/ui/select'
import { api } from '../../lib/api'
import type { ViewportAnchor } from '../../lib/place-in-viewport'

const money: Record<string, string> = { USD: 'USD', EUR: 'EUR', GBP: 'GBP', CHF: 'CHF', JPY: 'JPY' }
const palette = ['amber', 'green', 'blue', 'red', 'violet', 'orange', 'pink', 'teal', 'slate', 'yellow']
const swatch: Record<string, string> = {
  amber: 'bg-amber-200',
  green: 'bg-green-200',
  blue: 'bg-blue-200',
  red: 'bg-red-200',
  violet: 'bg-violet-200',
  orange: 'bg-orange-200',
  pink: 'bg-pink-200',
  teal: 'bg-teal-200',
  slate: 'bg-slate-200',
  yellow: 'bg-yellow-200',
}

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

function checkedValue(value: unknown) {
  return value === true || value === 'true' || value === '1' || value === 'yes'
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
  onEdit: (value: string | string[] | boolean, delay?: number) => void
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
  if (column.type === 'checkbox') {
    return <CheckboxEditor column={column} value={row.cells[column.id]} onEdit={onEdit} onFlush={onFlush} />
  }
  if (column.type === 'tags') {
    return <TagEditor tableId={tableId} column={column} row={row} tags={tags} active={active} onEdit={onEdit} onFlush={onFlush} onOpen={onOpen} onCreated={onCreated} />
  }
  if (column.type === 'status') {
    return <StatusEditor tableId={tableId} column={column} row={row} statuses={statuses} active={active} onEdit={onEdit} onFlush={onFlush} onOpen={onOpen} onCreated={onCreated} />
  }
  if (!active) {
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
  if (column.type === 'user') return <UserEditor column={column} row={row} members={members} onEdit={onEdit} onFlush={onFlush} />
  return (
    <div className="flex h-full min-w-0 flex-1 items-center gap-1">
      <TextEditor label={`Edit ${column.name}`} value={text} onEdit={(value) => onEdit(value)} onFlush={onFlush} onCancel={onCancel} />
      {hint ? <FormatHint message={hint} /> : null}
    </div>
  )
}

function FormatHint({ message }: { message: string }) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [anchor, setAnchor] = useState<ViewportAnchor | null>(null)
  function show() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setAnchor({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })
  }
  return (
    <span className="inline-flex shrink-0" onMouseEnter={show} onMouseLeave={() => setAnchor(null)} onFocus={show} onBlur={() => setAnchor(null)}>
      <span ref={triggerRef} tabIndex={0} aria-label={message} className="text-danger outline-none">
        <CircleAlert className="size-3.5" />
      </span>
      {anchor ? (
        <AnchoredLayer
          anchor={anchor}
          prefer="above"
          align="end"
          role="tooltip"
          className="pointer-events-none w-max max-w-56 border border-border bg-card px-2 py-1 text-left text-xs font-normal leading-4 text-foreground shadow-md"
        >
          {message}
        </AnchoredLayer>
      ) : null}
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

function CheckboxEditor({ column, value, onEdit, onFlush }: { column: Column; value: unknown; onEdit: (value: boolean, delay?: number) => void; onFlush: () => void }) {
  return (
    <input
      type="checkbox"
      aria-label={`Edit ${column.name}`}
      className="size-4"
      checked={checkedValue(value)}
      onChange={(event) => {
        onEdit(event.target.checked, 0)
        onFlush()
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

function TagEditor({ tableId, column, row, tags, active, onEdit, onFlush, onOpen, onCreated }: { tableId: string; column: Column; row: RowRecord; tags: CatalogItem[]; active: boolean; onEdit: (value: string[], delay?: number) => void; onFlush: () => void; onOpen: () => void; onCreated: (kind: 'tag' | 'status', item: CatalogItem) => void }) {
  const { t } = useTranslation()
  const selected = Array.isArray(row.cells[column.id]) ? (row.cells[column.id] as string[]) : []
  const [name, setName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ tagId: string; anchor: ViewportAnchor } | null>(null)
  const pending = useRef(false)
  const skipBlur = useRef(false)
  useEffect(() => {
    if (!menu) return
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-tag-menu]') || target?.closest('[data-tag-chevron]')) return
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])
  function choose(next: string[]) {
    onEdit(next, 0)
    onFlush()
  }
  async function saveName(tag: CatalogItem) {
    if (pending.current) return
    const trimmed = draft.trim()
    if (!trimmed || trimmed === tag.name) {
      setRenamingId(null)
      setRenameError(null)
      return
    }
    pending.current = true
    try {
      const result = await api.request<{ tag: CatalogItem }>(`/tables/${tableId}/tags/${tag.id}`, { method: 'PATCH', body: JSON.stringify({ name: trimmed }) })
      onCreated('tag', { ...result.tag, tableId })
      setRenameError(null)
      setRenamingId(null)
    } catch (error) {
      pending.current = false
      setRenameError(error instanceof ApiClientError ? error.message : t('error'))
    }
  }
  const menuTag = menu ? names([menu.tagId], tags)[0] : null
  return (
    <div className="flex h-full w-full min-w-0 items-center gap-1 overflow-hidden" onClick={onOpen}>
      {names(selected, tags).map((tag) => (
        <Badge key={tag.id} color={tag.color} className="gap-0.5 pr-1">
          {renamingId === tag.id ? (
            <input
              autoFocus
              aria-label={t('rename')}
              className="bg-transparent text-xs outline-none"
              style={{ width: `${Math.max(draft.length, 2)}ch` }}
              value={draft}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                if (skipBlur.current) {
                  skipBlur.current = false
                  return
                }
                void saveName(tag)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void saveName(tag)
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  skipBlur.current = true
                  pending.current = false
                  setRenameError(null)
                  setRenamingId(null)
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="truncate"
              onClick={(event) => {
                event.stopPropagation()
                pending.current = false
                setRenameError(null)
                setDraft(tag.name)
                setRenamingId(tag.id)
              }}
            >
              {tag.name}
            </button>
          )}
          <button
            type="button"
            aria-label={t('color')}
            data-tag-chevron=""
            className="inline-flex shrink-0"
            onClick={(event) => {
              event.stopPropagation()
              if (menu?.tagId === tag.id) {
                setMenu(null)
                return
              }
              const rect = event.currentTarget.getBoundingClientRect()
              setMenu({ tagId: tag.id, anchor: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } })
            }}
          >
            <ChevronDown className="size-3" />
          </button>
        </Badge>
      ))}
      {active ? (
        <input
          autoFocus={renamingId == null}
          aria-label={`Edit ${column.name}`}
          className="h-7 min-w-16 flex-1 bg-transparent outline-none"
          value={name}
          placeholder="Tag"
          onClick={(event) => event.stopPropagation()}
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
      ) : null}
      {renameError ? <FormatHint message={renameError} /> : null}
      {menu && menuTag ? (
        <TagColorMenu
          tag={menuTag}
          anchor={menu.anchor}
          onColor={(color) => {
            void api.request<{ tag: CatalogItem }>(`/tables/${tableId}/tags/${menuTag.id}`, { method: 'PATCH', body: JSON.stringify({ color }) }).then((result) => {
              onCreated('tag', { ...result.tag, tableId })
              setMenu(null)
            })
          }}
          onRemove={() => {
            choose(selected.filter((id) => id !== menuTag.id))
            setMenu(null)
          }}
        />
      ) : null}
    </div>
  )
}

function TagColorMenu({ tag, anchor, onColor, onRemove }: { tag: CatalogItem; anchor: ViewportAnchor; onColor: (color: string) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const current = palette.includes(tag.color) ? tag.color : 'slate'
  return (
    <AnchoredLayer anchor={anchor} prefer="below" align="start" tagMenu className="w-40 border border-border bg-card p-2 shadow-md">
      <div className="flex flex-wrap gap-1">
        {palette.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={color}
            className={`h-5 w-5 border border-border ${swatch[color] ?? swatch.slate} ${color === current ? 'ring-2 ring-foreground' : ''}`}
            onClick={() => onColor(color)}
          />
        ))}
      </div>
      <button type="button" className="mt-2 w-full text-left text-sm" onClick={onRemove}>{t('clearCell')}</button>
    </AnchoredLayer>
  )
}

function StatusEditor({ tableId, column, row, statuses, active, onEdit, onFlush, onOpen, onCreated }: { tableId: string; column: Column; row: RowRecord; statuses: CatalogItem[]; active: boolean; onEdit: (value: string, delay?: number) => void; onFlush: () => void; onOpen: () => void; onCreated: (kind: 'tag' | 'status', item: CatalogItem) => void }) {
  const { t } = useTranslation()
  const currentId = typeof row.cells[column.id] === 'string' ? row.cells[column.id] : ''
  const current = statuses.find((status) => status.id === currentId) ?? null
  const [name, setName] = useState('')
  const [draft, setDraft] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [menu, setMenu] = useState<ViewportAnchor | null>(null)
  const pending = useRef(false)
  const skipBlur = useRef(false)
  useEffect(() => {
    if (!menu) return
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-tag-menu]') || target?.closest('[data-tag-chevron]')) return
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])
  function choose(next: string) {
    onEdit(next, 0)
    onFlush()
    setMenu(null)
  }
  async function saveName() {
    if (!current || pending.current) return
    const trimmed = draft.trim()
    if (!trimmed || trimmed === current.name) {
      setRenameError(null)
      return
    }
    pending.current = true
    try {
      const result = await api.request<{ status: CatalogItem }>(`/tables/${tableId}/statuses/${current.id}`, { method: 'PATCH', body: JSON.stringify({ name: trimmed }) })
      onCreated('status', { ...result.status, tableId })
      setDraft(result.status.name)
      setRenameError(null)
      pending.current = false
    } catch (error) {
      pending.current = false
      setRenameError(error instanceof ApiClientError ? error.message : t('error'))
    }
  }
  const currentColor = current && palette.includes(current.color) ? current.color : 'slate'
  return (
    <div className="flex h-full w-full min-w-0 items-center gap-1 overflow-hidden" onClick={onOpen}>
      {current ? (
        <Badge color={current.color} className="gap-0.5 pr-1">
          <span className="truncate">{current.name}</span>
          <button
            type="button"
            aria-label={t('color')}
            data-tag-chevron=""
            className="inline-flex shrink-0"
            onClick={(event) => {
              event.stopPropagation()
              if (menu) {
                setMenu(null)
                return
              }
              pending.current = false
              setRenameError(null)
              setDraft(current.name)
              const rect = event.currentTarget.getBoundingClientRect()
              setMenu({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })
            }}
          >
            <ChevronDown className="size-3" />
          </button>
        </Badge>
      ) : null}
      {active ? (
        <input
          autoFocus
          aria-label="New status"
          className="h-7 min-w-16 flex-1 bg-transparent outline-none"
          value={name}
          placeholder="New"
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !name.trim()) return
            event.preventDefault()
            void api.request<{ status: CatalogItem }>(`/tables/${tableId}/statuses`, { method: 'POST', body: JSON.stringify({ name: name.trim() }) }).then((result) => {
              onCreated('status', { ...result.status, tableId })
              choose(result.status.id)
              setName('')
            })
          }}
        />
      ) : null}
      {renameError ? <FormatHint message={renameError} /> : null}
      {menu && current ? (
        <AnchoredLayer anchor={menu} prefer="below" align="start" tagMenu className="w-[min(12rem,calc(100vw-2rem))] border border-border bg-card p-2 shadow-md">
          <ul className="max-h-40 overflow-auto">
            {statuses.map((status) => (
              <li key={status.id}>
                <button
                  type="button"
                  className={`block min-h-9 w-full truncate px-2 text-left text-sm hover:bg-accent ${status.id === current.id ? 'font-medium' : ''}`}
                  onClick={() => choose(status.id)}
                >
                  {status.name}
                </button>
              </li>
            ))}
          </ul>
          <input
            autoFocus
            aria-label={t('rename')}
            className="mt-2 h-8 w-full  border border-border bg-transparent px-2 text-sm outline-none"
            value={draft}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (skipBlur.current) {
                skipBlur.current = false
                return
              }
              void saveName()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void saveName()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                pending.current = false
                setRenameError(null)
                if (draft === current.name) {
                  skipBlur.current = true
                  setMenu(null)
                } else setDraft(current.name)
              }
            }}
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {palette.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                className={`h-5 w-5 border border-border ${swatch[color] ?? swatch.slate} ${color === currentColor ? 'ring-2 ring-foreground' : ''}`}
                onClick={() => {
                  void api.request<{ status: CatalogItem }>(`/tables/${tableId}/statuses/${current.id}`, { method: 'PATCH', body: JSON.stringify({ color }) }).then((result) => {
                    onCreated('status', { ...result.status, tableId })
                    setMenu(null)
                  })
                }}
              />
            ))}
          </div>
          <button type="button" className="mt-2 w-full text-left text-sm" onClick={() => choose('')}>{t('clearCell')}</button>
        </AnchoredLayer>
      ) : null}
    </div>
  )
}

function UserEditor({ column, row, members, onEdit, onFlush }: { column: Column; row: RowRecord; members: { userId: string; username: string }[]; onEdit: (value: string[], delay?: number) => void; onFlush: () => void }) {
  const selected = Array.isArray(row.cells[column.id]) ? (row.cells[column.id] as string[]) : []
  return (
    <SelectField
      label={`Edit ${column.name}`}
      className="h-7 border-0 bg-transparent px-0"
      value=""
      onValueChange={(value) => {
        if (!value) return
        onEdit(selected.includes(value) ? selected.filter((id) => id !== value) : [...selected, value], 0)
        onFlush()
      }}
      options={[
        { value: '', label: 'Add' },
        ...members.map((member) => ({
          value: member.userId,
          label: selected.includes(member.userId) ? `− ${member.username}` : member.username,
        })),
      ]}
    />
  )
}
