import { generateKeyBetween } from 'fractional-indexing'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Column } from '@datavalley/api-client'
import { ApiClientError } from '@datavalley/api-client'
import { paintSwatch } from '@datavalley/shared'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { api } from '../../lib/api'
import { colorLabelKey } from './grid-ux'
import { mergeColumnOption, sortOptionsByPosition } from './select-options-utils'

const palette = ['amber', 'green', 'blue', 'red', 'violet', 'orange', 'pink', 'teal', 'slate', 'yellow']

export function SelectOptionsDialog({
  column,
  readOnly,
  onChange,
  onRefresh,
}: {
  column: Column
  readOnly?: boolean
  onChange: (column: Column) => void
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const options = useMemo(() => sortOptionsByPosition(column.options ?? []), [column.options])

  async function addOption() {
    const label = draft.trim()
    if (!label || readOnly) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.request<{ option: Column['options'][number] }>(`/columns/${column.id}/options`, {
        method: 'POST',
        body: JSON.stringify({ label }),
      })
      onChange(mergeColumnOption(column, result.option))
      setDraft('')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'))
    } finally {
      setBusy(false)
    }
  }

  async function patchOption(option: Column['options'][number], patch: { label?: string; color?: string; position?: string }) {
    if (readOnly) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.request<{ option: Column['options'][number] }>(
        `/columns/${column.id}/options/${option.id}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
      )
      onChange(mergeColumnOption(column, result.option))
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'))
    } finally {
      setBusy(false)
    }
  }

  async function removeOption(option: Column['options'][number]) {
    if (readOnly) return
    if (!window.confirm(t('deleteSelectOptionConfirm', { label: option.label }))) return
    setBusy(true)
    setError(null)
    try {
      await api.request(`/columns/${column.id}/options/${option.id}`, { method: 'DELETE' })
      onChange(mergeColumnOption(column, option, true))
      await onRefresh()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'))
    } finally {
      setBusy(false)
    }
  }

  function moveOption(index: number, delta: number) {
    const list = sortOptionsByPosition(column.options ?? [])
    const target = index + delta
    if (target < 0 || target >= list.length) return
    const current = list[index]
    const neighbor = list[target]
    const position =
      delta < 0
        ? generateKeyBetween(list[target - 1]?.position ?? null, neighbor.position)
        : generateKeyBetween(neighbor.position, list[target + 1]?.position ?? null)
    void patchOption(current, { position })
  }

  return (
    <div className="flex max-h-[min(24rem,70vh)] flex-col gap-2">
      <p className="text-sm font-medium">{t('manageSelectOptions')}</p>
      <p className="text-xs text-muted-foreground">{column.name}</p>
      <ul className="min-h-0 flex-1 space-y-1 overflow-auto">
        {options.map((option, index) => (
          <li key={option.id} className="flex items-center gap-1 border border-border p-1">
            <Input
              aria-label={t('rename')}
              className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1"
              defaultValue={option.label}
              disabled={readOnly || busy}
              onBlur={(event) => {
                const label = event.target.value.trim()
                if (label && label !== option.label) void patchOption(option, { label })
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
            <div className="flex shrink-0 flex-wrap gap-0.5">
              {palette.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={t(colorLabelKey(color))}
                  disabled={readOnly || busy}
                  className={`h-4 w-4 border border-border ${option.color === color ? 'ring-1 ring-foreground' : ''}`}
                  style={{ background: paintSwatch(color, 'background') }}
                  onClick={() => void patchOption(option, { color })}
                />
              ))}
            </div>
            <Button type="button" variant="ghost" className="h-7 w-7 px-0" disabled={readOnly || busy || index === 0} onClick={() => moveOption(index, -1)}>
              <ArrowUp className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-7 w-7 px-0"
              disabled={readOnly || busy || index === options.length - 1}
              onClick={() => moveOption(index, 1)}
            >
              <ArrowDown className="size-3.5" />
            </Button>
            <Button type="button" variant="ghost" className="h-7 w-7 px-0 text-danger" disabled={readOnly || busy} onClick={() => void removeOption(option)}>
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      {!readOnly ? (
        <div className="flex gap-2">
          <Input
            aria-label={t('addSelectOption')}
            className="h-8"
            value={draft}
            placeholder={t('newSelectOption')}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void addOption()
              }
            }}
          />
          <Button type="button" className="h-8 shrink-0" disabled={busy || !draft.trim()} onClick={() => void addOption()}>
            {t('addSelectOption')}
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  )
}
