import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function AppSheet({
  open,
  onOpenChange,
  title,
  children,
  contentId,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
  contentId?: string
  className?: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 md:hidden" />
        <Dialog.Content
          id={contentId}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex h-[50dvh] max-h-[50dvh] flex-col border-t border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-md outline-none md:hidden',
            className,
          )}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
