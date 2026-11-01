import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { EmptyState, ErrorState, LoadingBlock, Page } from '../../components/states'
import { api } from '../../lib/api'
import { DataConnectorsSection } from './connectors-section'
import { toast } from 'sonner'

type PluginSummary = { id: string; name: string; enabled: boolean }

export function IntegrationsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const plugins = useQuery({
    queryKey: ['plugins'],
    queryFn: () => api.request<{ plugins: PluginSummary[] }>('/plugins'),
  })
  const toggle = useMutation({
    mutationFn: async (plugin: PluginSummary) => {
      await api.ensureCsrf()
      return api.request<{ plugin: PluginSummary }>(
        `/plugins/${plugin.id}/${plugin.enabled ? 'disable' : 'enable'}`,
        { method: 'POST' },
      )
    },
    onSuccess: (result) => {
      queryClient.setQueryData<{ plugins: PluginSummary[] }>(['plugins'], (current) => {
        if (!current) return current
        return {
          plugins: current.plugins.map((plugin) =>
            plugin.id === result.plugin.id ? { ...plugin, enabled: result.plugin.enabled } : plugin,
          ),
        }
      })
      void queryClient.invalidateQueries({ queryKey: ['plugins'] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('error'))
    },
  })
  return (
    <Page title={t('integrations')}>
      <DataConnectorsSection />
      <h2 className="mb-3 mt-8 text-sm font-semibold">{t('builtinPlugins')}</h2>
      {plugins.isLoading ? <LoadingBlock /> : null}
      {plugins.isError ? <ErrorState message={(plugins.error as Error).message} /> : null}
      {plugins.data && plugins.data.plugins.length === 0 ? (
        <EmptyState title={t('emptyIntegrations')} body={t('emptyIntegrations')} />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {plugins.data?.plugins.map((plugin) => (
          <Card
            key={plugin.id}
            className="flex min-h-24 flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center"
          >
            <div>
              <p className="font-medium">{plugin.name}</p>
              <p className="text-sm text-muted-foreground">
                {plugin.enabled ? t('enabled') : t('disabled')}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={toggle.isPending && toggle.variables?.id === plugin.id}
              onClick={() => toggle.mutate(plugin)}
            >
              {plugin.enabled ? t('disable') : t('enable')}
            </Button>
          </Card>
        ))}
      </div>
    </Page>
  )
}
