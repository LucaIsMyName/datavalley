import { normalizeMediaCellValue } from '@datavalley/shared'
import type { MediaFile } from '@datavalley/api-client'
import { FileText, Paperclip, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { isRasterImageMime, listMedia, mediaDownloadUrl, uploadMedia } from '../../lib/media'

function readFileIds(value: unknown) {
  return normalizeMediaCellValue(value)?.fileIds ?? []
}

export function MediaCellView({ value }: { value: unknown }) {
  const ids = readFileIds(value)
  if (ids.length === 0) return <Paperclip className="size-4 text-muted-foreground" />
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      {ids.slice(0, 3).map((id) => (
        <span key={id} className="inline-flex size-6 shrink-0 items-center justify-center border border-border bg-muted">
          <FileText className="size-3.5 text-muted-foreground" />
        </span>
      ))}
      {ids.length > 3 ? <span className="text-xs text-muted-foreground">+{ids.length - 3}</span> : null}
    </div>
  )
}

export function MediaEditor({
  tableId,
  value,
  active,
  onEdit,
  onFlush,
  onOpen,
  onActivate,
}: {
  tableId: string
  value: unknown
  active: boolean
  onEdit: (value: { fileIds: string[] }) => void
  onFlush: () => void
  onOpen: () => void
  onActivate: () => void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<string[]>(() => readFileIds(value))
  const [library, setLibrary] = useState<MediaFile[]>([])
  const [loadingLibrary, setLoadingLibrary] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (active) setDraft(readFileIds(value))
  }, [active, value])

  if (!active) {
    return (
      <button
        type="button"
        className="flex h-full w-full min-w-0 items-center gap-1 overflow-hidden text-left"
        aria-label={t('mediaAttach')}
        onClick={onOpen}
        onDoubleClick={(event) => {
          event.preventDefault()
          onActivate()
        }}
      >
        <MediaCellView value={value} />
      </button>
    )
  }

  async function loadLibrary() {
    setLoadingLibrary(true)
    setError('')
    try {
      const result = await listMedia({ limit: 50 })
      setLibrary(result.files)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error'))
    } finally {
      setLoadingLibrary(false)
    }
  }

  function commit(next: string[]) {
    setDraft(next)
    onEdit({ fileIds: next })
  }

  async function attachUpload(file: File) {
    setError('')
    try {
      const saved = await uploadMedia(file, { tableId })
      commit([...draft, saved.id])
      onFlush()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error'))
    }
  }

  function attachExisting(id: string) {
    if (draft.includes(id)) return
    commit([...draft, id])
    onFlush()
  }

  function remove(id: string) {
    commit(draft.filter((item) => item !== id))
    onFlush()
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col gap-2 py-1">
      <div className="flex flex-wrap gap-1">
        {draft.map((id) => (
          <span key={id} className="inline-flex max-w-full items-center gap-1 border border-border px-1 text-xs">
            <a href={mediaDownloadUrl(id)} className="truncate underline" onClick={(event) => event.stopPropagation()}>
              {id.slice(0, 8)}
            </a>
            <button type="button" aria-label={t('mediaRemove')} onClick={() => remove(id)}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <Button type="button" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => inputRef.current?.click()}>
          <Plus className="size-3.5" />
          {t('mediaUpload')}
        </Button>
        <Button type="button" variant="outline" className="h-7 px-2 text-xs" onClick={() => void loadLibrary()}>
          {t('mediaPickExisting')}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void attachUpload(file)
        }}
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {loadingLibrary ? <p className="text-xs text-muted-foreground">{t('loading')}</p> : null}
      {library.length > 0 ? (
        <ul className="max-h-28 overflow-auto border border-border">
          {library.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-accent"
                onClick={() => attachExisting(file.id)}
              >
                {isRasterImageMime(file.mime) ? (
                  <img src={mediaDownloadUrl(file.id)} alt="" className="size-6 object-cover" />
                ) : (
                  <FileText className="size-4 shrink-0" />
                )}
                <span className="truncate">{file.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
