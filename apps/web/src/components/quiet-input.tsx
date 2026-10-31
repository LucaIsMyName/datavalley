import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

export function QuietInput({
  value,
  label,
  className,
  autoFocus = false,
  inputRef,
  onDraft,
  onFlush,
  onCancel,
  onContextMenu,
}: {
  value: string
  label: string
  className: string
  autoFocus?: boolean
  inputRef?: { current: HTMLInputElement | null }
  onDraft: (value: string) => void
  onFlush: () => void
  onCancel?: () => void
  onContextMenu?: (event: ReactMouseEvent<HTMLInputElement>) => void
}) {
  const [text, setText] = useState(value)
  const focused = useRef(false)
  const localRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!focused.current) setText(value)
  }, [value])
  return (
    <input
      ref={(node) => {
        localRef.current = node
        if (inputRef) inputRef.current = node
      }}
      autoFocus={autoFocus}
      aria-label={label}
      className={className}
      value={text}
      onFocus={() => {
        focused.current = true
      }}
      onChange={(event) => {
        setText(event.target.value)
        onDraft(event.target.value)
      }}
      onBlur={() => {
        focused.current = false
        onFlush()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel?.()
        }
      }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={onContextMenu}
    />
  )
}
