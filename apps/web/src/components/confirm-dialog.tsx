import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from './ui/button'

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2  border border-border bg-card p-4 shadow-md">
          <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">{body}</Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{cancelLabel}</Button>
            <Button type="button" variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
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
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2  border border-border bg-card p-4 shadow-md">
          <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">{label}</Dialog.Description>
          <input
            autoFocus
            aria-label={label}
            className="mt-3 h-9 w-full border border-border bg-card px-2 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && draft.trim()) onSubmit(draft.trim())
            }}
          />
          {children}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{cancelLabel}</Button>
            <Button type="button" onClick={() => { if (draft.trim()) onSubmit(draft.trim()) }}>{confirmLabel}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
