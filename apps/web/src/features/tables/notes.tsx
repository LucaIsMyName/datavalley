import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useQueryClient } from '@tanstack/react-query'
import type { CatalogItem, Column, RowRecord } from '@datavalley/api-client'
import { MoreHorizontal, Plus } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { api } from '../../lib/api'
import { sync } from '../../lib/sync'
import { mapCachedRows, readCachedRow } from './cache'
import { buildNoteFieldLines } from './note-fields'
import {
  applyBlockShortcutOnInput,
  emptyParagraphBlock,
  insertBlock,
  newBlockId,
  nextBlockType,
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
  readOnly,
  onToggleTodo,
}: {
  block: NoteBlock
  readOnly: boolean
  onToggleTodo?: () => void
}) {
  const { t } = useTranslation()
  if (block.type === 'bullet') {
    return <span className="mt-0.5 w-4 shrink-0 text-muted-foreground">•</span>
  }
  if (block.type === 'numbered') {
    return <span className="mt-0.5 w-4 shrink-0 text-muted-foreground">1.</span>
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

function beginBlockEdit(event: ReactMouseEvent, readOnly: boolean, onActivate: () => void) {
  if (readOnly) return
  event.preventDefault()
  onActivate()
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
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const seeded = useRef(false)

  useEffect(() => {
    if (!active) {
      seeded.current = false
      return
    }
    const node = ref.current
    if (!node || seeded.current) return
    node.textContent = block.text
    seeded.current = true
    requestAnimationFrame(() => {
      node.focus()
      const range = document.createRange()
      range.selectNodeContents(node)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    })
  }, [active, block.id, block.text, block.type])

  const surfaceKey = `${block.id}-${active ? 'edit' : 'view'}`

  if (block.type === 'divider') {
    return <hr className="my-2 border-border" />
  }

  if (readOnly || !active) {
    const className = `${blockClassName(block)} min-w-0 flex-1 outline-none`
    if (block.type === 'heading') {
      const level = Math.min(6, Math.max(1, block.level ?? 1)) - 1
      const Tag = HEADING_TAGS[level]
      return (
        <Tag
          key={surfaceKey}
          className={className}
          onMouseDown={(event) => beginBlockEdit(event, readOnly, onActivate)}
        >
          <InlineContent text={block.text} />
        </Tag>
      )
    }
    if (block.type === 'code') {
      return (
        <pre
          key={surfaceKey}
          className={className}
          onMouseDown={(event) => beginBlockEdit(event, readOnly, onActivate)}
        >
          <code>{block.text}</code>
        </pre>
      )
    }
    return (
      <div
        key={surfaceKey}
        className={className}
        onMouseDown={(event) => beginBlockEdit(event, readOnly, onActivate)}
      >
        <InlineContent text={block.text} />
      </div>
    )
  }

  return (
    <div
      key={surfaceKey}
      ref={ref}
      role="textbox"
      contentEditable
      suppressContentEditableWarning
      className={`${blockClassName(block)} min-w-0 flex-1 outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]`}
      data-placeholder=""
      onInput={() => {
        const next = ref.current?.textContent ?? ''
        onTextChange(next)
      }}
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

function NotesBlockEditor({
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
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const editingRef = useRef(false)

  useEffect(() => {
    if (editingRef.current) return
    setBlocks(parseNotes(markdown))
    setActiveId(null)
  }, [rowId, markdown])

  const commit = useCallback(
    (nextBlocks: NoteBlock[]) => {
      blocksRef.current = nextBlocks
      setBlocks(nextBlocks)
      onChange(serializeNotes(nextBlocks))
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

  function handleKeyDown(id: string, event: KeyboardEvent<HTMLDivElement>) {
    const index = blocksRef.current.findIndex((b) => b.id === id)
    const block = blocksRef.current[index]
    if (!block) return

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      const followType = nextBlockType(block.type)
      const created: NoteBlock = { id: newBlockId(), type: followType, text: '' }
      if (followType === 'todo') created.checked = false
      commit(insertBlock(blocksRef.current, index + 1, created))
      setActiveId(created.id)
      return
    }

    if (event.key === 'Backspace' && (block.text === '' || (event.currentTarget.textContent ?? '') === '')) {
      event.preventDefault()
      if (blocksRef.current.length <= 1) return
      const prev = blocksRef.current[index - 1]
      commit(removeBlock(blocksRef.current, id))
      if (prev) setActiveId(prev.id)
    }
  }

  function insertAt(index: number) {
    const created = emptyParagraphBlock()
    commit(insertBlock(blocksRef.current, index, created))
    setActiveId(created.id)
  }

  function turnInto(id: string, target: TurnIntoType) {
    const block = blocksRef.current.find((b) => b.id === id)
    if (!block) return
    commit(blocksRef.current.map((b) => (b.id === id ? turnBlockInto(b, target) : b)))
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-0 overflow-auto"
      onFocus={() => {
        editingRef.current = true
        onFocusChange(true)
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          editingRef.current = false
          setActiveId(null)
          onFocusChange(false)
        }
      }}
    >
      {blocks.map((block, index) => (
        <div key={block.id}>
          {!readOnly ? (
            <div className="group/insert relative h-5 shrink-0">
              <button
                type="button"
                aria-label={t('notesInsertBlock')}
                className="absolute left-0 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover/insert:opacity-100"
                onClick={() => insertAt(index)}
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          ) : null}
          <div className="group/row flex items-start gap-1 py-0.5">
            {!readOnly ? (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    aria-label={t('notesBlockMenu')}
                    className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground opacity-0 hover:bg-accent group-hover/row:opacity-100"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="z-[60] max-h-80 min-w-44 overflow-auto border border-border bg-card p-1 shadow-md"
                    align="start"
                    sideOffset={4}
                  >
                    {TURN_INTO_OPTIONS.map((option) => (
                      <DropdownMenu.Item
                        key={option.labelKey}
                        className="cursor-pointer px-2 py-1.5 text-sm outline-none hover:bg-accent"
                        onSelect={() => turnInto(block.id, option.type)}
                      >
                        {t(option.labelKey)}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            ) : (
              <span className="inline-flex size-6 shrink-0" aria-hidden />
            )}
            <BlockTag
              block={block}
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
        </div>
      ))}
      {!readOnly ? (
        <div className="group/insert relative h-5 shrink-0">
          <button
            type="button"
            aria-label={t('notesInsertBlock')}
            className="absolute left-0 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover/insert:opacity-100"
            onClick={() => insertAt(blocks.length)}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      ) : null}
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
  onClose,
}: {
  tableId: string
  row: RowRecord | null
  columns: Column[]
  tags: CatalogItem[]
  statuses: CatalogItem[]
  members: { userId: string; username: string }[]
  readOnly: boolean
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [text, setText] = useState(row?.notes ?? '')
  const focused = useRef(false)
  const baseline = useRef(row?.notes ?? '')

  useEffect(() => {
    if (focused.current) return
    setText(row?.notes ?? '')
    baseline.current = row?.notes ?? ''
  }, [row?.id, row?.notes])

  const fieldLines = useMemo(() => {
    if (!row) return []
    return buildNoteFieldLines(columns, row, i18n.language, { tags, statuses, members }, {
      yes: t('yes'),
      no: t('no'),
      empty: '—',
      mediaCount: (count) => t('notesMediaCount', { count }),
    })
  }, [columns, row, i18n.language, tags, statuses, members, t])

  function schedule(next: string) {
    if (!row || readOnly) return
    const rowId = row.id
    const version = row.version
    sync.edit(`row:${rowId}:notes`, {
      draft: next,
      delay: 300,
      apply: () => undefined,
      commit: async (draft) => {
        const current = readCachedRow(queryClient, tableId, rowId)
        const result = await api.request<{ row: RowRecord }>(`/rows/${rowId}`, {
          method: 'PATCH',
          body: JSON.stringify({ version: current?.version ?? version, cells: {}, notes: draft }),
        })
        return result.row
      },
      accept: (saved) => {
        baseline.current = saved.notes
        mapCachedRows(queryClient, tableId, (item) =>
          item.id === saved.id ? { ...item, notes: saved.notes, version: saved.version } : item,
        )
      },
      rollback: () => {
        setText(baseline.current)
        mapCachedRows(queryClient, tableId, (item) =>
          item.id === rowId ? { ...item, notes: baseline.current } : item,
        )
      },
    })
  }

  return (
    <Dialog.Root
      open={Boolean(row)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <Dialog.Content className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col gap-3 border-l border-border bg-card p-4 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">{t('notes')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('notes')}</Dialog.Description>
          {row ? (
            <>
              <dl className="shrink-0 space-y-1 border-b border-border pb-3 text-sm">
                {fieldLines.map((line) => (
                  <div key={line.name} className="grid grid-cols-[minmax(0,38%)_1fr] gap-2">
                    <dt className="truncate font-medium text-muted-foreground">{line.name}</dt>
                    <dd className="min-w-0 truncate">{line.value}</dd>
                  </div>
                ))}
              </dl>
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
                  if (!next) void sync.flush(`row:${row.id}:notes`)
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
