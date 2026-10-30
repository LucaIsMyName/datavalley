import * as Dialog from '@radix-ui/react-dialog'
import { ApiClientError, type RowRecord } from '@datavalley/api-client'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'
import { FORMULA_HELP, formatFormulaValue } from './formula-help'
import { insertSnippet, matchingFunctions } from './formula-insert'

type CatalogColumn = {
  tableId: string
  tableName: string
  columnId: string
  columnName: string
  projectName: string
}

type CatalogRelation = {
  columnId: string
  name: string
  toTableId: string
  toTableName: string
  toProjectName: string
  columns: { id: string; name: string }[]
}

type Catalog = { columns: CatalogColumn[]; relations: CatalogRelation[] }

type Picker = 'row' | 'cell' | 'lookup' | 'relation'

function rowLabel(row: Pick<RowRecord, 'id' | 'rowNumber' | 'cells'>) {
  const text = Object.values(row.cells).find((item) => typeof item === 'string' && item.trim())
  if (typeof text === 'string') return text
  return String(row.rowNumber || row.id.slice(0, 8))
}

export function FormulaDialog({
  open,
  tableId,
  rowId,
  columnId,
  columnName,
  onClose,
  onSaved,
}: {
  open: boolean
  tableId: string
  rowId: string
  columnId: string
  columnName: string
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const { t: docs } = useTranslation('docs')
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState('')
  const [cursor, setCursor] = useState(0)
  const [chosen, setChosen] = useState('IF')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [catalog, setCatalog] = useState<Catalog>({ columns: [], relations: [] })
  const [picker, setPicker] = useState<Picker>('row')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setDraft('')
    setError('')
    setPreview('')
    setChosen('IF')
    setPicker('row')
    void api.request<{ source: string }>(`/rows/${rowId}/columns/${columnId}/formula`).then((result) => {
      if (!cancelled) setDraft(result.source ?? '')
    }).catch((caught: unknown) => {
      if (!cancelled) setError(caught instanceof ApiClientError ? caught.message : t('error'))
    })
    void api.request<Catalog>(`/tables/${tableId}/formula-catalog`).then((result) => {
      if (!cancelled) setCatalog(result)
    }).catch(() => {
      if (!cancelled) setCatalog({ columns: [], relations: [] })
    })
    return () => {
      cancelled = true
    }
  }, [open, rowId, columnId, tableId, t])

  useEffect(() => {
    if (!open) return
    const handle = setTimeout(() => {
      if (!draft.trim()) {
        setPreview('')
        return
      }
      void api
        .request<{ value: unknown }>('/formulas/validate', {
          method: 'POST',
          body: JSON.stringify({ tableId, expression: draft, rowId }),
        })
        .then((result) => setPreview(formatFormulaValue(result.value)))
        .catch((caught: unknown) => setPreview(caught instanceof ApiClientError ? caught.message : t('error')))
    }, 300)
    return () => clearTimeout(handle)
  }, [open, draft, tableId, rowId, t])

  function rememberCursor() {
    setCursor(areaRef.current?.selectionStart ?? draft.length)
  }

  function insert(snippet: string) {
    const start = areaRef.current?.selectionStart ?? cursor
    const end = areaRef.current?.selectionEnd ?? cursor
    const next = insertSnippet(draft, start, end, snippet)
    setDraft(next.value)
    setCursor(next.cursor)
    requestAnimationFrame(() => {
      areaRef.current?.focus()
      areaRef.current?.setSelectionRange(next.cursor, next.cursor)
    })
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      if (draft.trim()) {
        await api.request('/formulas/validate', {
          method: 'POST',
          body: JSON.stringify({ tableId, expression: draft, rowId }),
        })
      }
      await api.request(`/rows/${rowId}/columns/${columnId}/formula`, {
        method: 'POST',
        body: JSON.stringify({ expression: draft }),
      })
      onSaved()
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : t('error'))
    } finally {
      setSaving(false)
    }
  }

  const functions = matchingFunctions(draft, cursor)
  const help = FORMULA_HELP.find((item) => item.name === chosen) ?? FORMULA_HELP[0]
  const here = catalog.columns.filter((column) => column.tableId === tableId && column.columnId !== columnId)

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto rounded-md border border-border bg-card p-4 shadow-md">
          <Dialog.Title className="text-base font-semibold">{t('formulaTitle', { name: columnName })}</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">{t('formulaPreview')}</Dialog.Description>
          <textarea
            ref={areaRef}
            aria-label={t('formulaExpression')}
            className="min-h-24 w-full rounded-md border border-border bg-card p-2 font-mono text-sm outline-none"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setCursor(event.target.selectionStart)
            }}
            onSelect={rememberCursor}
            onKeyUp={rememberCursor}
            onClick={rememberCursor}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <p className="font-mono text-sm text-muted-foreground" aria-live="polite">{preview}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-h-0 flex-col gap-2">
              <p className="text-sm font-medium">{t('formulaFunctions')}</p>
              <ul className="max-h-48 overflow-y-auto rounded-md border border-border">
                {functions.map((item) => (
                  <li key={item.name}>
                    <button
                      type="button"
                      className="block w-full px-2 py-1 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setChosen(item.name)
                        insert(item.insert)
                      }}
                    >
                      {item.name}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="font-mono text-xs text-muted-foreground">{help?.example}</p>
              <p className="text-sm text-muted-foreground">{docs(`functions.${help?.name}`)}</p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{t('formulaValues')}</p>
              <div className="flex flex-wrap gap-1">
                {(['row', 'cell', 'lookup', 'relation'] as const).map((mode) => (
                  <Button key={mode} type="button" variant={picker === mode ? 'default' : 'outline'} onClick={() => setPicker(mode)}>
                    {t(mode === 'row' ? 'formulaThisRow' : mode === 'cell' ? 'formulaAnotherCell' : mode === 'lookup' ? 'formulaLookup' : 'formulaRelation')}
                  </Button>
                ))}
              </div>
              {picker === 'row' ? (
                <ul className="max-h-48 overflow-y-auto rounded-md border border-border">
                  {here.map((column) => (
                    <li key={column.columnId}>
                      <button type="button" className="block w-full px-2 py-1 text-left text-sm hover:bg-accent" onClick={() => insert(column.columnName)}>
                        {column.columnName}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {picker === 'cell' ? <CellPicker key={catalog.columns.length} columns={catalog.columns} onInsert={insert} /> : null}
              {picker === 'lookup' ? <LookupPicker key={catalog.columns.length} columns={catalog.columns} here={here} onInsert={insert} /> : null}
              {picker === 'relation' ? <RelationPicker key={catalog.relations.map((item) => item.columnId).join(',')} relations={catalog.relations} onInsert={insert} /> : null}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Link className="text-sm underline" to="/doc#formulas">{t('formulaDocs')}</Link>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>{t('cancel')}</Button>
              <Button type="button" onClick={() => void save()} disabled={saving}>{t('save')}</Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function CellPicker({ columns, onInsert }: { columns: CatalogColumn[]; onInsert: (snippet: string) => void }) {
  const { t } = useTranslation()
  const tables = uniqueTables(columns)
  const [tableId, setTableId] = useState(tables[0]?.tableId ?? '')
  const fields = columns.filter((column) => column.tableId === tableId)
  const [columnName, setColumnName] = useState(fields[0]?.columnName ?? '')
  const table = tables.find((item) => item.tableId === tableId)
  const field = fields.find((item) => item.columnName === columnName) ?? fields[0]
  return (
    <div className="flex flex-col gap-2">
      <select className="h-9 rounded-md border border-border bg-card px-2 text-sm" aria-label={t('targetTable')} value={tableId} onChange={(event) => { setTableId(event.target.value); setColumnName('') }}>
        {tables.map((item) => <option key={item.tableId} value={item.tableId}>{item.tableName}</option>)}
      </select>
      <select className="h-9 rounded-md border border-border bg-card px-2 text-sm" aria-label={t('formulaField')} value={field?.columnName ?? ''} onChange={(event) => setColumnName(event.target.value)}>
        {fields.map((item) => <option key={item.columnId} value={item.columnName}>{item.columnName}</option>)}
      </select>
      {table && field ? (
        <RowSearch tableId={table.tableId} onPick={(row) => onInsert(`${table.tableName}.${field.columnName}@${row.id}`)} />
      ) : null}
    </div>
  )
}

function LookupPicker({ columns, here, onInsert }: { columns: CatalogColumn[]; here: CatalogColumn[]; onInsert: (snippet: string) => void }) {
  const { t } = useTranslation()
  const [matchId, setMatchId] = useState(columns[0]?.columnId ?? '')
  const match = columns.find((column) => column.columnId === matchId) ?? columns[0]
  const results = columns.filter((column) => column.tableId === match?.tableId)
  const [resultId, setResultId] = useState(results[1]?.columnId ?? results[0]?.columnId ?? '')
  const result = results.find((column) => column.columnId === resultId) ?? results[0]
  const [needle, setNeedle] = useState(here[0]?.columnName ?? '')
  return (
    <div className="flex flex-col gap-2">
      <select className="h-9 rounded-md border border-border bg-card px-2 text-sm" aria-label={t('formulaMatch')} value={match?.columnId ?? ''} onChange={(event) => setMatchId(event.target.value)}>
        {columns.map((column) => <option key={column.columnId} value={column.columnId}>{column.tableName}.{column.columnName}</option>)}
      </select>
      <select className="h-9 rounded-md border border-border bg-card px-2 text-sm" aria-label={t('formulaNeedle')} value={needle} onChange={(event) => setNeedle(event.target.value)}>
        {here.map((column) => <option key={column.columnId} value={column.columnName}>{column.columnName}</option>)}
      </select>
      <select className="h-9 rounded-md border border-border bg-card px-2 text-sm" aria-label={t('formulaResult')} value={result?.columnId ?? ''} onChange={(event) => setResultId(event.target.value)}>
        {results.map((column) => <option key={column.columnId} value={column.columnId}>{column.tableName}.{column.columnName}</option>)}
      </select>
      {match && result && needle ? (
        <Button type="button" variant="outline" onClick={() => onInsert(`LOOKUP(${match.tableName}.${match.columnName}, ${needle}, ${result.tableName}.${result.columnName})`)}>
          {t('formulaInsert')}
        </Button>
      ) : null}
    </div>
  )
}

function RelationPicker({ relations, onInsert }: { relations: CatalogRelation[]; onInsert: (snippet: string) => void }) {
  const { t } = useTranslation()
  const [relationName, setRelationName] = useState(relations[0]?.name ?? '')
  const relation = relations.find((item) => item.name === relationName) ?? relations[0]
  const [field, setField] = useState(relation?.columns[0]?.name ?? '')
  if (!relation) return <p className="text-sm text-muted-foreground">{t('formulaNoRelations')}</p>
  const chosen = relation.columns.find((item) => item.name === field) ?? relation.columns[0]
  return (
    <div className="flex flex-col gap-2">
      <select className="h-9 rounded-md border border-border bg-card px-2 text-sm" aria-label={t('formulaRelation')} value={relation.name} onChange={(event) => { setRelationName(event.target.value); setField('') }}>
        {relations.map((item) => <option key={item.columnId} value={item.name}>{item.name}</option>)}
      </select>
      <select className="h-9 rounded-md border border-border bg-card px-2 text-sm" aria-label={t('formulaField')} value={chosen?.name ?? ''} onChange={(event) => setField(event.target.value)}>
        {relation.columns.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
      </select>
      {chosen ? (
        <Button type="button" variant="outline" onClick={() => onInsert(`RELATION(${relation.name}, ${chosen.name})`)}>
          {t('formulaInsert')}
        </Button>
      ) : null}
    </div>
  )
}

function RowSearch({ tableId, onPick }: { tableId: string; onPick: (row: { id: string; label: string }) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<{ id: string; label: string }[]>([])
  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams({ limit: '20' })
      if (query.trim()) params.set('q', query.trim())
      void api
        .request<{ rows: RowRecord[] }>(`/tables/${tableId}/rows?${params}`)
        .then((result) => setRows(result.rows.map((row) => ({ id: row.id, label: rowLabel(row) }))))
        .catch(() => setRows([]))
    }, 250)
    return () => clearTimeout(handle)
  }, [query, tableId])
  return (
    <div className="flex flex-col gap-2">
      <input
        aria-label={t('formulaSearchRows')}
        className="h-9 rounded-md border border-border bg-card px-2 text-sm outline-none"
        placeholder={t('formulaSearchRows')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="max-h-40 overflow-y-auto rounded-md border border-border">
        {rows.length === 0 ? <li className="px-2 py-1 text-sm text-muted-foreground">{t('formulaNoRows')}</li> : null}
        {rows.map((row) => (
          <li key={row.id}>
            <button type="button" className="block w-full px-2 py-1 text-left text-sm hover:bg-accent" onClick={() => onPick(row)}>
              {row.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function uniqueTables(columns: CatalogColumn[]) {
  const tables: { tableId: string; tableName: string }[] = []
  for (const column of columns) {
    if (!tables.some((item) => item.tableId === column.tableId)) tables.push({ tableId: column.tableId, tableName: column.tableName })
  }
  return tables
}
