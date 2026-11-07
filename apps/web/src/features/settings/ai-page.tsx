import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { aiProviderDefaults, aiProviderIds, aiProviderModels, type AiProviderId } from '@datavalley/shared'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../components/ui/select'
import { LoadingBlock, Page } from '../../components/states'
import { api } from '../../lib/api'

type AiSettings = {
  provider: AiProviderId
  model: string
  baseUrl: string
  enabled: boolean
  hasApiKey: boolean
}

export function AiPage() {
  const { t } = useTranslation()
  const settings = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => api.request<{ settings: AiSettings }>('/ai/settings'),
  })
  return (
    <Page title={t('ai')}>
      {settings.isLoading ? <LoadingBlock /> : null}
      {settings.isError ? <p className="text-sm text-danger" role="alert">{(settings.error as Error).message}</p> : null}
      {settings.data ? <AiSettingsForm key={`${settings.data.settings.provider}:${settings.data.settings.model}:${settings.data.settings.enabled}:${settings.data.settings.hasApiKey}`} initial={settings.data.settings} /> : null}
    </Page>
  )
}

function AiSettingsForm({ initial }: { initial: AiSettings }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [provider, setProvider] = useState<AiProviderId>(initial.provider)
  const [model, setModel] = useState(initial.model)
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl)
  const [apiKey, setApiKey] = useState('')
  const [enabled, setEnabled] = useState(initial.enabled)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const ollama = useQuery({
    queryKey: ['ai-models', baseUrl],
    enabled: provider === 'ollama',
    queryFn: () => api.request<{ models: { id: string; label: string }[] }>(`/ai/models?provider=ollama&baseUrl=${encodeURIComponent(baseUrl)}`),
  })
  const providerLabels: Record<AiProviderId, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    mistral: 'Mistral',
    spacexai: 'SpaceXAI',
    ollama: 'Ollama',
  }
  const listed = provider === 'ollama' ? (ollama.data?.models ?? []) : aiProviderModels[provider]
  const selectValue = listed.some((item) => item.id === model) ? model : '__custom__'

  async function submit(nextEnabled: boolean) {
    setPending(true)
    setError('')
    try {
      await api.request('/ai/settings', {
        method: 'PUT',
        body: JSON.stringify({
          provider,
          model: model.trim(),
          baseUrl,
          enabled: nextEnabled,
          apiKey: apiKey.trim() || undefined,
        }),
      })
      setEnabled(nextEnabled)
      setApiKey('')
      toast.success(t('aiSaved'))
      await queryClient.invalidateQueries({ queryKey: ['ai-settings'] })
      await queryClient.invalidateQueries({ queryKey: ['ai-status'] })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="grid max-w-md gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit(enabled)
      }}
    >
      <p className="text-sm text-muted-foreground">{enabled ? t('aiActive') : t('aiInactive')}</p>
      <Label htmlFor="ai-provider">{t('aiProvider')}</Label>
      <Select
        value={provider}
        onValueChange={(value) => {
          const next = value as AiProviderId
          setProvider(next)
          setBaseUrl(aiProviderDefaults[next].baseUrl)
          setModel(aiProviderModels[next][0]?.id ?? '')
        }}
      >
        <SelectTrigger id="ai-provider" aria-label={t('aiProvider')} />
        <SelectContent>
          {aiProviderIds.map((id) => (
            <SelectItem key={id} value={id}>{providerLabels[id]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label htmlFor="ai-model">{t('aiModel')}</Label>
      <Select value={selectValue} onValueChange={(value) => setModel(value === '__custom__' ? '' : value)}>
        <SelectTrigger id="ai-model" aria-label={t('aiModel')} />
        <SelectContent>
          {listed.map((item) => (
            <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
          ))}
          <SelectItem value="__custom__">{t('aiCustomModel')}</SelectItem>
        </SelectContent>
      </Select>
      {selectValue === '__custom__' ? (
        <Input aria-label={t('aiCustomModel')} value={model} onChange={(event) => setModel(event.target.value)} />
      ) : null}
      <Label htmlFor="ai-key">{t('aiApiKey')}</Label>
      <Input id="ai-key" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={initial.hasApiKey ? t('aiApiKeyKeep') : ''} />
      <Label htmlFor="ai-base-url">{t('aiBaseUrl')}</Label>
      <Input id="ai-base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
      <p className="text-sm text-muted-foreground">{t('aiBaseUrlHint')}</p>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="button" variant={enabled ? 'outline' : 'default'} disabled={pending} onClick={() => void submit(!enabled)}>
          {enabled ? t('aiDeactivate') : t('aiActivate')}
        </Button>
        <Button type="submit" variant="outline" disabled={pending}>{t('save')}</Button>
      </div>
    </form>
  )
}
