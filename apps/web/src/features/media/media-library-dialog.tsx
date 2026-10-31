import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import type { MediaFile } from '@datavalley/api-client'
import { MAX_MEDIA_FILES_PER_CELL, mergeMediaFileIds } from '@datavalley/shared'
import { FileText } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { LoadingBlock } from '../../components/states'
import { isRasterImageMime, listMedia, mediaDownloadUrl } from '../../lib/media'

export function MediaLibraryDialog({
  open,
  onClose,
  existingIds,
  onInsert,
}: {
  open: boolean
  onClose: () => void
  existingIds: string[]
  onInsert: (fileIds: string[], files: MediaFile[]) => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'image' | 'pdf'>('all')
  const [picked, setPicked] = useState<string[]>([])

  useEffect(() => {
    if (!open) {
      setSearch('')
      setFilter('all')
      setPicked([])
    }
  }, [open])

  const mediaQuery = useQuery({
    queryKey: ['media', 'picker', search, filter],
    enabled: open,
    queryFn: () =>
      listMedia({
        limit: 100,
        q: search.trim() || undefined,
        mime: filter === 'all' ? null : filter,
      }),
  })

  const files = mediaQuery.data?.files ?? []
  const fileById = useMemo(() => new Map(files.map((file) => [file.id, file])), [files])

  const slotsLeft = Math.max(0, MAX_MEDIA_FILES_PER_CELL - existingIds.length)
  const selectionCount = picked.filter((id) => !existingIds.includes(id)).length
  const canInsert = selectionCount > 0 && selectionCount <= slotsLeft

  function toggle(id: string) {
    if (existingIds.includes(id)) return
    setPicked((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      const merged = mergeMediaFileIds(existingIds, [...current, id])
      return merged.filter((item) => !existingIds.includes(item))
    })
  }

  function confirm() {
    const next = mergeMediaFileIds(existingIds, picked)
    const added = next.filter((id) => !existingIds.includes(id))
    const selectedFiles = added.map((id) => fileById.get(id)).filter((file): file is MediaFile => Boolean(file))
    onInsert(added, selectedFiles)
    onClose()
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[121] flex max-h-[min(85vh,40rem)] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 border border-border bg-card p-4 shadow-md"
        >
          <Dialog.Title className="text-base font-semibold">{t('mediaLibrary')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('mediaPickExisting')}</Dialog.Description>
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label={t('mediaSearch')}
              className="h-9 min-w-40 flex-1 border border-border bg-card px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('mediaSearch')}
            />
            {(['all', 'image', 'pdf'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                className="h-8 px-2 text-xs"
                variant={filter === value ? 'default' : 'outline'}
                onClick={() => setFilter(value)}
              >
                {value === 'all' ? t('mediaFilterAll') : value === 'image' ? t('mediaFilterImages') : t('mediaFilterPdf')}
              </Button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto border border-border">
            {mediaQuery.isLoading ? <LoadingBlock /> : null}
            {mediaQuery.isError ? (
              <p className="p-3 text-sm text-danger">{(mediaQuery.error as Error).message}</p>
            ) : null}
            {!mediaQuery.isLoading && files.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{t('mediaEmpty')}</p>
            ) : null}
            <ul className="divide-y divide-border">
              {files.map((file) => {
                const disabled = existingIds.includes(file.id)
                const checked = disabled || picked.includes(file.id)
                return (
                  <li key={file.id}>
                    <label className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent ${disabled ? 'opacity-60' : ''}`}>
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={() => {
                          if (!disabled) toggle(file.id)
                        }}
                      />
                      {isRasterImageMime(file.mime) ? (
                        <img src={mediaDownloadUrl(file.id)} alt="" className="size-8 border border-border object-cover" />
                      ) : (
                        <FileText className="size-8 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('mediaInsertHint', { count: slotsLeft })}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="button" disabled={!canInsert} onClick={confirm}>
              {t('mediaInsertCount', { count: selectionCount })}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
