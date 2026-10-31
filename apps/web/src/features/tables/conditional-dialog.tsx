import { displayFormula, type BracketCatalog } from '@datavalley/formula-engine'
import { expressionFromOperator, swatchName, type FormatRule } from '@datavalley/shared'
import { ApiClientError } from '@datavalley/api-client'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'
import { FormulaEditor, type FormulaEditorHandle } from './formula-editor'
import { thisRowReference } from './formula-insert'
import { Swatches } from './swatches'
import type { BracketSpan, FormulaCatalog } from './formula-tokens'

export type ConditionDraft = {
  id: string
  expression: string
  color: string | null
  background: string | null
}

type Draft = {
  id: string
  source: string
  color: string | null
  background: string | null
}

type CatalogResponse = {
  columns: FormulaCatalog['columns']
  relations: { name: string; columnId: string; toTableId: string; toTableName: string; columns: { id: string; name: string }[] }[]
}

const freshRule = 'IT = '

function unfinished(source: string) {
  return source.trim() === 'IT ='
}

function keptColor(value: string | undefined) {
  if (!value) return null
  const name = swatchName(value)
  if (name) return name
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null
}

function bracketCatalog(tableId: string, result: CatalogResponse): BracketCatalog {
  return {
    tableId,
    columns: result.columns.map((column) => ({
      name: column.columnName,
      columnId: column.columnId,
      tableId: column.tableId,
      tableName: column.tableName,
    })),
    relations: result.relations.map((relation) => ({
      name: relation.name,
      columnId: relation.columnId,
      toTableId: relation.toTableId,
      toTableName: relation.toTableName,
      fields: relation.columns.map((column) => ({ name: column.name, columnId: column.id })),
    })),
    rows: [],
  }
}

function editorCatalog(tableId: string, result: CatalogResponse): FormulaCatalog {
  return {
    tableId,
    columns: result.columns,
    relations: result.relations.map((relation) => ({
      name: relation.name,
      columns: relation.columns.map((column) => ({ name: column.name })),
    })),
  }
}

function sourceFor(rule: FormatRule, catalog: BracketCatalog) {
  if (rule.expression) return displayFormula(rule.expression, catalog) ?? rule.expression
  return expressionFromOperator(rule) ?? ''
}

export function ConditionalDialog({
  tableId,
  columnId,
  columnName,
  rowLabel,
  rules,
  onClose,
  onSave,
}: {
  tableId: string
  columnId: string
  columnName: string
  rowLabel?: string
  rules: FormatRule[]
  onClose: () => void
  onSave: (rules: ConditionDraft[]) => Promise<void>
}) {
  const { t } = useTranslation()
  const rulesRef = useRef(rules)
  const editors = useRef(new Map<string, FormulaEditorHandle | null>())
  const [catalog, setCatalog] = useState<FormulaCatalog>({ tableId, columns: [], relations: [] })
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [focusId, setFocusId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [menu, setMenu] = useState<{ id: string; span: BracketSpan; rect: DOMRect } | null>(null)

  useEffect(() => {
    let cancelled = false
    void api.request<CatalogResponse>(`/tables/${tableId}/formula-catalog`).then((result) => {
      if (cancelled) return
      const bracket = bracketCatalog(tableId, result)
      setCatalog(editorCatalog(tableId, result))
      const seeded = rulesRef.current.length > 0 ? rulesRef.current.map((rule) => ({
        id: rule.id,
        source: sourceFor(rule, bracket),
        color: keptColor(rule.style.color),
        background: keptColor(rule.style.background),
      })) : [{ id: crypto.randomUUID(), source: freshRule, color: null, background: null }]
      setDrafts(seeded)
      setFocusId(seeded.length === 1 && seeded[0].source === freshRule ? seeded[0].id : null)
    }).catch(() => {
      if (cancelled) return
      setDrafts(rulesRef.current.length > 0 ? rulesRef.current.map((rule) => ({
        id: rule.id,
        source: rule.expression ?? expressionFromOperator(rule) ?? '',
        color: keptColor(rule.style.color),
        background: keptColor(rule.style.background),
      })) : [{ id: crypto.randomUUID(), source: freshRule, color: null, background: null }])
    })
    return () => {
      cancelled = true
    }
  }, [columnId, tableId])

  useEffect(() => {
    if (!drafts) return
    const handle = setTimeout(() => {
      for (const draft of drafts) {
        if (!draft.source.trim() || unfinished(draft.source)) {
          setErrors((current) => ({ ...current, [draft.id]: '' }))
          continue
        }
        void api.request(`/tables/${tableId}/conditions/compile`, {
          method: 'POST',
          body: JSON.stringify({ expression: draft.source }),
        }).then(() => {
          setErrors((current) => ({ ...current, [draft.id]: '' }))
        }).catch((caught: unknown) => {
          const message = caught instanceof ApiClientError ? caught.message : t('error')
          setErrors((current) => ({ ...current, [draft.id]: message }))
        })
      }
    }, 300)
    return () => clearTimeout(handle)
  }, [drafts, t, tableId])

  function update(id: string, patch: Partial<Draft>) {
    setDrafts((current) => current?.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)) ?? current)
  }

  function move(index: number, delta: number) {
    setDrafts((current) => {
      if (!current) return current
      const target = index + delta
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  async function save() {
    if (!drafts || saving) return
    const nextErrors: Record<string, string> = {}
    const ready: ConditionDraft[] = []
    for (const draft of drafts) {
      if (!draft.source.trim() || unfinished(draft.source)) {
        nextErrors[draft.id] = t('conditionRequired')
        continue
      }
      if (!draft.color && !draft.background) {
        nextErrors[draft.id] = t('conditionNeedsColor')
        continue
      }
      try {
        await api.request(`/tables/${tableId}/conditions/compile`, {
          method: 'POST',
          body: JSON.stringify({ expression: draft.source }),
        })
        ready.push({ id: draft.id, expression: draft.source, color: draft.color, background: draft.background })
      } catch (caught) {
        nextErrors[draft.id] = caught instanceof ApiClientError ? caught.message : t('error')
      }
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean) || ready.length !== drafts.length) return
    setSaving(true)
    try {
      await onSave(ready)
    } catch (caught) {
      setErrors((current) => ({ ...current, form: caught instanceof ApiClientError ? caught.message : t('error') }))
      setSaving(false)
    }
  }

  const title = rowLabel ? `${t('conditionalColor')} · ${columnName} · ${rowLabel}` : `${t('conditionalColor')} · ${columnName}`

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(40rem,calc(100vh-2rem))] w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border border-border bg-card shadow-md">
          <div className="shrink-0 space-y-3 px-4 pt-4">
            <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              {t('firstRuleWins')} {t('conditionExamples')}
              {rowLabel ? ` ${t('cellRulesReplace')}` : ''}
            </Dialog.Description>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <div className="flex min-h-40 flex-col gap-3 pb-3">
            {drafts?.map((draft, index) => (
              <div key={draft.id} className="flex flex-col gap-2 border border-border p-2">
                <div className="min-h-10">
                  <FormulaEditor
                    ref={(handle) => {
                      editors.current.set(draft.id, handle)
                    }}
                    initialValue={draft.source}
                    catalog={catalog}
                    columnId={columnId}
                    label={t('condition')}
                    compact
                    autoFocus={draft.id === focusId}
                    onChange={(source) => update(draft.id, { source })}
                    onBadge={(span, rect) => setMenu({ id: draft.id, span, rect })}
                  />
                </div>
                {errors[draft.id] ? <p className="text-sm text-danger">{errors[draft.id]}</p> : <p className="h-5 text-sm" />}
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm">{t('textColor')}</span>
                    <Swatches role="text" label={t('textColor')} value={draft.color} onPick={(color) => update(draft.id, { color })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm">{t('backgroundColor')}</span>
                    <Swatches role="background" label={t('backgroundColor')} value={draft.background} onPick={(color) => update(draft.id, { background: color })} />
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <Button type="button" variant="outline" aria-label={t('moveUp')} disabled={index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button type="button" variant="outline" aria-label={t('moveDown')} disabled={!drafts || index === drafts.length - 1} onClick={() => move(index, 1)}>
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={t('removeRule')}
                      onClick={() => setDrafts((current) => current?.filter((item) => item.id !== draft.id) ?? current)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            </div>
            {errors.form ? <p className="pb-3 text-sm text-danger">{errors.form}</p> : null}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const id = crypto.randomUUID()
                setFocusId(id)
                setDrafts((current) => [...(current ?? []), { id, source: freshRule, color: null, background: null }])
              }}
            >
              <Plus className="size-4" />
              {t('addRule')}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>{t('cancel')}</Button>
              <Button type="button" onClick={() => void save()} disabled={saving || !drafts}>{t('confirm')}</Button>
            </div>
          </div>
          {menu ? (
            <BadgeChoices
              rect={menu.rect}
              catalog={catalog}
              tableId={tableId}
              onPick={(text) => {
                editors.current.get(menu.id)?.replace(menu.span.from, menu.span.to, text)
                setMenu(null)
              }}
              onClose={() => setMenu(null)}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function BadgeChoices({
  rect,
  catalog,
  tableId,
  onPick,
  onClose,
}: {
  rect: DOMRect
  catalog: FormulaCatalog
  tableId: string
  onPick: (text: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Element && target.closest('[data-condition-badge]')) return
      onClose()
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [onClose])
  const columns = catalog.columns.filter((column) => column.tableId === tableId)
  const width = Math.min(240, window.innerWidth - 16)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  const top = rect.bottom + 8
  return createPortal(
    <div
      data-condition-badge=""
      className="fixed z-[80] flex max-h-60 w-60 flex-col overflow-auto border border-border bg-card p-1 shadow-md"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {columns.map((column) => (
        <button
          key={column.columnId}
          type="button"
          className="px-2 py-1 text-left text-sm hover:bg-accent"
          onClick={() => onPick(thisRowReference(column.columnName))}
        >
          {column.columnName}
        </button>
      ))}
    </div>,
    document.body,
  )
}
