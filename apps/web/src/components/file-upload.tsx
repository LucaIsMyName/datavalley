import { Upload, X } from 'lucide-react'
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

export type FileUploadHandle = {
  open: () => void
}

type FileUploadProps = {
  accept?: string
  multiple?: boolean
  disabled?: boolean
  value?: File | null
  onFilesSelected: (files: File[]) => void
  onClear?: () => void
  variant?: 'button' | 'dropzone' | 'compact'
  dropzone?: boolean
  inputTestId?: string
  ariaLabel: string
  className?: string
  children?: ReactNode
}

export const FileUpload = forwardRef<FileUploadHandle, FileUploadProps>(function FileUpload(
  {
    accept,
    multiple,
    disabled,
    value,
    onFilesSelected,
    onClear,
    variant = 'dropzone',
    dropzone = variant === 'dropzone',
    inputTestId = 'file-upload-input',
    ariaLabel,
    className,
    children,
  },
  ref,
) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  useImperativeHandle(ref, () => ({
    open: () => {
      if (!disabled) inputRef.current?.click()
    },
  }))

  function pickFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    onFilesSelected(Array.from(list))
  }

  function onInputChange() {
    pickFiles(inputRef.current?.files ?? null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function onDragOver(event: DragEvent) {
    if (!dropzone || disabled) return
    event.preventDefault()
    setDragging(true)
  }

  function onDragLeave(event: DragEvent) {
    if (!dropzone) return
    event.preventDefault()
    setDragging(false)
  }

  function onDrop(event: DragEvent) {
    if (!dropzone || disabled) return
    event.preventDefault()
    setDragging(false)
    pickFiles(event.dataTransfer.files)
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple={multiple}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={inputTestId}
      className="sr-only"
      onChange={onInputChange}
    />
  )

  if (variant === 'compact') {
    return (
      <>
        {input}
        {children}
      </>
    )
  }

  if (variant === 'button') {
    return (
      <div className={cn('inline-flex items-center gap-2', className)}>
        {input}
        <Button type="button" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" />
          {t('chooseFile')}
        </Button>
        {value ? (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="max-w-[12rem] truncate">{value.name}</span>
            {onClear ? (
              <button type="button" className="text-foreground hover:text-danger" aria-label={t('clearFile')} onClick={onClear}>
                <X className="size-3.5" />
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {input}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-disabled={disabled}
        onKeyDown={(event) => {
          if (disabled) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        onClick={() => {
          if (!disabled) inputRef.current?.click()
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-4 py-6 text-center text-sm transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border bg-card/40 hover:bg-accent/40',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <Upload className="size-5 text-muted-foreground" />
        {value ? (
          <span className="flex max-w-full items-center gap-2 font-medium">
            <span className="truncate">{value.name}</span>
            {onClear ? (
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-danger"
                aria-label={t('clearFile')}
                onClick={(event) => {
                  event.stopPropagation()
                  onClear()
                }}
              >
                <X className="size-4" />
              </button>
            ) : null}
          </span>
        ) : (
          <span className="text-muted-foreground">{children ?? t('fileUploadHint')}</span>
        )}
      </div>
    </div>
  )
})
