import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AppDialog } from './ui/app-dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  pending = false,
  tone = 'danger',
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  pending?: boolean
  tone?: 'danger' | 'default'
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <AppDialog
      open={open}
      title={title}
      description={body}
      onOpenChange={(next) => {
        if (!next && !pending) onClose()
      }}
    >
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={tone === 'default' ? 'default' : 'danger'}
          disabled={pending}
          aria-busy={pending}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </AppDialog>
  )
}

export function PromptDialog({
  open,
  title,
  value,
  label,
  onSubmit,
  onClose,
  children,
  confirmLabel,
  cancelLabel,
  pending = false,
}: {
  open: boolean
  title: string
  value: string
  label: string
  onSubmit: (value: string) => void
  onClose: () => void
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  pending?: boolean
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])
  return (
    <AppDialog
      open={open}
      title={title}
      onOpenChange={(next) => {
        if (!next && !pending) onClose()
      }}
    >
      <Label htmlFor="prompt-dialog-value" className="mt-3">
        {label}
      </Label>
      <Input
        id="prompt-dialog-value"
        autoFocus
        disabled={pending}
        className="mt-1.5"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && draft.trim() && !pending) onSubmit(draft.trim())
        }}
      />
      {children}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          {cancelLabel ?? t('cancel')}
        </Button>
        <Button
          type="button"
          disabled={pending || !draft.trim()}
          aria-busy={pending}
          onClick={() => {
            if (draft.trim()) onSubmit(draft.trim())
          }}
        >
          {confirmLabel ?? t('save')}
        </Button>
      </div>
    </AppDialog>
  )
}
