import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CsvDelimiterField, csvDelimiterWire, defaultCsvDelimiter } from '../../components/csv-delimiter-field'
import { FileUpload } from '../../components/file-upload'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Label } from '../../components/ui/label'

export function CsvImportDialog({
  open,
  busy,
  onClose,
  onImport,
}: {
  open: boolean
  busy?: boolean
  onClose: () => void
  onImport: (input: { file: File; delimiter: string; headerRow: boolean }) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [delimiter, setDelimiter] = useState(defaultCsvDelimiter())
  const [headerRow, setHeaderRow] = useState(true)

  useEffect(() => {
    if (!open) return
    setFile(null)
    setDelimiter(defaultCsvDelimiter())
    setHeaderRow(true)
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex w-[min(28rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto border border-border bg-card p-4 shadow-md">
          <Dialog.Title className="text-base font-semibold">{t('importCsvDialogTitle')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('importCsv')}</Dialog.Description>
          <FileUpload
            accept=".csv,text/csv"
            ariaLabel={t('importCsv')}
            value={file}
            disabled={busy}
            onFilesSelected={(files) => setFile(files[0] ?? null)}
            onClear={() => setFile(null)}
          />
          <CsvDelimiterField value={delimiter} onChange={setDelimiter} />
          <label htmlFor="import-csv-header" className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              id="import-csv-header"
              checked={headerRow}
              disabled={busy}
              onCheckedChange={(next) => setHeaderRow(next === true)}
            />
            {t('csvHasHeader')}
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button
              type="button"
              disabled={busy || !file}
              onClick={() => {
                if (!file) return
                void onImport({ file, delimiter: csvDelimiterWire(delimiter), headerRow })
              }}
            >
              {t('import')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
