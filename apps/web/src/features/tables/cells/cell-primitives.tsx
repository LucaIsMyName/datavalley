import type { Column } from '@datavalley/api-client'
import { useEffect, useRef, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AnchoredLayer } from '../../../components/anchored-layer'
import { Checkbox } from '../../../components/ui/checkbox'
import type { ViewportAnchor } from '../../../lib/place-in-viewport'

export function checkedValue(value: unknown) {
  return value === true || value === 'true' || value === '1' || value === 'yes'
}

export function FormatHint({ message }: { message: string }) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [anchor, setAnchor] = useState<ViewportAnchor | null>(null)
  function show() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setAnchor({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })
  }
  return (
    <span
      className="inline-flex shrink-0"
      onMouseEnter={show}
      onMouseLeave={() => setAnchor(null)}
      onFocus={show}
      onBlur={() => setAnchor(null)}
    >
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

export function TextEditor({
  label,
  value,
  multiline = false,
  onEdit,
  onFlush,
  onCancel,
}: {
  label: string
  value: string
  multiline?: boolean
  onEdit: (value: string) => void
  onFlush: (focusGrid?: boolean) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])
  const commitByEnter = useRef(false)
  const shared = {
    autoFocus: true,
    'aria-label': label,
    value: draft,
    onFocus: () => {
      focused.current = true
    },
    onChange: (event: { target: { value: string } }) => {
      setDraft(event.target.value)
      onEdit(event.target.value)
    },
    onBlur: () => {
      focused.current = false
      const focusGrid = commitByEnter.current
      commitByEnter.current = false
      onFlush(focusGrid)
    },
  }
  if (multiline) {
    return (
      <textarea
        {...shared}
        className="min-h-16 w-full flex-1 resize-none bg-transparent py-1 leading-5 outline-none"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
      />
    )
  }
  return (
    <input
      {...shared}
      className="h-9 min-w-0 flex-1 bg-transparent leading-9 outline-none"
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commitByEnter.current = true
          onFlush(true)
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
    />
  )
}

export function CheckboxEditor({
  column,
  value,
  onEdit,
  onFlush,
}: {
  column: Column
  value: unknown
  onEdit: (value: boolean, delay?: number) => void
  onFlush: () => void
}) {
  const { t } = useTranslation()
  return (
    <Checkbox
      aria-label={t('editColumn', { name: column.name })}
      checked={checkedValue(value)}
      onCheckedChange={(next) => {
        onEdit(next === true, 0)
        onFlush()
      }}
    />
  )
}