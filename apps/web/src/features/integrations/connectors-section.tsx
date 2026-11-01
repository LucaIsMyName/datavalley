import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { IconButton } from '../../components/icon-button'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Checkbox } from '../../components/ui/checkbox'
import { CsvDelimiterField, csvDelimiterWire, defaultCsvDelimiter, type CsvDelimiterValue } from '../../components/csv-delimiter-field'
import { EmptyState, ErrorState, LoadingBlock } from '../../components/states'
import { Label } from '../../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../components/ui/select'
import { api } from '../../lib/api'
import type { Project } from '@datavalley/api-client'
import { ResourceIcon } from '../../components/resource-icon'

export type ConnectorRecord = {
  id: string
  name: string
  icon: string
  enabled: boolean
  format: 'json' | 'csv' | 'xml' | 'html'
  projectId: string | null
  source: { baseUrl: string; pathTemplate?: string; method?: string; headers?: Record<string, string> }
  auth: { type: string; hasSecret?: boolean }
  parse: {
    version: 1
    recordsPath?: string
    externalIdPath?: string
    fields: { sourceKey: string; targetFieldKey: string; targetLabel?: string; coerce?: string }[]
    csv?: { delimiter?: string; headerRow?: boolean }
  }
  schedule: { preset: string; timezone?: string }
  retention: { mode: string; missingAfterDays?: number }
  hasApiKey: boolean
}

type FieldDraft = { sourceKey: string; targetFieldKey: string; targetLabel: string }

const emptyDraft = (): FieldDraft => ({ sourceKey: '', targetFieldKey: '', targetLabel: '' })

export function DataConnectorsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ConnectorRecord | null>(null)
  const connectors = useQuery({
    queryKey: ['connectors'],
    queryFn: () => api.request<{ connectors: ConnectorRecord[] }>('/connectors'),
  })
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.request<{ projects: Project[] }>('/projects'),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.ensureCsrf()
      return api.request(`/connectors/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['connectors'] })
      toast.success(t('connectorDeleted'))
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('error')),
  })

  const sync = useMutation({
    mutationFn: async (id: string) => {
      await api.ensureCsrf()
      return api.request(`/connectors/${id}/sync`, { method: 'POST', body: JSON.stringify({}) })
    },
    onSuccess: () => {
      toast.success(t('connectorSyncQueued'))
      void queryClient.invalidateQueries({ queryKey: ['rows'] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('error')),
  })

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t('dataConnectors')}</h2>
          <p className="text-sm text-muted-foreground">{t('dataConnectorsHint')}</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null)
            setEditorOpen(true)
          }}
        >
          {t('createConnector')}
        </Button>
      </div>
      {connectors.isLoading ? <LoadingBlock /> : null}
      {connectors.isError ? <ErrorState message={(connectors.error as Error).message} /> : null}
      {connectors.data && connectors.data.connectors.length === 0 ? (
        <EmptyState title={t('emptyConnectors')} body={t('emptyConnectorsHint')} />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {connectors.data?.connectors.map((connector) => (
          <Card key={connector.id} className="flex min-h-24 flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <ResourceIcon name={connector.icon} className="size-8 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{connector.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {connector.format.toUpperCase()}
                    {connector.projectId ? ` · ${t('projectScoped')}` : ` · ${t('orgWide')}`}
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{connector.enabled ? t('enabled') : t('disabled')}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => { setEditing(connector); setEditorOpen(true) }}>
                {t('edit')}
              </Button>
              <Button type="button" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(connector.id)}>
                {t('runSync')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(t('deleteConnectorConfirm'))) remove.mutate(connector.id)
                }}
              >
                {t('delete')}
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <ConnectorEditorDialog
        open={editorOpen}
        connector={editing}
        projects={projects.data?.projects ?? []}
        onOpenChange={(open) => {
          setEditorOpen(open)
          if (!open) setEditing(null)
        }}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ['connectors'] })
          setEditorOpen(false)
          setEditing(null)
        }}
      />
    </section>
  )
}

function ConnectorEditorDialog(props: {
  open: boolean
  connector: ConnectorRecord | null
  projects: Project[]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const { open, connector, projects, onOpenChange, onSaved } = props
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('Globe')
  const [scope, setScope] = useState<'org' | 'project'>('org')
  const [projectId, setProjectId] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [format, setFormat] = useState<'json' | 'csv' | 'xml' | 'html'>('json')
  const [recordsPath, setRecordsPath] = useState('')
  const [externalIdPath, setExternalIdPath] = useState('')
  const [fields, setFields] = useState<FieldDraft[]>([emptyDraft()])
  const [csvDelimiter, setCsvDelimiter] = useState<CsvDelimiterValue>(defaultCsvDelimiter())
  const [csvHeader, setCsvHeader] = useState(true)
  const [schedule, setSchedule] = useState<'manual' | 'hourly' | 'daily' | 'weekly'>('manual')
  const [retentionMode, setRetentionMode] = useState<'forever' | 'drop_missing'>('forever')
  const [missingDays, setMissingDays] = useState('7')
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([])
  const [previewKeys, setPreviewKeys] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draftConnectorId, setDraftConnectorId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDraftConnectorId(connector?.id ?? null)
    setName(connector?.name ?? '')
    setIcon(connector?.icon ?? 'Globe')
    setScope(connector?.projectId ? 'project' : 'org')
    setProjectId(connector?.projectId ?? '')
    setBaseUrl(connector?.source.baseUrl ?? '')
    setApiKey('')
    setFormat(connector?.format ?? 'json')
    setRecordsPath(connector?.parse.recordsPath ?? '')
    setExternalIdPath(connector?.parse.externalIdPath ?? '')
    setFields(
      connector?.parse.fields.length
        ? connector.parse.fields.map((field) => ({
            sourceKey: field.sourceKey,
            targetFieldKey: field.targetFieldKey,
            targetLabel: field.targetLabel ?? field.targetFieldKey,
          }))
        : [emptyDraft()],
    )
    setCsvDelimiter(
      connector?.parse.csv?.delimiter
        ? { kind: 'custom', value: connector.parse.csv.delimiter }
        : defaultCsvDelimiter(),
    )
    setCsvHeader(connector?.parse.csv?.headerRow ?? true)
    setSchedule((connector?.schedule.preset as typeof schedule) ?? 'manual')
    setRetentionMode((connector?.retention.mode as typeof retentionMode) ?? 'forever')
    setMissingDays(String(connector?.retention.missingAfterDays ?? 7))
    setPreviewRows([])
    setPreviewKeys([])
    setError('')
  }, [open, connector])

  const payload = () => ({
    name: name.trim(),
    icon,
    projectId: scope === 'project' ? projectId : null,
    source: { baseUrl: baseUrl.trim() },
    auth: { type: apiKey.trim() ? 'api_key_header' : 'none', headerName: 'Authorization' },
    format,
    parse: {
      version: 1 as const,
      recordsPath: recordsPath.trim() || undefined,
      externalIdPath: externalIdPath.trim() || undefined,
      fields: fields
        .filter((field) => field.sourceKey.trim())
        .map((field) => ({
          sourceKey: field.sourceKey.trim(),
          targetFieldKey: field.targetFieldKey.trim() || field.sourceKey.trim(),
          targetLabel: field.targetLabel.trim() || undefined,
        })),
      csv: format === 'csv' ? { delimiter: csvDelimiterWire(csvDelimiter), headerRow: csvHeader } : undefined,
    },
    schedule: { preset: schedule, timezone: 'UTC' },
    retention:
      retentionMode === 'forever'
        ? { mode: 'forever' as const }
        : { mode: 'drop_missing' as const, missingAfterDays: Number(missingDays) || 7 },
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
  })

  async function save() {
    setError('')
    setBusy(true)
    try {
      await api.ensureCsrf()
      const existingId = connector?.id ?? draftConnectorId
      if (existingId) {
        await api.request(`/connectors/${existingId}`, { method: 'PATCH', body: JSON.stringify(payload()) })
      } else {
        const created = await api.request<{ connector: ConnectorRecord }>('/connectors', { method: 'POST', body: JSON.stringify(payload()) })
        setDraftConnectorId(created.connector.id)
      }
      onSaved()
      toast.success(t('connectorSaved'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setBusy(false)
    }
  }

  async function testFetch() {
    setError('')
    setBusy(true)
    try {
      await api.ensureCsrf()
      let id = connector?.id ?? draftConnectorId
      if (!id) {
        const created = await api.request<{ connector: ConnectorRecord }>('/connectors', { method: 'POST', body: JSON.stringify(payload()) })
        id = created.connector.id
        setDraftConnectorId(id)
      } else {
        await api.request(`/connectors/${id}`, { method: 'PATCH', body: JSON.stringify(payload()) })
      }
      const preview = await api.request<{ rows: Record<string, string>[]; sampleKeys: string[] }>(`/connectors/${id}/preview`, {
        method: 'POST',
        body: JSON.stringify({ limit: 5 }),
      })
      setPreviewRows(preview.rows)
      setPreviewKeys(preview.sampleKeys)
      if (preview.sampleKeys.length > 0 && fields.length === 1 && !fields[0].sourceKey) {
        setFields(
          preview.sampleKeys.slice(0, 8).map((key) => ({
            sourceKey: key,
            targetFieldKey: key.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
            targetLabel: key,
          })),
        )
      }
      toast.success(t('connectorPreviewReady'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(90vh,48rem)] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col border border-border bg-card shadow-md">
          <div className="border-b border-border p-4">
            <Dialog.Title className="text-base font-semibold">{connector ? t('editConnector') : t('createConnector')}</Dialog.Title>
            <Dialog.Description className="sr-only">{t('dataConnectors')}</Dialog.Description>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <IconButton name={icon} onChange={setIcon} />
                <input
                  aria-label={t('connectorName')}
                  className="h-9 min-w-0 flex-1 border border-border bg-card px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('connectorName')}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>{t('connectorScope')}</Label>
                  <Select value={scope} onValueChange={(value) => setScope(value as 'org' | 'project')}>
                    <SelectTrigger aria-label={t('connectorScope')} />
                    <SelectContent>
                      <SelectItem value="org">{t('orgWide')}</SelectItem>
                      <SelectItem value="project">{t('projectScoped')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {scope === 'project' ? (
                  <div className="flex flex-col gap-1.5">
                    <Label>{t('project')}</Label>
                    <Select value={projectId || undefined} onValueChange={setProjectId}>
                      <SelectTrigger aria-label={t('project')} />
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
              <input
                aria-label={t('connectorBaseUrl')}
                className="h-9 w-full border border-border bg-card px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://example.com/data.json"
              />
              <input
                aria-label={t('connectorApiKey')}
                className="h-9 w-full border border-border bg-card px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={connector?.hasApiKey ? t('connectorApiKeyKeep') : t('connectorApiKeyOptional')}
                type="password"
                autoComplete="off"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>{t('connectorFormat')}</Label>
                  <Select value={format} onValueChange={(value) => setFormat(value as typeof format)}>
                    <SelectTrigger aria-label={t('connectorFormat')} />
                    <SelectContent>
                      <SelectItem value="json">JSON</SelectItem>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="xml">XML</SelectItem>
                      <SelectItem value="html">HTML</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t('connectorSchedule')}</Label>
                  <Select value={schedule} onValueChange={(value) => setSchedule(value as typeof schedule)}>
                    <SelectTrigger aria-label={t('connectorSchedule')} />
                    <SelectContent>
                      <SelectItem value="manual">{t('scheduleManual')}</SelectItem>
                      <SelectItem value="hourly">{t('scheduleHourly')}</SelectItem>
                      <SelectItem value="daily">{t('scheduleDaily')}</SelectItem>
                      <SelectItem value="weekly">{t('scheduleWeekly')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {format === 'json' || format === 'xml' || format === 'html' ? (
                <input
                  aria-label={t('connectorRecordsPath')}
                  className="h-9 w-full border border-border bg-card px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  value={recordsPath}
                  onChange={(event) => setRecordsPath(event.target.value)}
                  placeholder={format === 'json' ? 'items' : format === 'xml' ? '/items/item' : '.item-row'}
                />
              ) : null}
              {format === 'csv' ? (
                <>
                  <CsvDelimiterField value={csvDelimiter} onChange={setCsvDelimiter} />
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={csvHeader} onCheckedChange={(next) => setCsvHeader(next === true)} />
                    {t('csvHasHeader')}
                  </label>
                </>
              ) : null}
              <input
                aria-label={t('connectorExternalId')}
                className="h-9 w-full border border-border bg-card px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                value={externalIdPath}
                onChange={(event) => setExternalIdPath(event.target.value)}
                placeholder={t('connectorExternalIdHint')}
              />
              <div className="flex flex-col gap-2">
                <Label>{t('connectorFieldMapping')}</Label>
                {fields.map((field, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-3">
                    <input
                      aria-label={t('connectorSourceKey')}
                      className="h-9 border border-border bg-card px-2 text-sm"
                      value={field.sourceKey}
                      onChange={(event) => setFields((current) => current.map((row, i) => (i === index ? { ...row, sourceKey: event.target.value } : row)))}
                      placeholder={t('connectorSourceKey')}
                    />
                    <input
                      aria-label={t('connectorTargetKey')}
                      className="h-9 border border-border bg-card px-2 text-sm"
                      value={field.targetFieldKey}
                      onChange={(event) => setFields((current) => current.map((row, i) => (i === index ? { ...row, targetFieldKey: event.target.value } : row)))}
                      placeholder={t('connectorTargetKey')}
                    />
                    <input
                      aria-label={t('columnName')}
                      className="h-9 border border-border bg-card px-2 text-sm"
                      value={field.targetLabel}
                      onChange={(event) => setFields((current) => current.map((row, i) => (i === index ? { ...row, targetLabel: event.target.value } : row)))}
                      placeholder={t('columnName')}
                    />
                  </div>
                ))}
                <Button type="button" variant="outline" className="self-start" onClick={() => setFields((current) => [...current, emptyDraft()])}>
                  {t('addField')}
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>{t('connectorRetention')}</Label>
                  <Select value={retentionMode} onValueChange={(value) => setRetentionMode(value as typeof retentionMode)}>
                    <SelectTrigger aria-label={t('connectorRetention')} />
                    <SelectContent>
                      <SelectItem value="forever">{t('retentionForever')}</SelectItem>
                      <SelectItem value="drop_missing">{t('retentionDropMissing')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {retentionMode === 'drop_missing' ? (
                  <div className="flex flex-col gap-1.5">
                    <Label>{t('retentionMissingDays')}</Label>
                    <input
                      aria-label={t('retentionMissingDays')}
                      className="h-9 border border-border bg-card px-3 text-sm"
                      value={missingDays}
                      onChange={(event) => setMissingDays(event.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                ) : null}
              </div>
              {previewRows.length > 0 ? (
                <div className="rounded border border-border p-2 text-xs">
                  <p className="mb-1 font-medium">{t('connectorPreview')}</p>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap">{JSON.stringify(previewRows, null, 2)}</pre>
                  {previewKeys.length > 0 ? <p className="mt-1 text-muted-foreground">{previewKeys.join(', ')}</p> : null}
                </div>
              ) : null}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void testFetch()}>
              {t('testFetch')}
            </Button>
            <Button type="button" disabled={busy || !name.trim() || !baseUrl.trim()} onClick={() => void save()}>
              {t('save')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
