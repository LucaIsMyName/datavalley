import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import type { ColumnOption } from './select-options-utils'

export function SelectOptionDeleteButton({
  option,
  disabled,
  busy,
  onConfirm,
}: {
  option: ColumnOption
  disabled?: boolean
  busy?: boolean
  onConfirm: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  async function confirm() {
    setPending(true)
    try {
      await onConfirm()
      setOpen(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-7 w-7 shrink-0 px-0 text-destructive hover:text-destructive"
          disabled={disabled || busy || pending}
          aria-label={t('deleteSelectOption', { label: option.label })}
          title={t('deleteSelectOptionConfirm', { label: option.label })}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="left"
        sideOffset={4}
        className="z-[210] w-56 p-2 text-sm"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mb-2 text-muted-foreground">{t('deleteSelectOptionConfirm', { label: option.label })}</p>
        <div className="flex justify-end gap-1">
          <Button type="button" variant="ghost" className="h-8 px-2" disabled={pending} onClick={() => setOpen(false)}>
            {t('cancel')}
          </Button>
          <Button type="button" variant="destructive" className="h-8 px-2" disabled={pending} onClick={() => void confirm()}>
            {t('delete')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
