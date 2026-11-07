import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiConnectorDraft } from '@datavalley/shared'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'
import { useAiEnabled } from './status'

export function AiConnectorDraft({ url, onUse }: { url: string; onUse: (draft: AiConnectorDraft) => void }) {
  const enabled = useAiEnabled()
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [draft, setDraft] = useState<AiConnectorDraft | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  if (!enabled) return null

  async function suggest() {
    const text = prompt.trim()
    if (!text || pending) return
    if (!url.trim()) {
      setError(t('aiNeedUrl'))
      return
    }
    setPending(true)
    setError('')
    try {
      const result = await api.request<{ draft: AiConnectorDraft }>('/ai/connectors/draft', {
        method: 'POST',
        body: JSON.stringify({ prompt: text, url: url.trim() }),
      })
      setDraft(result.draft)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border border-border p-2">
      <p className="text-sm font-medium">{t('aiDraft')}</p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void suggest()
        }}
      >
        <input
          aria-label={t('aiConnectorPrompt')}
          className="h-9 min-w-0 flex-1 border border-border bg-card px-2 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('aiConnectorPrompt')}
        />
        <Button type="submit" variant="outline" disabled={pending || !prompt.trim()}>{t('aiSuggest')}</Button>
      </form>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      {draft ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{draft.name}</p>
          <p className="text-sm text-muted-foreground">{draft.fields.map((field) => field.sourceKey).join(', ')}</p>
          <Button type="button" className="self-start" onClick={() => onUse(draft)}>{t('aiUse')}</Button>
        </div>
      ) : null}
    </div>
  )
}
