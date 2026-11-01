import { Check, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { selectDropdownItemClassName } from '../../components/ui/select'
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

function SelectOptionRenameButton({
  columnId,
  option,
  disabled,
  busy,
  onRenamed,
}: {
  columnId: string
  option: ColumnOption
  disabled?: boolean
  busy?: boolean
  onRenamed: (option: ColumnOption) => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(option.label)
  const [pending, setPending] = useState(false)

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

  if (editing) {
    return (
      <Input
        aria-label={t('renameSelectOption')}
        className="h-7 min-w-0 flex-1"
        value={draft}
        disabled={pending || busy}
        autoFocus
        onPointerDown={stopBubble}
        onClick={stopBubble}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
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
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-7 w-7 shrink-0 px-0"
      disabled={disabled || busy}
      aria-label={t('renameSelectOption')}
      onPointerDown={stopBubble}
      onClick={(event) => {
        stopBubble(event)
        setDraft(option.label)
        setEditing(true)
      }}
    >
      <Pencil className="size-3.5" aria-hidden />
    </Button>
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
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className={`${selectDropdownItemClassName} min-h-8 flex-1 py-1`}
              onClick={onPickNone}
            >
              <span className="truncate">{t('none')}</span>
              {!singleSelected ? <Check className="absolute right-2 size-4" aria-hidden /> : null}
            </button>
          </div>
        ) : null}
        {options.map((option) => {
          const picked = multiple ? selectedIds.includes(option.id) : singleSelected === option.id
          return (
            <div key={option.id} className="flex min-w-0 items-center gap-0.5">
              <button
                type="button"
                className={`${selectDropdownItemClassName} min-h-8 flex-1 py-1`}
                onClick={() => {
                  if (multiple) onToggleMulti(option.id, picked)
                  else onPickSingle(option.id)
                }}
              >
                <span className="truncate">{option.label}</span>
                {picked ? <Check className="absolute right-2 size-4" aria-hidden /> : null}
              </button>
              <SelectOptionRenameButton
                columnId={columnId}
                option={option}
                disabled={disabled}
                busy={rowBusy || createBusy}
                onRenamed={(next) => onOptionChange(next)}
              />
              <SelectOptionDeleteButton
                option={option}
                disabled={disabled}
                busy={rowBusy || createBusy}
                onConfirm={() => deleteOption(option)}
              />
            </div>
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
