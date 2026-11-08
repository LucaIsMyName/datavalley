import { Check, Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { deleteColumnOptionApi, patchColumnOption, postColumnOption } from './select-option-api'
import { SelectOptionDeleteButton } from './select-option-delete-button'
import type { ColumnOption } from './select-options-utils'

function stopBubble(event: React.SyntheticEvent) {
  event.stopPropagation()
}

export function SelectOptionCreateFooter({
  value,
  onChange,
  onCreate,
  busy,
}: {
  value: string
  onChange: (value: string) => void
  onCreate: () => void
  busy: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="border-t border-border p-1" onPointerDown={stopBubble} onClick={stopBubble}>
      <div className="flex gap-1">
        <Input
          aria-label={t('newSelectOption')}
          className="h-8 min-w-0 flex-1"
          value={value}
          placeholder={t('newSelectOption')}
          disabled={busy}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            onCreate()
          }}
        />
        <Button type="button" className="h-8 shrink-0 px-2" disabled={busy || !value.trim()} onClick={onCreate}>
          {t('addSelectOption')}
        </Button>
      </div>
    </div>
  )
}

function SelectOptionRow({
  columnId,
  option,
  picked,
  disabled,
  busy,
  onSelect,
  onRenamed,
  onDelete,
}: {
  columnId: string
  option: ColumnOption
  picked: boolean
  disabled?: boolean
  busy?: boolean
  onSelect: () => void
  onRenamed: (option: ColumnOption) => void
  onDelete: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(option.label)
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(option.label)
  }, [option.label, editing])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function commit() {
    const label = draft.trim()
    if (!label || label === option.label) {
      setEditing(false)
      setDraft(option.label)
      return
    }
    setPending(true)
    try {
      const result = await patchColumnOption(columnId, option.id, { label })
      onRenamed(result.option)
      setEditing(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className={`flex min-h-9 min-w-0 items-center gap-0.5  px-1 ${picked ? 'bg-muted' : 'hover:bg-accent'}`}
    >
      <button
        type="button"
        className="flex size-7 shrink-0 items-center justify-center outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        aria-label={option.label}
        disabled={editing}
        onClick={() => {
          if (!editing) onSelect()
        }}
      >
        {picked ? <Check className="size-4" aria-hidden /> : null}
      </button>
      {editing ? (
        <Input
          ref={inputRef}
          aria-label={t('renameSelectOption')}
          className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-1"
          value={draft}
          disabled={pending || busy}
          onPointerDown={stopBubble}
          onClick={stopBubble}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            stopBubble(event)
            if (event.key === 'Escape') {
              event.preventDefault()
              setEditing(false)
              setDraft(option.label)
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              void commit()
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="h-8 min-w-0 flex-1 truncate px-1 text-left"
          onClick={onSelect}
        >
          {option.label}
        </button>
      )}
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-8 shrink-0 px-0"
        disabled={disabled || busy || pending}
        aria-label={t('renameSelectOption')}
        aria-pressed={editing}
        onPointerDown={stopBubble}
        onClick={(event) => {
          stopBubble(event)
          if (editing) {
            void commit()
            return
          }
          setDraft(option.label)
          setEditing(true)
        }}
      >
        <Pencil className="size-3.5" aria-hidden />
      </Button>
      <SelectOptionDeleteButton
        option={option}
        disabled={disabled}
        busy={busy || pending}
        onConfirm={onDelete}
      />
    </div>
  )
}

export function SelectCellOptionsPanel({
  columnId,
  options,
  multiple,
  selectedIds,
  singleSelected,
  disabled,
  createDraft,
  createBusy,
  onCreateDraftChange,
  onCreateOption,
  onOptionChange,
  onToggleMulti,
  onPickSingle,
  onPickNone,
}: {
  columnId: string
  options: ColumnOption[]
  multiple: boolean
  selectedIds: string[]
  singleSelected: string
  disabled?: boolean
  createDraft: string
  createBusy: boolean
  onCreateDraftChange: (value: string) => void
  onCreateOption: () => void
  onOptionChange: (option: ColumnOption, deleted?: boolean) => void
  onToggleMulti: (optionId: string, picked: boolean) => void
  onPickSingle: (optionId: string) => void
  onPickNone: () => void
}) {
  const { t } = useTranslation()
  const [rowBusy, setRowBusy] = useState(false)

  async function deleteOption(option: ColumnOption) {
    setRowBusy(true)
    try {
      await deleteColumnOptionApi(columnId, option.id)
      onOptionChange(option, true)
    } finally {
      setRowBusy(false)
    }
  }

  return (
    <>
      <div className="max-h-60 overflow-auto p-1">
        {!multiple ? (
          <button
            type="button"
            className={`flex min-h-9 w-full items-center gap-0.5 px-1 text-left ${
              singleSelected ? 'hover:bg-accent' : 'bg-muted'
            }`}
            onClick={onPickNone}
          >
            <span className="flex size-7 shrink-0 items-center justify-center">
              {singleSelected ? null : <Check className="size-4" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1 truncate px-1">{t('none')}</span>
          </button>
        ) : null}
        {options.map((option) => {
          const picked = multiple ? selectedIds.includes(option.id) : singleSelected === option.id
          return (
            <SelectOptionRow
              key={option.id}
              columnId={columnId}
              option={option}
              picked={picked}
              disabled={disabled}
              busy={rowBusy || createBusy}
              onSelect={() => {
                if (multiple) onToggleMulti(option.id, picked)
                else onPickSingle(option.id)
              }}
              onRenamed={(next) => onOptionChange(next)}
              onDelete={() => deleteOption(option)}
            />
          )
        })}
      </div>
      <SelectOptionCreateFooter
        value={createDraft}
        onChange={onCreateDraftChange}
        busy={createBusy}
        onCreate={onCreateOption}
      />
    </>
  )
}

export async function createColumnOption(columnId: string, label: string) {
  return postColumnOption(columnId, label)
}
