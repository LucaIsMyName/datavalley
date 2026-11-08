import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppDialog } from '../../components/ui/app-dialog'
import { Button } from '../../components/ui/button'
import { Label } from '../../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../components/ui/select'
import { api } from '../../lib/api'

export function ConnectConnectorDialog({
  open,
  projectId,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean
  projectId: string
  pending: boolean
  onClose: () => void
  onConfirm: (connectorId: string) => void
}) {
  const { t } = useTranslation()
  const [connectorId, setConnectorId] = useState('')
  const connectors = useQuery({
    queryKey: ['connectors', projectId],
    enabled: open && Boolean(projectId),
    queryFn: () =>
      api.request<{ connectors: { id: string; name: string }[] }>(
        `/connectors?projectId=${encodeURIComponent(projectId)}`,
      ),
  })

  useEffect(() => {
    if (!open) setConnectorId('')
  }, [open])

  const options = connectors.data?.connectors ?? []

  return (
    <AppDialog
      open={open}
      title={t('connectConnectorTitle')}
      description={t('connectConnectorWarning')}
      onOpenChange={(next) => {
        if (!next && !pending) onClose()
      }}
    >
      <div className="mt-3 flex flex-col gap-1.5">
        <Label htmlFor="reconnect-connector">{t('chooseConnector')}</Label>
        <Select value={connectorId || undefined} onValueChange={setConnectorId} disabled={pending}>
          <SelectTrigger id="reconnect-connector" aria-label={t('chooseConnector')} />
          <SelectContent>
            {options.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {connectors.isSuccess && options.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noConnectorsForTable')}</p>
        ) : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button
          type="button"
          disabled={pending || !connectorId}
          aria-busy={pending}
          onClick={() => {
            if (connectorId) onConfirm(connectorId)
          }}
        >
          {t('connectConnectorConfirm')}
        </Button>
      </div>
    </AppDialog>
  )
}
