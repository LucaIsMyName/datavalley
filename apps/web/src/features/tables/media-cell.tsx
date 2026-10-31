import { mergeMediaFileIds, normalizeMediaCellValue } from '@datavalley/shared'
import type { MediaFile } from '@datavalley/api-client'
import { Library, Paperclip, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { useMediaCatalog } from '../../lib/media'

function readFileIds(value: unknown) {
  return normalizeMediaCellValue(value)?.fileIds ?? []
}

function fileLabel(file: MediaFile | undefined, id: string) {
  return file?.name ?? id.slice(0, 8)
}

export function MediaCellBadges({
  fileIds,
  onOpenFile,
  onRemoveFile,
}: {
  fileIds: string[]
  onOpenFile: (file: MediaFile) => void
  onRemoveFile: (fileId: string) => void
}) {
  const { t } = useTranslation()
  const catalog = useMediaCatalog()
  const byId = useMemo(() => new Map((catalog.data?.files ?? []).map((file) => [file.id, file])), [catalog.data])

  if (fileIds.length === 0) return null

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden">
      {fileIds.map((id) => {
        const file = byId.get(id)
        const label = fileLabel(file, id)
        return (
          <Badge key={id} color="slate" className="max-w-none shrink-0 gap-1 whitespace-nowrap py-0.5 pl-2 pr-0.5">
            <button
              type="button"
              className="whitespace-nowrap hover:underline"
              onClick={(event) => {
                event.stopPropagation()
                event.preventDefault()
                if (file) onOpenFile(file)
                else
                  onOpenFile({
                    id,
                    name: label,
                    mime: 'application/octet-stream',
                    size: 0,
                    createdAt: '',
                    tableId: null,
                    projectId: null,
                  })
              }}
            >
              {label}
            </button>
            <button
              type="button"
              className="inline-flex shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-black/10 hover:text-foreground"
              aria-label={t('mediaRemove')}
              onClick={(event) => {
                event.stopPropagation()
                event.preventDefault()
                onRemoveFile(id)
              }}
            >
              <X className="size-3" />
            </button>
          </Badge>
        )
      })}
    </div>
  )
}

export function MediaEditor({
  value,
  active,
  onEdit,
  onFlush,
  onOpen,
  onActivate,
  onOpenLibrary,
  onPreviewFile,
  onUpload,
}: {
  value: unknown
  active: boolean
  onEdit: (value: { fileIds: string[] } | null) => void
  onFlush: () => void
  onOpen: () => void
  onActivate: () => void
  onOpenLibrary: (existingIds: string[]) => void
  onPreviewFile: (file: MediaFile) => void
  onUpload: (file: File) => Promise<void>
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<string[]>(() => readFileIds(value))
  const [error, setError] = useState('')

  useEffect(() => {
    if (active) setDraft(readFileIds(value))
  }, [active, value])

  function removeFromCell(id: string) {
    const current = active ? draft : readFileIds(value)
    const next = current.filter((item) => item !== id)
    if (active) setDraft(next)
    onEdit(next.length ? { fileIds: next } : null)
    onFlush()
  }

  if (!active) {
    const ids = readFileIds(value)
    return (
      <div
        className="flex h-full w-full min-w-0 items-center gap-1"
        onClick={onOpen}
        onDoubleClick={(event) => {
          event.preventDefault()
          onActivate()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onActivate()
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={t('mediaAttach')}
      >
        <MediaCellBadges fileIds={ids} onOpenFile={onPreviewFile} onRemoveFile={removeFromCell} />
      </div>
    )
  }

  return (
    <div
      className="flex h-full min-w-0 flex-1 items-center gap-1 py-0.5"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {draft.length === 0 ? <Paperclip className="size-4 shrink-0 text-muted-foreground" /> : null}
        <MediaCellBadges fileIds={draft} onOpenFile={onPreviewFile} onRemoveFile={removeFromCell} />
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="outline"
          className="size-7 shrink-0 p-0"
          aria-label={t('mediaUpload')}
          onClick={(event) => {
            event.stopPropagation()
            inputRef.current?.click()
          }}
        >
          <Upload className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="size-7 shrink-0 p-0"
          aria-label={t('mediaLibrary')}
          onClick={(event) => {
            event.stopPropagation()
            onOpenLibrary(draft)
          }}
        >
          <Library className="size-3.5" />
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          void (async () => {
            setError('')
            try {
              await onUpload(file)
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : t('error'))
            }
          })()
        }}
      />
      {error ? <span className="sr-only" role="alert">{error}</span> : null}
    </div>
  )
}

export function mergeMediaIntoCell(existing: unknown, added: string[]) {
  const current = readFileIds(existing)
  const next = mergeMediaFileIds(current, added)
  return next.length ? { fileIds: next } : null
}
