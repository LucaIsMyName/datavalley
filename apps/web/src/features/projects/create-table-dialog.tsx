import { useQuery } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project, TableRecord } from '@datavalley/api-client'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../components/ui/select'
import {
  CsvDelimiterField,
  csvDelimiterWire,
  defaultCsvDelimiter,
} from '../../components/csv-delimiter-field'
import { FileUpload } from '../../components/file-upload'
import { api } from '../../lib/api'
import { tableNameFromFile } from '../tables/table-tabs'

export function CreateTableDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (table: TableRecord, focusName: boolean) => Promise<void>
}) {
  const { t } = useTranslation()
  const [tableKind, setTableKind] = useState<'blank' | 'demo' | 'csv' | 'mirror' | 'connector'>(
    'blank',
  )
  const [connectorPickId, setConnectorPickId] = useState('')
  const [connectorTableName, setConnectorTableName] = useState('')
  const [mirrorProjectId, setMirrorProjectId] = useState('')
  const [mirrorSourceTableId, setMirrorSourceTableId] = useState('')
  const [mirrorDisplayName, setMirrorDisplayName] = useState('')
  const [csvName, setCsvName] = useState('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvHeader, setCsvHeader] = useState(true)
  const [csvDelimiter, setCsvDelimiter] = useState(defaultCsvDelimiter)
  const [createTableError, setCreateTableError] = useState('')
  const [creatingTableBusy, setCreatingTableBusy] = useState(false)
  const allProjects = useQuery({
    queryKey: ['projects'],
    enabled: open && tableKind === 'mirror',
    queryFn: () => api.request<{ projects: Project[] }>('/projects'),
  })
  const mirrorSourceTables = useQuery({
    queryKey: ['tables', mirrorProjectId, 'mirror-pick'],
    enabled: open && tableKind === 'mirror' && Boolean(mirrorProjectId),
    queryFn: () => api.request<{ tables: TableRecord[] }>(`/projects/${mirrorProjectId}/tables`),
  })
  const projectConnectors = useQuery({
    queryKey: ['connectors', projectId],
    enabled: open && tableKind === 'connector',
    queryFn: () =>
      api.request<{ connectors: { id: string; name: string }[] }>(
        `/connectors?projectId=${encodeURIComponent(projectId)}`,
      ),
  })

  useEffect(() => {
    if (open) return
    setTableKind('blank')
    setConnectorPickId('')
    setConnectorTableName('')
    setMirrorProjectId('')
    setMirrorSourceTableId('')
    setMirrorDisplayName('')
    setCsvName('')
    setCsvFile(null)
    setCsvHeader(true)
    setCsvDelimiter(defaultCsvDelimiter)
    setCreateTableError('')
  }, [open])

  async function submitNewTable() {
    setCreateTableError('')
    setCreatingTableBusy(true)
    try {
      if (tableKind === 'mirror') {
        if (!mirrorSourceTableId) throw new Error(t('chooseMirrorSource'))
        const payload: { sourceTableId: string; name?: string } = {
          sourceTableId: mirrorSourceTableId,
        }
        const label = mirrorDisplayName.trim()
        if (label) payload.name = label
        const created = await api.request<{ table: TableRecord }>(
          `/projects/${projectId}/tables/mirror`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        )
        onOpenChange(false)
        setMirrorProjectId('')
        setMirrorSourceTableId('')
        setMirrorDisplayName('')
        await onCreated(created.table, false)
        return
      }
      if (tableKind === 'connector') {
        if (!connectorPickId) throw new Error(t('chooseConnector'))
        const payload: { connectorId: string; name?: string } = { connectorId: connectorPickId }
        const label = connectorTableName.trim()
        if (label) payload.name = label
        const created = await api.request<{ table: TableRecord }>(
          `/projects/${projectId}/tables/from-connector`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        )
        onOpenChange(false)
        setConnectorPickId('')
        setConnectorTableName('')
        await onCreated(created.table, false)
        return
      }
      if (tableKind === 'csv') {
        if (!csvFile) throw new Error(t('chooseCsv'))
        const name = csvName.trim() || tableNameFromFile(csvFile.name)
        if (!name) throw new Error(t('tableName'))
        const body = new FormData()
        body.append('file', csvFile)
        body.append('name', name)
        body.append('headerRow', csvHeader ? 'true' : 'false')
        body.append('delimiter', csvDelimiterWire(csvDelimiter))
        const created = await api.request<{ table: TableRecord }>(
          `/projects/${projectId}/tables/import`,
          { method: 'POST', body },
        )
        onOpenChange(false)
        await onCreated(created.table, false)
        return
      }
      const created = await api.request<{ table: TableRecord }>(`/projects/${projectId}/tables`, {
        method: 'POST',
        body: JSON.stringify(tableKind === 'demo' ? { template: 'demo' } : {}),
      })
      onOpenChange(false)
      await onCreated(created.table, tableKind === 'blank')
    } catch (error) {
      setCreateTableError(error instanceof Error ? error.message : t('error'))
    } finally {
      setCreatingTableBusy(false)
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2  border border-border bg-card p-4 shadow-md">
          <Dialog.Title className="text-base font-semibold">{t('newTable')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('newTable')}</Dialog.Description>
          <form
            className="mt-3 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void submitNewTable()
            }}
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">{t('newTable')}</legend>
              <RadioGroup
                value={tableKind}
                onValueChange={(value) => setTableKind(value as typeof tableKind)}
                className="gap-2"
              >
                {(
                  [
                    ['blank', 'blankTable'],
                    ['demo', 'demoTable'],
                    ['csv', 'importCsv'],
                    ['mirror', 'syncedTable'],
                    ['connector', 'fromConnector'],
                  ] as const
                ).map(([value, key]) => (
                  <label
                    key={value}
                    htmlFor={`table-kind-${value}`}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <RadioGroupItem value={value} id={`table-kind-${value}`} />
                    {t(key)}
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
            {tableKind === 'csv' ? (
              <>
                <FileUpload
                  accept=".csv,text/csv"
                  ariaLabel={t('importCsv')}
                  value={csvFile}
                  onFilesSelected={(files) => {
                    const file = files[0] ?? null
                    setCsvFile(file)
                    if (file) setCsvName(tableNameFromFile(file.name))
                  }}
                  onClear={() => setCsvFile(null)}
                />
                <CsvDelimiterField value={csvDelimiter} onChange={setCsvDelimiter} />
                <input
                  aria-label={t('tableName')}
                  className="h-9 w-full border border-border bg-card px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  value={csvName}
                  onChange={(event) => setCsvName(event.target.value)}
                />
                <label
                  htmlFor="csv-has-header"
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    id="csv-has-header"
                    checked={csvHeader}
                    onCheckedChange={(next) => setCsvHeader(next === true)}
                  />
                  {t('csvHasHeader')}
                </label>
              </>
            ) : null}
            {tableKind === 'connector' ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="connector-pick">{t('chooseConnector')}</Label>
                  <Select value={connectorPickId || undefined} onValueChange={setConnectorPickId}>
                    <SelectTrigger id="connector-pick" aria-label={t('chooseConnector')} />
                    <SelectContent>
                      {(projectConnectors.data?.connectors ?? []).map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <input
                  aria-label={t('tableName')}
                  className="h-9 w-full border border-border bg-card px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  value={connectorTableName}
                  onChange={(event) => setConnectorTableName(event.target.value)}
                  placeholder={t('tableNameOptional')}
                />
              </>
            ) : null}
            {tableKind === 'mirror' ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mirror-project">{t('mirrorSourceProject')}</Label>
                  <Select
                    value={mirrorProjectId || undefined}
                    onValueChange={(value) => {
                      setMirrorProjectId(value)
                      setMirrorSourceTableId('')
                      setMirrorDisplayName('')
                    }}
                  >
                    <SelectTrigger id="mirror-project" aria-label={t('mirrorSourceProject')} />
                    <SelectContent>
                      {(allProjects.data?.projects ?? []).map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mirror-table">{t('mirrorSourceTable')}</Label>
                  <Select
                    value={mirrorSourceTableId || undefined}
                    disabled={!mirrorProjectId}
                    onValueChange={(value) => {
                      setMirrorSourceTableId(value)
                      const source = (mirrorSourceTables.data?.tables ?? []).find(
                        (item) => item.id === value,
                      )
                      if (source && !mirrorDisplayName.trim()) setMirrorDisplayName(source.name)
                    }}
                  >
                    <SelectTrigger id="mirror-table" aria-label={t('mirrorSourceTable')} />
                    <SelectContent>
                      {(mirrorSourceTables.data?.tables ?? [])
                        .filter((item) => !item.mirrorOfTableId)
                        .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mirror-name">{t('mirrorDisplayName')}</Label>
                  <Input
                    id="mirror-name"
                    value={mirrorDisplayName}
                    placeholder={t('tableName')}
                    onChange={(event) => setMirrorDisplayName(event.target.value)}
                  />
                </div>
              </>
            ) : null}
            {createTableError ? (
              <p role="alert" className="text-sm text-danger">
                {createTableError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={creatingTableBusy}>
                {t('confirm')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
