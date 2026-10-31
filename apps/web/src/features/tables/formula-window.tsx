import { ApiClientError, type RowRecord } from '@datavalley/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '../../components/ui/button'
import { SelectField } from '../../components/ui/select'
import { api } from '../../lib/api'
import { useFormulaWindow, type FormulaCell } from '../../stores/formula-window'
import { FormulaEditor, type FormulaEditorHandle } from './formula-editor'
import { formatFormulaValue } from './formula-help'
import { cellReference, columnReference, relationReference, thisRowReference } from './formula-insert'
import {
  badgeLabel,
  catalogTables,
  classifyBracket,
  rowText,
  type BracketKind,
  type BracketSpan,
  type FormulaCatalog,
} from './formula-tokens'

const fieldClass = 'h-9 w-full rounded-md border border-border bg-card px-2 text-sm'

type CatalogResponse = {
  columns: FormulaCatalog['columns']
  relations: { name: string; columns: { id: string; name: string }[] }[]
}

export function FormulaWindow() {
  const cell = useFormulaWindow((state) => state.cell)
  const x = useFormulaWindow((state) => state.x)
  const y = useFormulaWindow((state) => state.y)
  const width = useFormulaWindow((state) => state.width)
  const height = useFormulaWindow((state) => state.height)

  useEffect(() => {
    function onResize() {
      const frame = useFormulaWindow.getState()
      frame.resize(frame.width, frame.height)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (!cell) return null
  return (
    <FormulaPanel
      key={`${cell.tableId}:${cell.rowId}:${cell.columnId}`}
      cell={cell}
      x={x}
      y={y}
      width={width}
      height={height}
    />
  )
}

function FormulaPanel({ cell, x, y, width, height }: { cell: FormulaCell; x: number; y: number; width: number; height: number }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const panelRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<FormulaEditorHandle>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<FormulaCatalog>({ tableId: cell.tableId, columns: [], relations: [] })
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [menu, setMenu] = useState<{ span: BracketSpan; rect: DOMRect } | null>(null)
  const columnTitle = t('formulaTitle', { name: cell.columnName })
  const title = cell.tableName ? `${columnTitle} ${t('formulaIn')} ${cell.tableName}` : columnTitle

  useEffect(() => {
    let cancelled = false
    void api.request<{ source: string }>(`/rows/${cell.rowId}/columns/${cell.columnId}/formula`).then((result) => {
      if (!cancelled) setDraft(result.source ?? '')
    }).catch((caught: unknown) => {
      if (!cancelled) {
        setDraft('')
        setError(caught instanceof ApiClientError ? caught.message : t('error'))
      }
    })
    void api.request<CatalogResponse>(`/tables/${cell.tableId}/formula-catalog`).then((result) => {
      if (!cancelled) {
        setCatalog({
          tableId: cell.tableId,
          columns: result.columns,
          relations: result.relations.map((relation) => ({ name: relation.name, columns: relation.columns.map((column) => ({ name: column.name })) })),
        })
      }
    }).catch(() => {
      if (!cancelled) setCatalog({ tableId: cell.tableId, columns: [], relations: [] })
    })
    return () => {
      cancelled = true
    }
  }, [cell, t])

  useEffect(() => {
    if (draft === null) return
    const handle = setTimeout(() => {
      if (!draft.trim()) {
        setPreview('')
        return
      }
      void api.request<{ value: unknown }>('/formulas/validate', {
        method: 'POST',
        body: JSON.stringify({ tableId: cell.tableId, expression: draft, rowId: cell.rowId }),
      }).then((result) => setPreview(formatFormulaValue(result.value))).catch((caught: unknown) => {
        setPreview(caught instanceof ApiClientError ? caught.message : t('error'))
      })
    }, 300)
    return () => clearTimeout(handle)
  }, [draft, cell, t])

  useEffect(() => {
    const panel = panelRef.current
    const bar = panel?.querySelector<HTMLElement>('[data-formula-drag]')
    const grip = panel?.querySelector<HTMLElement>('[data-formula-resize]')
    if (!bar || !grip) return
    function onBarDown(event: PointerEvent) {
      if (event.button !== 0) return
      const target = event.target
      if (target instanceof Element && target.closest('button, a')) return
      event.preventDefault()
      setMenu(null)
      const startX = event.clientX
      const startY = event.clientY
      const origin = useFormulaWindow.getState()
      const previous = document.body.style.userSelect
      document.body.style.userSelect = 'none'
      function move(next: PointerEvent) {
        useFormulaWindow.getState().move(origin.x + next.clientX - startX, origin.y + next.clientY - startY)
      }
      function up() {
        document.body.style.userSelect = previous
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
    function onGripDown(event: PointerEvent) {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      setMenu(null)
      const startX = event.clientX
      const startY = event.clientY
      const origin = useFormulaWindow.getState()
      function move(next: PointerEvent) {
        useFormulaWindow.getState().resize(origin.width + next.clientX - startX, origin.height + next.clientY - startY)
      }
      function up() {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
    bar.addEventListener('pointerdown', onBarDown)
    grip.addEventListener('pointerdown', onGripDown)
    return () => {
      bar.removeEventListener('pointerdown', onBarDown)
      grip.removeEventListener('pointerdown', onGripDown)
    }
  }, [])

  async function save() {
    if (draft === null) return
    setSaving(true)
    setError('')
    try {
      if (draft.trim()) {
        await api.request('/formulas/validate', {
          method: 'POST',
          body: JSON.stringify({ tableId: cell.tableId, expression: draft, rowId: cell.rowId }),
        })
      }
      await api.request(`/rows/${cell.rowId}/columns/${cell.columnId}/formula`, {
        method: 'POST',
        body: JSON.stringify({ expression: draft }),
      })
      await queryClient.invalidateQueries({ queryKey: ['rows', cell.tableId] })
      await queryClient.invalidateQueries({ queryKey: ['table', cell.tableId] })
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed z-50 flex flex-col rounded-md border border-border bg-card shadow-md"
      style={{ left: x, top: y, width, height }}
      ref={panelRef}
      role="dialog"
      aria-label={title}
      data-formula-window=""
    >
      <div data-formula-drag="" className="flex shrink-0 cursor-grab items-center justify-between gap-2 border-b border-border px-3 py-2 select-none">
        <h2 className="min-w-0 truncate text-sm font-semibold" title={title}>
          {columnTitle}
          {cell.tableName ? (
            <>
              {' '}
              {t('formulaIn')}
              {' '}
              {cell.projectId ? (
                <Link className="underline" to={`/projects/${cell.projectId}/tables/${cell.tableId}`}>{cell.tableName}</Link>
              ) : cell.tableName}
            </>
          ) : null}
        </h2>
        <Button type="button" variant="ghost" className="h-7 px-2" aria-label={t('close')} onClick={() => useFormulaWindow.getState().close()}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="relative min-h-0 flex-1">
          {draft === null ? <div className="absolute inset-0 rounded-md border border-border" /> : (
            <div className="absolute inset-0">
              <FormulaEditor
                ref={editorRef}
                initialValue={draft}
                catalog={catalog}
                columnId={cell.columnId}
                label={t('formulaExpression')}
                onChange={(value) => {
                  setDraft(value)
                  setError('')
                  setMenu(null)
                }}
                onBadge={(span, rect) => setMenu({ span, rect })}
              />
            </div>
          )}
        </div>
        <p className={`min-h-5 truncate font-mono text-sm ${error ? 'text-danger' : 'text-muted-foreground'}`} aria-live="polite" title={error || preview}>
          {error || preview}
        </p>
        <div className="flex shrink-0 items-center justify-between gap-2">
          <Link className="text-sm underline" to="/doc#formulas">{t('formulaDocs')}</Link>
          <Button type="button" onClick={() => void save()} disabled={saving || draft === null}>{t('save')}</Button>
        </div>
      </div>
      <button
        type="button"
        aria-label={t('formulaResize')}
        data-formula-resize=""
        className="absolute right-0 bottom-0 size-4 cursor-nwse-resize border-r-2 border-b-2 border-muted-foreground"
      />
      {menu && draft !== null ? (
        <BadgeMenu
          key={`${menu.span.from}:${menu.span.to}:${menu.span.body}`}
          span={menu.span}
          rect={menu.rect}
          catalog={catalog}
          tableId={cell.tableId}
          columnId={cell.columnId}
          onReplace={(text) => {
            editorRef.current?.replace(menu.span.from, menu.span.to, text)
            setMenu(null)
          }}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  )
}

function BadgeMenu({
  span,
  rect,
  catalog,
  tableId,
  columnId,
  onReplace,
  onClose,
}: {
  span: BracketSpan
  rect: DOMRect
  catalog: FormulaCatalog
  tableId: string
  columnId: string
  onReplace: (text: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)
  const parts = span.body.split('->').map((part) => part.trim())
  const [mode, setMode] = useState<BracketKind>(classifyBracket(span.body, catalog))
  const width = Math.min(288, window.innerWidth - 16)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  const top = rect.bottom + 286 > window.innerHeight ? Math.max(8, rect.top - 280) : rect.bottom + 6

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Element && target.closest('[role="listbox"], [data-radix-popper-content-wrapper]')) return
      if (target instanceof Node && menuRef.current?.contains(target)) return
      onClose()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const modes: BracketKind[] = ['row', 'cell', 'relation', 'column']

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[80] flex max-h-72 w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 overflow-y-auto rounded-md border border-border bg-card p-2 shadow-md"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <p className="truncate px-1 font-mono text-xs text-muted-foreground">{badgeLabel(span.body)}</p>
      <div className="flex flex-wrap gap-1">
        {modes.map((item) => (
          <Button key={item} type="button" variant={mode === item ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => setMode(item)}>
            {t(modeLabel(item))}
          </Button>
        ))}
      </div>
      {mode === 'row' ? <ThisRowList catalog={catalog} tableId={tableId} columnId={columnId} onReplace={onReplace} /> : null}
      {mode === 'cell' ? <CellList catalog={catalog} tableName={parts[0] ?? ''} columnName={parts[1] ?? ''} onReplace={onReplace} /> : null}
      {mode === 'relation' ? <RelationList catalog={catalog} relationName={parts[0] ?? ''} onReplace={onReplace} /> : null}
      {mode === 'column' ? <ColumnList catalog={catalog} tableName={parts[0] ?? ''} onReplace={onReplace} /> : null}
    </div>,
    document.body,
  )
}

function modeLabel(mode: BracketKind) {
  if (mode === 'row') return 'formulaThisRow'
  if (mode === 'cell') return 'formulaAnotherCell'
  if (mode === 'relation') return 'formulaRelation'
  return 'formulaWholeColumn'
}

function choiceButton(label: string, onClick: () => void) {
  return (
    <button type="button" className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent" onClick={onClick}>
      {label}
    </button>
  )
}

function ThisRowList({ catalog, tableId, columnId, onReplace }: { catalog: FormulaCatalog; tableId: string; columnId: string; onReplace: (text: string) => void }) {
  const columns = catalog.columns.filter((column) => column.tableId === tableId && column.columnId !== columnId)
  return (
    <ul className="overflow-y-auto rounded-md border border-border">
      {columns.map((column) => <li key={column.columnId}>{choiceButton(column.columnName, () => onReplace(thisRowReference(column.columnName)))}</li>)}
    </ul>
  )
}

function CellList({ catalog, tableName, columnName, onReplace }: { catalog: FormulaCatalog; tableName: string; columnName: string; onReplace: (text: string) => void }) {
  const { t } = useTranslation()
  const tables = catalogTables(catalog)
  const [tableId, setTableId] = useState(tables.find((item) => item.tableName === tableName)?.tableId ?? tables[0]?.tableId ?? '')
  const fields = catalog.columns.filter((column) => column.tableId === tableId)
  const [fieldName, setFieldName] = useState(fields.find((item) => item.columnName === columnName)?.columnName ?? fields[0]?.columnName ?? '')
  const table = tables.find((item) => item.tableId === tableId)
  const field = fields.find((item) => item.columnName === fieldName) ?? fields[0]
  return (
    <div className="flex flex-col gap-2">
      <SelectField label={t('targetTable')} value={tableId} onValueChange={(value) => { setTableId(value); setFieldName('') }} options={tables.map((item) => ({ value: item.tableId, label: item.tableName }))} />
      <SelectField label={t('formulaField')} value={field?.columnName ?? ''} onValueChange={setFieldName} options={fields.map((item) => ({ value: item.columnName, label: item.columnName }))} />
      {table && field ? <RowSearch tableId={table.tableId} onPick={(row) => onReplace(cellReference(table.tableName, field.columnName, row.rowNumber))} /> : null}
    </div>
  )
}

function RelationList({ catalog, relationName, onReplace }: { catalog: FormulaCatalog; relationName: string; onReplace: (text: string) => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(catalog.relations.find((item) => item.name === relationName)?.name ?? catalog.relations[0]?.name ?? '')
  const relation = catalog.relations.find((item) => item.name === name)
  if (!relation) return <p className="text-sm text-muted-foreground">{t('formulaNoRelations')}</p>
  return (
    <div className="flex flex-col gap-2">
      <SelectField label={t('formulaRelation')} value={relation.name} onValueChange={setName} options={catalog.relations.map((item) => ({ value: item.name, label: item.name }))} />
      <ul className="overflow-y-auto rounded-md border border-border">
        {relation.columns.map((column) => <li key={column.name}>{choiceButton(column.name, () => onReplace(relationReference(relation.name, column.name)))}</li>)}
      </ul>
    </div>
  )
}

function ColumnList({ catalog, tableName, onReplace }: { catalog: FormulaCatalog; tableName: string; onReplace: (text: string) => void }) {
  const { t } = useTranslation()
  const tables = catalogTables(catalog)
  const [tableId, setTableId] = useState(tables.find((item) => item.tableName === tableName)?.tableId ?? tables[0]?.tableId ?? '')
  const table = tables.find((item) => item.tableId === tableId)
  const fields = catalog.columns.filter((column) => column.tableId === tableId)
  return (
    <div className="flex flex-col gap-2">
      <SelectField label={t('targetTable')} value={tableId} onValueChange={setTableId} options={tables.map((item) => ({ value: item.tableId, label: item.tableName }))} />
      {table ? (
        <ul className="overflow-y-auto rounded-md border border-border">
          {fields.map((column) => <li key={column.columnId}>{choiceButton(column.columnName, () => onReplace(columnReference(table.tableName, column.columnName)))}</li>)}
        </ul>
      ) : null}
    </div>
  )
}

function RowSearch({ tableId, onPick }: { tableId: string; onPick: (row: { rowNumber: number }) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<{ id: string; label: string; rowNumber: number }[]>([])
  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams({ limit: '20' })
      if (query.trim()) params.set('q', query.trim())
      void api.request<{ rows: RowRecord[] }>(`/tables/${tableId}/rows?${params}`).then((result) => {
        setRows(result.rows.map((row) => ({ id: row.id, label: rowText(row), rowNumber: row.rowNumber })))
      }).catch(() => setRows([]))
    }, 250)
    return () => clearTimeout(handle)
  }, [query, tableId])
  return (
    <div className="flex flex-col gap-2">
      <input
        aria-label={t('formulaSearchRows')}
        className={fieldClass}
        placeholder={t('formulaSearchRows')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="max-h-32 overflow-y-auto rounded-md border border-border">
        {rows.length === 0 ? <li className="px-2 py-1 text-sm text-muted-foreground">{t('formulaNoRows')}</li> : null}
        {rows.map((row) => <li key={row.id}>{choiceButton(row.label, () => onPick(row))}</li>)}
      </ul>
    </div>
  )
}
