import * as Dialog from '@radix-ui/react-dialog'
import { useQueryClient } from '@tanstack/react-query'
import type { CatalogItem, Column, MediaFile, RowRecord } from '@datavalley/api-client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { sync } from '../../lib/sync'
import { mapCachedRows, readCachedRow } from './cache'
import { showEditError } from './grid-edit'
import { notesAfterFailure, saveNotes } from './notes-save'
import { applyStashedNotes } from '../realtime/apply'
import { setNotesEditing, takeStashedNotes } from '../realtime/editing'
import { PresenceChip } from '../realtime/presence-chip'
import { reportPresence, usePresencePeople } from '../realtime/presence-store'
import { isNotesBlockMenuTarget, isNotesDialogOutsideTarget } from './notes-dialog-outside'
import { NotesRowFields } from './notes-row-fields'
import type { TableReadOnlyReason } from './table-read-only'
import { useRowCellEdit } from './use-row-cell-edit'
import {
  applyBlockShortcutOnInput,
  clampMenuPosition,
  enterFromBlock,
  insertBlock,
  parseInlineMarkdown,
  parseNotes,
  removeBlock,
  serializeNotes,
  turnBlockInto,
  type NoteBlock,
  type TurnIntoType,
} from './note-blocks'

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

function InlineContent({ text }: { text: string }) {
  const parts = parseInlineMarkdown(text)
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === 'bold') return <strong key={index}>{part.value}</strong>
        if (part.kind === 'italic') return <em key={index}>{part.value}</em>
        if (part.kind === 'code') {
          return (
            <code key={index} className="rounded bg-muted px-1 font-mono text-[0.9em]">
              {part.value}
            </code>
          )
        }
        if (part.kind === 'link') {
          return (
            <a key={index} href={part.href} className="text-primary underline" target="_blank" rel="noreferrer">
              {part.label}
            </a>
          )
        }
        return <span key={index}>{part.value}</span>
      })}
    </>
  )
}

function blockClassName(block: NoteBlock): string {
  switch (block.type) {
    case 'heading':
      switch (block.level) {
        case 1:
          return 'text-2xl font-semibold leading-tight'
        case 2:
          return 'text-xl font-semibold leading-snug'
        case 3:
          return 'text-lg font-semibold'
        case 4:
          return 'text-base font-semibold'
        case 5:
          return 'text-sm font-semibold uppercase tracking-wide'
        case 6:
          return 'text-sm font-medium text-muted-foreground'
        default:
          return 'text-lg font-semibold'
      }
    case 'quote':
      return 'border-l-2 border-border pl-3 text-muted-foreground italic'
    case 'code':
      return 'font-mono text-sm whitespace-pre-wrap rounded border border-border bg-muted/40 p-2'
    default:
      return 'text-sm leading-6'
  }
}

function BlockTag({
  block,
  number,
  readOnly,
  onToggleTodo,
}: {
  block: NoteBlock
  number?: number
  readOnly: boolean
  onToggleTodo?: () => void
}) {
  const { t } = useTranslation()
  if (block.type === 'bullet') {
    return <span className="mt-0.5 w-4 shrink-0 text-muted-foreground">•</span>
  }
  if (block.type === 'numbered') {
    return <span className="mt-0.5 w-6 shrink-0 text-muted-foreground">{number ?? 1}.</span>
  }
  if (block.type === 'todo') {
    return (
      <Checkbox
        checked={Boolean(block.checked)}
        className="mt-1 shrink-0"
        aria-label={t('notesTodo')}
        disabled={readOnly}
        onCheckedChange={() => onToggleTodo?.()}
      />
    )
  }
  return null
}

function activateBlock(readOnly: boolean, onActivate: () => void) {
  if (readOnly) return
  onActivate()
}

function BlockText({ text }: { text: string }) {
  if (!text) return <span className="text-muted-foreground">{'\u00a0'}</span>
  return <InlineContent text={text} />
}

function EditableBlock({
  block,
  readOnly,
  active,
  onActivate,
  onTextChange,
  onKeyDown,
}: {
  block: NoteBlock
  readOnly: boolean
  active: boolean
  onActivate: () => void
  onTextChange: (text: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const node = areaRef.current
    if (!active || !node) return
    node.style.height = '0px'
    node.style.height = `${node.scrollHeight}px`
  }, [active, block.id, block.text, block.type])

  useLayoutEffect(() => {
    if (!active) return
    const node = areaRef.current
    if (!node) return
    node.focus()
    const end = node.value.length
    node.setSelectionRange(end, end)
  }, [active, block.id])

  if (block.type === 'divider') {
    return <hr className="my-2 border-border" />
  }

  const className = `${blockClassName(block)} min-h-6 min-w-0 flex-1`

  if (readOnly || !active) {
    if (block.type === 'heading') {
      const level = Math.min(6, Math.max(1, block.level ?? 1)) - 1
      const Tag = HEADING_TAGS[level]
      return (
        <Tag className={className} onClick={() => activateBlock(readOnly, onActivate)}>
          <BlockText text={block.text} />
        </Tag>
      )
    }
    if (block.type === 'code') {
      return (
        <pre className={className} onClick={() => activateBlock(readOnly, onActivate)}>
          <code>{block.text || '\u00a0'}</code>
        </pre>
      )
    }
    return (
      <div className={className} onClick={() => activateBlock(readOnly, onActivate)}>
        <BlockText text={block.text} />
      </div>
    )
  }

  return (
    <textarea
      ref={areaRef}
      autoFocus
      value={block.text}
      rows={1}
      className={`${className} resize-none overflow-hidden bg-transparent outline-none`}
      onChange={(event) => onTextChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  )
}

const TURN_INTO_OPTIONS: { type: TurnIntoType; labelKey: string }[] = [
  { type: 'paragraph', labelKey: 'notesBlockText' },
  { type: 'heading-1', labelKey: 'notesBlockH1' },
  { type: 'heading-2', labelKey: 'notesBlockH2' },
  { type: 'heading-3', labelKey: 'notesBlockH3' },
  { type: 'heading-4', labelKey: 'notesBlockH4' },
  { type: 'heading-5', labelKey: 'notesBlockH5' },
  { type: 'heading-6', labelKey: 'notesBlockH6' },
  { type: 'bullet', labelKey: 'notesBlockBullet' },
  { type: 'numbered', labelKey: 'notesBlockNumbered' },
  { type: 'todo', labelKey: 'notesBlockTodo' },
  { type: 'quote', labelKey: 'notesBlockQuote' },
  { type: 'code', labelKey: 'notesBlockCode' },
  { type: 'divider', labelKey: 'notesBlockDivider' },
]

export function NotesBlockEditor({
  rowId,
  markdown,
  readOnly,
  onChange,
  onFocusChange,
}: {
  rowId: string
  markdown: string
  readOnly: boolean
  onChange: (next: string) => void
  onFocusChange: (focused: boolean) => void
}) {
  const { t } = useTranslation()
  const [blocks, setBlocks] = useState(() => parseNotes(markdown))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ blockId: string; x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const blocksRef = useRef(blocks)
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el || !menu) return
    const placed = clampMenuPosition({
      x: menu.x,
      y: menu.y,
      width: el.offsetWidth,
      height: el.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
    el.style.left = `${placed.left}px`
    el.style.top = `${placed.top}px`
    el.style.maxHeight = `${placed.maxHeight}px`
  }, [menu])
  useEffect(() => {
    if (!menu) return
    function close(event: Event) {
      if (isNotesBlockMenuTarget(event.target)) return
      setMenu(null)
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])
  blocksRef.current = blocks
  const editingRef = useRef(false)
  const emittedRef = useRef(markdown)
  const rowIdRef = useRef(rowId)

  useEffect(() => {
    const rowChanged = rowIdRef.current !== rowId
    rowIdRef.current = rowId
    if (rowChanged) {
      emittedRef.current = markdown
      editingRef.current = false
      setBlocks(parseNotes(markdown))
      setActiveId(null)
      return
    }
    if (markdown === emittedRef.current) return
    if (editingRef.current) return
    emittedRef.current = markdown
    setBlocks(parseNotes(markdown))
    setActiveId(null)
  }, [rowId, markdown])

  const commit = useCallback(
    (nextBlocks: NoteBlock[]) => {
      const serialized = serializeNotes(nextBlocks)
      emittedRef.current = serialized
      blocksRef.current = nextBlocks
      setBlocks(nextBlocks)
      onChange(serialized)
    },
    [onChange],
  )

  function handleTextChange(id: string, rawText: string) {
    const current = blocksRef.current.find((b) => b.id === id)
    if (!current) return
    const shortcut = applyBlockShortcutOnInput(current, rawText)
    const nextBlock = shortcut.consumed
      ? { ...shortcut.block, id: current.id }
      : { ...current, text: rawText }
    commit(blocksRef.current.map((b) => (b.id === id ? nextBlock : b)))
  }

  function handleKeyDown(id: string, event: KeyboardEvent<HTMLTextAreaElement>) {
    const index = blocksRef.current.findIndex((b) => b.id === id)
    const block = blocksRef.current[index]
    if (!block) return

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      const result = enterFromBlock(block)
      if (result.kind === 'replace') {
        commit(blocksRef.current.map((item) => (item.id === id ? result.block : item)))
        setActiveId(result.block.id)
        return
      }
      commit(insertBlock(blocksRef.current, index + 1, result.block))
      setActiveId(result.block.id)
      return
    }

    if (event.key === 'Backspace' && block.text === '') {
      event.preventDefault()
      if (blocksRef.current.length <= 1) return
      const prev = blocksRef.current[index - 1]
      commit(removeBlock(blocksRef.current, id))
      if (prev) setActiveId(prev.id)
    }
  }

  function openMenu(blockId: string, event: MouseEvent) {
    if (readOnly) return
    event.preventDefault()
    setMenu({ blockId, x: event.clientX, y: event.clientY })
  }

  function turnInto(id: string, target: TurnIntoType) {
    const block = blocksRef.current.find((b) => b.id === id)
    if (!block) return
    const next = turnBlockInto(block, target)
    commit(blocksRef.current.map((b) => (b.id === id ? next : b)))
    setActiveId(next.type === 'divider' ? null : next.id)
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-0 overflow-auto"
      onFocus={() => {
        editingRef.current = true
        onFocusChange(true)
      }}
      onBlur={(event) => {
        const related = event.relatedTarget
        if (event.currentTarget.contains(related as Node | null)) return
        if (isNotesBlockMenuTarget(related)) return
        editingRef.current = false
        setActiveId(null)
        onFocusChange(false)
      }}
    >
      {blocks.map((block, index) => (
        <div
          key={block.id}
          className="group/row flex items-start gap-0.5 py-0.5"
          onContextMenu={(event) => openMenu(block.id, event)}
        >
            <BlockTag
              block={block}
              number={blocks.slice(0, index + 1).filter((item) => item.type === 'numbered').length}
              readOnly={readOnly}
              onToggleTodo={() => {
                commit(
                  blocksRef.current.map((b) =>
                    b.id === block.id && b.type === 'todo' ? { ...b, checked: !b.checked } : b,
                  ),
                )
              }}
            />
            <EditableBlock
              block={block}
              readOnly={readOnly}
              active={activeId === block.id}
              onActivate={() => setActiveId(block.id)}
              onTextChange={(text) => handleTextChange(block.id, text)}
              onKeyDown={(event) => handleKeyDown(block.id, event)}
            />
        </div>
      ))}
      {menu && !readOnly
        ? createPortal(
            <div
              ref={menuRef}
              data-notes-block-menu=""
              className="fixed z-[60] min-w-44 overflow-auto border border-border bg-card p-1 shadow-md"
              style={{ left: menu.x, top: menu.y }}
              onMouseDown={(event) => event.preventDefault()}
            >
              {TURN_INTO_OPTIONS.map((option) => (
                <button
                  key={option.labelKey}
                  type="button"
                  className="flex min-h-9 w-full items-center px-2 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    turnInto(menu.blockId, option.type)
                    setMenu(null)
                  }}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export function NotesDrawer({
  tableId,
  row,
  columns,
  tags,
  statuses,
  members,
  readOnly,
  readOnlyReason,
  onMediaLibrary,
  onMediaPreview,
  onMediaRequestUpload,
  mediaUploadingKey,
  onDateMode,
  onCreated,
  onOptionChange,
  onOpenFormula,
  onClose,
  tables = [],
}: {
  tableId: string
  row: RowRecord | null
  columns: Column[]
  tags: CatalogItem[]
  statuses: CatalogItem[]
  members: { userId: string; username: string }[]
  readOnly: boolean
  readOnlyReason: TableReadOnlyReason
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
  onClose: () => void
  tables?: { id: string; icon: string }[]
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const people = usePresencePeople()
  const noteDraft = row
    ? people.find((person) => person.focus?.kind === 'notes' && person.focus.rowId === row.id && person.focus.tableId === tableId && person.draft != null)?.draft
    : undefined
  const [text, setText] = useState(row?.notes ?? '')
  const focused = useRef(false)
  const baseline = useRef(row?.notes ?? '')

  const cellEdit = useRowCellEdit({
    tableId,
    readOnly,
    readOnlyReason,
    getRow: (rowId) => readCachedRow(queryClient, tableId, rowId) ?? (row?.id === rowId ? row : undefined),
  })

  useEffect(() => {
    if (focused.current) return
    const next = noteDraft ?? row?.notes ?? ''
    setText(next)
    if (noteDraft == null) baseline.current = row?.notes ?? ''
  }, [noteDraft, row?.id, row?.notes])

  function flushRowEdits(rowId: string) {
    for (const column of columns) {
      void sync.flush(`cell:${rowId}:${column.id}`)
    }
    void sync.flush(`row:${rowId}:notes`)
  }

  function schedule(next: string) {
    if (!row || readOnly) return
    const rowId = row.id
    reportPresence({
      tableId,
      focus: { kind: 'notes', tableId, rowId },
      editing: true,
      draft: next,
    })
    const version = row.version
    sync.edit(`row:${rowId}:notes`, {
      draft: next,
      delay: 300,
      apply: () => undefined,
      commit: async (draft) => {
        const current = readCachedRow(queryClient, tableId, rowId)
        return saveNotes(queryClient, tableId, rowId, current?.version ?? version, draft)
      },
      accept: (saved) => {
        takeStashedNotes(saved.id)
        baseline.current = saved.notes
        mapCachedRows(queryClient, tableId, (item) =>
          item.id === saved.id ? { ...item, notes: saved.notes, version: saved.version } : item,
        )
      },
      rollback: (reason) => {
        const outcome = notesAfterFailure(reason, baseline.current)
        if (outcome.conflict) {
          baseline.current = outcome.notes
          setText(outcome.notes)
          showEditError(t('versionConflict'))
          return
        }
        setText(baseline.current)
        mapCachedRows(queryClient, tableId, (item) =>
          item.id === rowId ? { ...item, notes: baseline.current } : item,
        )
      },
    })
  }

  return (
    <Dialog.Root
      modal={false}
      open={Boolean(row)}
      onOpenChange={(open) => {
        if (!open) {
          if (row) flushRowEdits(row.id)
          onClose()
        }
      }}
    >
      <Dialog.Portal>
        <button
          type="button"
          aria-label={t('close')}
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => {
            if (row) flushRowEdits(row.id)
            onClose()
          }}
        />
        <Dialog.Content
          data-notes-drawer=""
          className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col gap-3 border-l border-border bg-card p-4 shadow-lg"
          onPointerDownOutside={(event) => {
            if (isNotesDialogOutsideTarget(event.target)) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (isNotesDialogOutsideTarget(event.target)) event.preventDefault()
          }}
        >
          <Dialog.Title className="relative text-lg font-semibold">
            {t('notes')}
            <PresenceChip
              people={people.filter((person) => person.focus?.kind === 'notes' && person.focus.rowId === row?.id && person.focus.tableId === tableId)}
              className="absolute left-16 top-1 z-20"
            />
          </Dialog.Title>
          <Dialog.Description className="sr-only">{t('notes')}</Dialog.Description>
          {row ? (
            <>
              <NotesRowFields
                tableId={tableId}
                row={row}
                columns={columns}
                tags={tags}
                statuses={statuses}
                members={members}
                readOnly={readOnly}
                cellEdit={cellEdit}
                onMediaLibrary={onMediaLibrary}
                onMediaPreview={onMediaPreview}
                onMediaRequestUpload={onMediaRequestUpload}
                mediaUploadingKey={mediaUploadingKey}
                onDateMode={onDateMode}
                onCreated={onCreated}
                onOptionChange={onOptionChange}
                onOpenFormula={onOpenFormula}
                tables={tables}
              />
              <NotesBlockEditor
                rowId={row.id}
                markdown={text}
                readOnly={readOnly}
                onChange={(next) => {
                  setText(next)
                  schedule(next)
                }}
                onFocusChange={(next) => {
                  focused.current = next
                  setNotesEditing(row.id, next)
                  if (next) {
                    reportPresence({
                      tableId,
                      focus: { kind: 'notes', tableId, rowId: row.id },
                      editing: true,
                    })
                    return
                  }
                  void sync.flush(`row:${row.id}:notes`).finally(() => {
                    if (!sync.has(`row:${row.id}:notes`)) applyStashedNotes(queryClient, tableId, row.id)
                    reportPresence({ focus: null, editing: false, draft: null })
                  })
                }}
              />
            </>
          ) : null}
          <Dialog.Close asChild>
            <Button type="button" variant="outline" className="self-end">
              {t('close')}
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
