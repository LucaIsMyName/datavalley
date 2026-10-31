import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import type { MediaFile, MediaFileUsage } from '@datavalley/api-client'
import { FileText } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { fetchMediaDetails, isPdfMime, isRasterImageMime, mediaDownloadUrl } from '../../lib/media'

function usageHref(usage: MediaFileUsage) {
  return `/projects/${usage.projectId}/tables/${usage.tableId}?column=${usage.columnId}&row=${usage.rowId}`
}

function usageLabel(usage: MediaFileUsage) {
  return `${usage.projectName} › ${usage.tableName} › ${usage.columnName} (#${usage.rowNumber})`
}

function MediaPreviewContent({ file }: { file: MediaFile }) {
  if (isRasterImageMime(file.mime)) {
    return (
      <img
        src={mediaDownloadUrl(file.id)}
        alt={file.name}
        className="max-h-[min(70vh,32rem)] w-full border border-border bg-muted object-contain"
      />
    )
  }
  if (isPdfMime(file.mime)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <iframe
          title={file.name}
          src={mediaDownloadUrl(file.id)}
          className="min-h-[min(70vh,48rem)] w-full flex-1 border border-border bg-muted"
        />
        <a href={mediaDownloadUrl(file.id)} className="text-sm underline">
          {file.name}
        </a>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-start gap-3 text-sm">
      <FileText className="size-10 text-muted-foreground" />
      <a href={mediaDownloadUrl(file.id)} className="break-all underline">
        {file.name}
      </a>
      <p className="text-muted-foreground">{file.mime}</p>
    </div>
  )
}

function MediaMeta({ file, usages }: { file: MediaFile; usages: MediaFileUsage[] }) {
  const { t } = useTranslation()
  const uploadLabel =
    file.tableId && file.projectId
      ? `${file.uploadProjectName ?? t('projects')} › ${file.uploadTableName ?? t('name')}`
      : t('mediaFromLibrary')
  const uploadHref =
    file.tableId && file.projectId ? `/projects/${file.projectId}/tables/${file.tableId}` : null

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-3 text-sm">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('mediaUploadOrigin')}</p>
        {uploadHref ? (
          <Link to={uploadHref} className="underline">
            {uploadLabel}
          </Link>
        ) : (
          <p>{uploadLabel}</p>
        )}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('mediaUsedIn')}</p>
        {usages.length === 0 ? (
          <p className="text-muted-foreground">{t('mediaNotUsed')}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {usages.map((usage) => (
              <li key={`${usage.rowId}-${usage.columnId}`}>
                <Link to={usageHref(usage)} className="underline">
                  {usageLabel(usage)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function MediaPreviewDrawer({
  file,
  onClose,
  onDisconnect,
}: {
  file: MediaFile | null
  onClose: () => void
  onDisconnect?: () => void
}) {
  const { t } = useTranslation()
  const detailsQuery = useQuery({
    queryKey: ['media-details', file?.id],
    enabled: Boolean(file),
    queryFn: () => fetchMediaDetails(file!.id),
  })
  const detailFile = detailsQuery.data?.file ?? file
  const usages = detailsQuery.data?.usages ?? []

  return (
    <Dialog.Root open={Boolean(file)} onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[110] bg-black/20" />
        <Dialog.Content
          className={`fixed right-0 top-0 z-[111] flex h-full w-full flex-col gap-3 border-l border-border bg-card p-4 shadow-lg ${
            file && isPdfMime(file.mime) ? 'max-w-3xl' : 'max-w-lg'
          }`}
        >
          <Dialog.Title className="min-w-0 truncate text-lg font-semibold">{file?.name ?? t('media')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('preview')}</Dialog.Description>
          {file && detailFile ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
              <MediaMeta file={detailFile} usages={usages} />
              {detailsQuery.isLoading ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}
              <MediaPreviewContent file={file} />
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {onDisconnect ? (
              <Button type="button" variant="danger" onClick={onDisconnect}>
                {t('mediaDisconnectFromCell')}
              </Button>
            ) : null}
            <Dialog.Close className="border border-border px-3 py-1.5 text-sm">{t('close')}</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
