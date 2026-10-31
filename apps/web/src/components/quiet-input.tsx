import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

export function QuietInput({
  value,
  label,
  className,
  autoFocus = false,
  fit = false,
  fitMaxClass = 'max-w-48',
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
  fit?: boolean
  fitMaxClass?: string
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
  const field = (
    <input
      ref={(node) => {
        localRef.current = node
        if (inputRef) inputRef.current = node
      }}
      autoFocus={autoFocus}
      aria-label={label}
      size={fit ? 1 : undefined}
      className={fit ? `${className} col-start-1 row-start-1 w-full min-w-0 truncate` : className}
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
          setText(value)
          onCancel?.()
        }
      }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={onContextMenu}
    />
  )
  if (!fit) return field
  return (
    <span className={`inline-grid min-w-0 ${fitMaxClass}`}>
      <span aria-hidden className={`invisible col-start-1 row-start-1 block w-max min-w-0 truncate ${fitMaxClass} ${className}`}>
        {text || '\u00a0'}
      </span>
      {field}
    </span>
  )
}
