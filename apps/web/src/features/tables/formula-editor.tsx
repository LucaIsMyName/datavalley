import { autocompletion, pickedCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { EditorState, Prec } from '@codemirror/state'
import { Decoration, EditorView, keymap, tooltips, ViewPlugin, WidgetType, drawSelection, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { ApiClientError, type RowRecord } from '@datavalley/api-client'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { api } from '../../lib/api'
import { FORMULA_HELP } from './formula-help'
import { cellReference } from './formula-insert'
import {
  adjacentBracket,
  applyCompletion,
  badgeLabel,
  bracketSpans,
  changeBreaksBracket,
  completionAt,
  rowText,
  type BracketSpan,
  type CompletionDecision,
  type FormulaCatalog,
  type FormulaOption,
} from './formula-tokens'

export type FormulaEditorHandle = {
  replace: (from: number, to: number, text: string) => void
}

type FormulaEditorProps = {
  initialValue: string
  catalog: FormulaCatalog
  columnId: string
  label: string
  onChange: (value: string) => void
  onBadge: (span: BracketSpan, rect: DOMRect) => void
}

const NAMES = new Set(FORMULA_HELP.map((item) => item.name))

const formulaLanguage = StreamLanguage.define<{ quote: boolean }>({
  startState: () => ({ quote: false }),
  copyState: (state) => ({ quote: state.quote }),
  token(stream, state) {
    if (state.quote) {
      while (!stream.eol()) {
        const ch = stream.next()
        if (ch === '"' && stream.peek() === '"') {
          stream.next()
          continue
        }
        if (ch === '\\' && stream.peek() === '"') {
          stream.next()
          continue
        }
        if (ch === '"') {
          state.quote = false
          break
        }
      }
      return 'string'
    }
    if (stream.eatSpace()) return null
    if (stream.peek() === '"') {
      stream.next()
      state.quote = true
      while (!stream.eol()) {
        const ch = stream.next()
        if (ch === '"' && stream.peek() === '"') {
          stream.next()
          continue
        }
        if (ch === '\\' && stream.peek() === '"') {
          stream.next()
          continue
        }
        if (ch === '"') {
          state.quote = false
          break
        }
      }
      return 'string'
    }
    if (stream.match(/^(?:<=|>=|<>|[+\-*/%=<>&])/)) return 'operator'
    if (stream.match(/^\d+(?:\.\d+)?/)) return 'number'
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      const word = stream.current().toUpperCase()
      return NAMES.has(word) || word === 'IT' ? 'keyword' : null
    }
    if (stream.peek() === '[') {
      stream.next()
      while (!stream.eol() && stream.peek() !== ']') stream.next()
      if (stream.peek() === ']') stream.next()
      return null
    }
    stream.next()
    return null
  },
  tokenTable: {
    string: tags.string,
    number: tags.number,
    operator: tags.operator,
    keyword: tags.keyword,
  },
})

const formulaHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.string, color: 'var(--primary)' },
  { tag: tags.number, color: 'var(--danger)' },
  { tag: tags.operator, color: 'var(--muted-foreground)' },
  { tag: tags.keyword, color: 'var(--primary)', fontWeight: '600' },
]))

const formulaTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--card)',
    color: 'var(--foreground)',
    fontSize: '13px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    lineHeight: '1.5',
  },
  '.cm-content': { padding: '8px 0', caretColor: 'var(--foreground)' },
  '.cm-line': { padding: '0 8px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--accent)' },
  '.cm-formula-badge': {
    display: 'inline-block',
    margin: '0 1px',
    padding: '0 0.4rem',
    borderRadius: '999px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--accent)',
    color: 'var(--foreground)',
    fontSize: '12px',
    lineHeight: '1.45',
    cursor: 'pointer',
    verticalAlign: 'baseline',
  },
})

class BadgeWidget extends WidgetType {
  constructor(readonly span: BracketSpan) {
    super()
  }

  eq(other: WidgetType) {
    return other instanceof BadgeWidget && other.span.from === this.span.from && other.span.to === this.span.to && other.span.body === this.span.body
  }

  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-formula-badge'
    el.textContent = badgeLabel(this.span.body)
    el.dataset.from = String(this.span.from)
    el.dataset.to = String(this.span.to)
    el.setAttribute('role', 'button')
    return el
  }

  ignoreEvent() {
    return false
  }
}

function badgeDecorations(doc: string): DecorationSet {
  const ranges = bracketSpans(doc).map((span) => Decoration.replace({
    widget: new BadgeWidget(span),
    inclusive: false,
  }).range(span.from, span.to))
  return Decoration.set(ranges, true)
}

function badgeElement(event: Event) {
  const target = event.target
  if (!(target instanceof Element)) return null
  const badge = target.closest('.cm-formula-badge')
  return badge instanceof HTMLElement ? badge : null
}

function deleteBracket(key: 'Backspace' | 'Delete') {
  return (view: EditorView) => {
    const selection = view.state.selection.main
    if (!selection.empty) return false
    const span = adjacentBracket(view.state.doc.toString(), selection.head, key)
    if (!span) return false
    view.dispatch({
      changes: { from: span.from, to: span.to },
      selection: { anchor: span.from },
      userEvent: key === 'Backspace' ? 'delete.backward' : 'delete.forward',
    })
    return true
  }
}

function toCompletion(item: FormulaOption): Completion {
  const completion: Completion & { applyText: string } = {
    label: item.label,
    detail: item.detail,
    type: item.apply.endsWith('()') ? 'function' : 'variable',
    applyText: item.apply,
    apply(view, picked, from, to) {
      const next = applyCompletion(view.state.doc.toString(), from, to, item)
      view.dispatch({
        changes: { from, to, insert: item.apply },
        selection: { anchor: next.cursor },
        scrollIntoView: true,
        userEvent: 'input.complete',
        annotations: pickedCompletion.of(picked),
      })
    },
  }
  return completion
}

async function rowOptions(decision: Extract<CompletionDecision, { kind: 'rows' }>) {
  const params = new URLSearchParams({ limit: '50' })
  const prefix = decision.prefix.trim()
  if (prefix && !/^\d+$/.test(prefix)) params.set('q', prefix)
  const result = await api.request<{ rows: RowRecord[] }>(`/tables/${decision.tableId}/rows?${params}`)
  const rows = /^\d+$/.test(prefix)
    ? result.rows.filter((row) => String(row.rowNumber).startsWith(prefix))
    : result.rows
  const items = rows.map((row) => {
    const apply = cellReference(decision.tableName, decision.columnName, row.rowNumber)
    return { label: `#${row.rowNumber} ${rowText(row)}`.trim(), apply, cursor: apply.length }
  })
  if (/^\d+$/.test(prefix)) {
    const apply = cellReference(decision.tableName, decision.columnName, Number(prefix))
    if (!items.some((item) => item.apply === apply)) items.unshift({ label: `#${prefix}`, apply, cursor: apply.length })
  }
  return items
}

export const FormulaEditor = forwardRef<FormulaEditorHandle, FormulaEditorProps>(function FormulaEditor({
  initialValue,
  catalog,
  columnId,
  label,
  onChange,
  onBadge,
}, ref) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const initialRef = useRef(initialValue)
  const catalogRef = useRef(catalog)
  const columnIdRef = useRef(columnId)
  const onChangeRef = useRef(onChange)
  const onBadgeRef = useRef(onBadge)
  const labelRef = useRef(label)
  catalogRef.current = catalog
  columnIdRef.current = columnId
  onChangeRef.current = onChange
  onBadgeRef.current = onBadge
  labelRef.current = label

  useImperativeHandle(ref, () => ({
    replace(from, to, text) {
      const view = viewRef.current
      if (!view) return
      const current = view.state.doc.sliceString(from, to)
      if (!current.startsWith('[')) return
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      })
    },
  }), [])

  const extensions = useMemo(() => {
    const badges = ViewPlugin.fromClass(class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = badgeDecorations(view.state.doc.toString())
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) this.decorations = badgeDecorations(update.state.doc.toString())
      }
    }, {
      decorations: (plugin) => plugin.decorations,
      provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
      eventHandlers: {
        mousedown(event, view) {
          const badge = badgeElement(event)
          if (!badge) return false
          event.preventDefault()
          event.stopPropagation()
          const from = Number(badge.dataset.from)
          const to = Number(badge.dataset.to)
          const span = bracketSpans(view.state.doc.toString()).find((item) => item.from === from && item.to === to)
          if (span) onBadgeRef.current(span, badge.getBoundingClientRect())
          view.focus()
          return true
        },
        click(event) {
          if (!badgeElement(event)) return false
          event.preventDefault()
          event.stopPropagation()
          return true
        },
      },
    })

    const complete = async (context: CompletionContext): Promise<CompletionResult | null> => {
      const decision = completionAt(context.state.doc.toString(), context.pos, catalogRef.current, context.explicit, columnIdRef.current)
      if (!decision) return null
      if (decision.kind === 'rows') {
        try {
          const items = await rowOptions(decision)
          if (items.length === 0) return null
          return { from: decision.from, options: items.map(toCompletion), filter: false }
        } catch (caught) {
          if (caught instanceof ApiClientError) return null
          return null
        }
      }
      return {
        from: decision.from,
        options: decision.items.map(toCompletion),
        filter: false,
      }
    }

    return [
      formulaLanguage,
      formulaHighlight,
      formulaTheme,
      EditorView.lineWrapping,
      drawSelection(),
      history(),
      EditorView.contentAttributes.of({ 'aria-label': labelRef.current, spellcheck: 'false' }),
      tooltips({ parent: document.body }),
      autocompletion({
        override: [complete],
        activateOnCompletion: (completion) => {
          const text = 'applyText' in completion && typeof completion.applyText === 'string' ? completion.applyText : ''
          return text.length > 0 && !text.endsWith(']')
        },
      }),
      badges,
      Prec.highest(keymap.of([
        { key: 'Backspace', run: deleteBracket('Backspace') },
        { key: 'Delete', run: deleteBracket('Delete') },
      ])),
      keymap.of([...historyKeymap, ...defaultKeymap]),
      EditorState.transactionFilter.of((tr) => {
        if (!tr.docChanged) return tr
        const source = tr.startState.doc.toString()
        let reject = false
        tr.changes.iterChanges((from, to) => {
          if (changeBreaksBracket(source, from, to)) reject = true
        })
        return reject ? [] : tr
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString())
      }),
    ]
  }, [])

  useEffect(() => {
    const parent = host.current
    if (!parent) return
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: initialRef.current, extensions }),
    })
    viewRef.current = view
    view.focus()
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [extensions])

  return (
    <div className="h-full overflow-hidden rounded-md border border-border">
      <div ref={host} className="h-full" />
    </div>
  )
})
