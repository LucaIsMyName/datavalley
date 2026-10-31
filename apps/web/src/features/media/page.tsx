import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaFile } from '@datavalley/api-client'
import { Upload } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { EmptyState, ErrorState, LoadingBlock, Page } from '../../components/states'
import { listMedia, uploadMedia } from '../../lib/media'
import { MediaGrid } from './media-grid'
import { MediaPreviewDrawer } from './media-preview-drawer'

export function MediaPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'image' | 'pdf'>('all')
  const [preview, setPreview] = useState<MediaFile | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
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

  const uploadFiles = useCallback(
    async (list: FileList | File[]) => {
      const items = Array.from(list)
      if (items.length === 0) return
      setUploading(true)
      setError('')
      try {
        let last: MediaFile | null = null
        for (const file of items) {
          last = await uploadMedia(file)
        }
        if (last) setPreview(last)
        await queryClient.invalidateQueries({ queryKey: ['media'] })
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t('error'))
      } finally {
        setUploading(false)
      }
    },
    [queryClient, t],
  )

  function onDragEnter(event: DragEvent) {
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  function onDragLeave(event: DragEvent) {
    event.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragging(false)
    }
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault()
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (uploading) return
    const dropped = event.dataTransfer.files
    if (dropped.length > 0) void uploadFiles(dropped)
  }

  const showGrid = !mediaQuery.isLoading && files.length > 0
  const showEmpty = !mediaQuery.isLoading && !mediaQuery.isError && files.length === 0

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
          multiple
          className="sr-only"
          onChange={(event) => {
            const picked = event.target.files
            event.target.value = ''
            if (picked) void uploadFiles(picked)
          }}
        />
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <div
        className={`flex min-h-[min(70vh,32rem)] flex-1 flex-col gap-3 rounded-sm border border-dashed p-3 transition-colors ${
          dragging ? 'border-primary bg-primary/5' : 'border-border bg-card/40'
        }`}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <p className="text-center text-sm text-muted-foreground">{t('mediaDropHint')}</p>
        {mediaQuery.isLoading ? <LoadingBlock /> : null}
        {mediaQuery.isError ? <ErrorState message={(mediaQuery.error as Error).message} /> : null}
        {showEmpty ? <EmptyState title={t('mediaEmpty')} body={t('mediaEmptyBody')} /> : null}
        {showGrid ? (
          <MediaGrid files={files} activeId={preview?.id ?? null} onSelect={setPreview} />
        ) : null}
        {uploading ? (
          <p className="text-center text-sm text-muted-foreground" role="status">
            {t('loading')}
          </p>
        ) : null}
      </div>
      {mediaQuery.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          disabled={mediaQuery.isFetchingNextPage}
          onClick={() => void mediaQuery.fetchNextPage()}
        >
          {t('mediaLoadMore')}
        </Button>
      ) : null}
      <MediaPreviewDrawer file={preview} onClose={() => setPreview(null)} />
    </Page>
  )
}
