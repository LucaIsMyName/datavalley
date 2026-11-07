import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'
import { useAiEnabled } from './status'

export function AiFormulaSuggest({
  tableId,
  columnId,
  rowId,
  onUse,
}: {
  tableId: string
  columnId: string
  rowId?: string
  onUse: (expression: string) => void
}) {
  const enabled = useAiEnabled()
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [expression, setExpression] = useState('')
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  if (!enabled) return null

  async function suggest() {
    const text = prompt.trim()
    if (!text || pending) return
    setPending(true)
    setError('')
    try {
      const result = await api.request<{ expression: string; preview: string }>('/ai/formula', {
        method: 'POST',
        body: JSON.stringify({ prompt: text, tableId, columnId, rowId }),
      })
      setExpression(result.expression)
      setPreview(result.preview)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border border-border p-2">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void suggest()
        }}
      >
        <input
          aria-label={t('aiFormulaPrompt')}
          className="h-9 min-w-0 flex-1 border border-border bg-card px-2 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('aiFormulaPrompt')}
        />
        <Button type="submit" variant="outline" disabled={pending || !prompt.trim()}>{t('aiSuggest')}</Button>
      </form>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      {expression ? (
        <div className="flex flex-col gap-2">
          <p className="break-words font-mono text-sm">{expression}</p>
          {preview ? <p className="text-sm text-muted-foreground">{preview}</p> : null}
          <Button type="button" className="self-start" onClick={() => onUse(expression)}>{t('aiUse')}</Button>
        </div>
      ) : null}
    </div>
  )
}
