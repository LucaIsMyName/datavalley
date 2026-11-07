import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import type { AiCellProposal, AiChatResponse, AiFormulaProposal, AiHighlight, AiProposal } from '@datavalley/shared'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'
import { useAiHighlight } from './highlight-store'
import { highlightsForDestination, safeAppPath } from './navigate'
import { cellWritePlan } from './proposals'
import { useAiEnabled } from './status'

type ChatContext = { projectId?: string; tableId?: string }

type ChatLine = {
  role: 'user' | 'assistant'
  content: string
  proposals?: AiProposal[]
  highlights?: AiHighlight[]
}

function showValue(value: unknown) {
  if (value == null || value === '') return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

export function AiChat({ context, active = true }: { context: ChatContext; active?: boolean }) {
  const enabled = useAiEnabled()
  if (!active || !enabled) return null
  return <AiChatPanel context={context} />
}

function AiChatPanel({ context }: { context: ChatContext }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setMarks = useAiHighlight((state) => state.setMarks)
  const clearMarks = useAiHighlight((state) => state.clear)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [lines, setLines] = useState<ChatLine[]>([])
  const [applying, setApplying] = useState<number | null>(null)

  useEffect(() => () => clearMarks(), [clearMarks])

  function close() {
    setOpen(false)
    clearMarks()
  }

  async function send() {
    const content = draft.trim()
    if (!content || pending) return
    const history = [...lines, { role: 'user' as const, content }]
    setLines(history)
    setDraft('')
    setPending(true)
    try {
      const result = await api.request<AiChatResponse>('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: history.map((line) => ({ role: line.role, content: line.content })),
          context,
        }),
      })
      const path = safeAppPath(result.navigation?.path)
      const marks = highlightsForDestination(result.highlights, path, context.tableId)
      if (marks) setMarks(marks)
      if (path) navigate(path)
      setLines((current) => [...current, { role: 'assistant', content: result.message, proposals: result.proposals, highlights: result.highlights }])
    } catch (error) {
      setLines((current) => [...current, { role: 'assistant', content: error instanceof Error ? error.message : t('error') }])
    } finally {
      setPending(false)
    }
  }

  async function apply(index: number, proposal: AiCellProposal) {
    const plan = cellWritePlan(proposal)
    setApplying(index)
    try {
      await api.request(plan.path, { method: plan.method, body: JSON.stringify(plan.body) })
      await queryClient.invalidateQueries({ queryKey: ['rows', proposal.tableId] })
      toast.success(t('aiApplied'))
      setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, proposals: line.proposals?.filter((item) => item !== proposal) } : line)))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('error'))
    } finally {
      setApplying(null)
    }
  }

  if (!open) {
    return (
      <Button type="button" className="fixed bottom-4 right-4 z-30" onClick={() => setOpen(true)}>
        {t('aiAsk')}
      </Button>
    )
  }

  return (
    <section className="fixed bottom-4 right-4 z-30 flex h-[min(32rem,calc(100vh-2rem))] w-[min(24rem,calc(100vw-2rem))] flex-col border border-border bg-card shadow-md">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="text-sm font-medium">{t('aiChatTitle')}</h2>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" className="h-7 px-2" onClick={() => clearMarks()}>{t('aiClearHighlights')}</Button>
          <Button type="button" variant="ghost" className="h-7 px-2" onClick={close}>{t('close')}</Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {lines.map((line, index) => (
          <div key={`${line.role}:${index}`} className="flex flex-col gap-2">
            <p className={`whitespace-pre-wrap text-sm ${line.role === 'user' ? 'font-medium' : ''}`}>{line.content}</p>
            {line.highlights?.filter((item) => item.tableId !== context.tableId).map((item) => (
              <Link key={`${item.tableId}:${item.label}`} className="text-sm underline" to={`/projects/${item.projectId}/tables/${item.tableId}`}>
                {item.label || t('aiOtherTables')}
              </Link>
            ))}
            {line.proposals?.map((proposal) =>
              proposal.kind === 'cells' ? (
                <ProposalCard
                  key={`${proposal.tableId}:${proposal.changes.map((change) => change.rowId + change.columnId).join(',')}`}
                  proposal={proposal}
                  pending={applying === index}
                  onApply={() => void apply(index, proposal)}
                  onCancel={() => setLines((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, proposals: item.proposals?.filter((entry) => entry !== proposal) } : item)))}
                />
              ) : (
                <FormulaNote key={proposal.expression} proposal={proposal} />
              ),
            )}
          </div>
        ))}
        {pending ? <p className="text-sm text-muted-foreground">{t('aiThinking')}</p> : null}
      </div>
      <form
        className="flex shrink-0 gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <input
          aria-label={t('aiChatPlaceholder')}
          className="h-9 min-w-0 flex-1 border border-border bg-card px-2 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('aiChatPlaceholder')}
        />
        <Button type="submit" disabled={pending || !draft.trim()}>{t('aiSend')}</Button>
      </form>
    </section>
  )
}

function ProposalCard({ proposal, pending, onApply, onCancel }: { proposal: AiCellProposal; pending: boolean; onApply: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2 border border-border p-2">
      <p className="text-sm font-medium">{t('aiProposalTitle')}</p>
      {proposal.changes.slice(0, 8).map((change) => (
        <p key={`${change.rowId}:${change.columnId}`} className="text-sm">
          {change.rowLabel} {change.columnName}: {showValue(change.before)} → {showValue(change.value)}
        </p>
      ))}
      <div className="flex gap-2">
        <Button type="button" disabled={pending} onClick={onApply}>{t('aiApply')}</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>{t('cancel')}</Button>
      </div>
    </div>
  )
}

function FormulaNote({ proposal }: { proposal: AiFormulaProposal }) {
  const { t } = useTranslation()
  return (
    <div className="border border-border p-2">
      <p className="text-sm font-medium">{t('aiFormulaResult')}</p>
      <p className="break-words font-mono text-sm">{proposal.expression}</p>
      {proposal.preview ? <p className="text-sm text-muted-foreground">{proposal.preview}</p> : null}
    </div>
  )
}
