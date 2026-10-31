import * as Dialog from '@radix-ui/react-dialog'
import type { MediaFile } from '@datavalley/api-client'
import { FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isPdfMime, isRasterImageMime, mediaDownloadUrl } from '../../lib/media'

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

export function MediaPreviewDrawer({
  file,
  onClose,
}: {
  file: MediaFile | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog.Root open={Boolean(file)} onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <Dialog.Content
          className={`fixed right-0 top-0 z-50 flex h-full w-full flex-col gap-3 border-l border-border bg-card p-4 shadow-lg ${
            file && isPdfMime(file.mime) ? 'max-w-3xl' : 'max-w-lg'
          }`}
        >
          <Dialog.Title className="min-w-0 truncate text-lg font-semibold">{file?.name ?? t('media')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('preview')}</Dialog.Description>
          {file ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <MediaPreviewContent file={file} />
            </div>
          ) : null}
          <Dialog.Close className="self-end border border-border px-3 py-1.5 text-sm">{t('close')}</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
