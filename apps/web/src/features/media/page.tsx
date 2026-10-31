import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaFile } from '@datavalley/api-client'
import { FileText, ImageIcon, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { EmptyState, ErrorState, LoadingBlock, Page } from '../../components/states'
import { isRasterImageMime, listMedia, mediaDownloadUrl, uploadMedia } from '../../lib/media'

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function MediaPreview({ file }: { file: MediaFile }) {
  if (isRasterImageMime(file.mime)) {
    return (
      <img
        src={mediaDownloadUrl(file.id)}
        alt={file.name}
        className="max-h-64 max-w-full border border-border bg-muted object-contain"
      />
    )
  }
  return (
    <div className="flex flex-col items-start gap-2 text-sm">
      <FileText className="size-8 text-muted-foreground" />
      <a href={mediaDownloadUrl(file.id)} className="underline">
        {file.name}
      </a>
    </div>
  )
}

export function MediaPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'image' | 'pdf'>('all')
  const [selected, setSelected] = useState<MediaFile | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const mediaQuery = useInfiniteQuery({
    queryKey: ['media', search, filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      listMedia({
        limit: 50,
        cursor: pageParam,
        q: search.trim() || undefined,
        mime: filter === 'all' ? null : filter,
      }),
    getNextPageParam: (last) => last.nextCursor,
  })

  const files = useMemo(() => mediaQuery.data?.pages.flatMap((page) => page.files) ?? [], [mediaQuery.data])

  async function onUpload(file: File) {
    setUploading(true)
    setError('')
    try {
      const saved = await uploadMedia(file)
      setSelected(saved)
      await queryClient.invalidateQueries({ queryKey: ['media'] })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Page title={t('media')}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label={t('mediaSearch')}
          className="h-9 min-w-48 flex-1 border border-border bg-card px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('mediaSearch')}
        />
        <div className="flex gap-1">
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
        <Button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" />
          {t('mediaUpload')}
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void onUpload(file)
          }}
        />
      </div>
      {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
      {mediaQuery.isLoading ? <LoadingBlock /> : null}
      {mediaQuery.isError ? <ErrorState message={(mediaQuery.error as Error).message} /> : null}
      {!mediaQuery.isLoading && files.length === 0 ? (
        <EmptyState title={t('mediaEmpty')} body={t('mediaEmptyBody')} />
      ) : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <ul className="flex flex-col gap-2">
          {files.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setSelected(file)}
              >
                <Card className={`flex min-h-11 items-center gap-3 p-3 text-sm ${selected?.id === file.id ? 'ring-2 ring-primary' : ''}`}>
                  {isRasterImageMime(file.mime) ? (
                    <img src={mediaDownloadUrl(file.id)} alt="" className="size-10 shrink-0 border border-border object-cover" />
                  ) : (
                    <ImageIcon className="size-10 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(file.size)} · {new Date(file.createdAt).toLocaleString()}
                    </span>
                  </span>
                </Card>
              </button>
            </li>
          ))}
        </ul>
        <Card className="min-h-40 p-4">
          {selected ? (
            <div className="flex flex-col gap-3">
              <h2 className="truncate text-sm font-medium">{selected.name}</h2>
              <MediaPreview file={selected} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('mediaSelectPreview')}</p>
          )}
        </Card>
      </div>
      {mediaQuery.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={mediaQuery.isFetchingNextPage}
          onClick={() => void mediaQuery.fetchNextPage()}
        >
          {t('mediaLoadMore')}
        </Button>
      ) : null}
    </Page>
  )
}
