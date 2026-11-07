import { useQueryClient } from '@tanstack/react-query'
import { Eraser, MessagesSquare, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import type { AiCellProposal, AiChatResponse, AiFormulaProposal, AiHighlight, AiProposal } from '@datavalley/shared'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'
import { useAiFrame } from './chat-frame'
import { chatTitle, loadChats, readActiveChat, rememberChat, removeChat, writeActiveChat, writeChats, type StoredChat } from './chats'
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

function freshId() {
  return crypto.randomUUID()
}

function initialSession() {
  const chats = loadChats()
  const saved = readActiveChat()
  const active = chats.find((chat) => chat.id === saved)
  return {
    chats,
    activeId: active?.id ?? freshId(),
    lines: (active?.lines ?? []) as ChatLine[],
  }
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
  const frame = useAiFrame()
  const panelRef = useRef<HTMLElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const session = useState(initialSession)[0]
  const [open, setOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [chats, setChats] = useState<StoredChat[]>(session.chats)
  const [activeId, setActiveId] = useState(session.activeId)
  const [lines, setLines] = useState<ChatLine[]>(session.lines)
  const [applying, setApplying] = useState<number | null>(null)
  const activeRef = useRef(activeId)
  activeRef.current = activeId

  useEffect(() => () => clearMarks(), [clearMarks])

  useEffect(() => {
    const node = scrollerRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [lines, pending, open])

  useEffect(() => {
    function onResize() {
      const current = useAiFrame.getState()
      current.resize(current.width, current.height)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const panel = panelRef.current
    const bar = panel?.querySelector<HTMLElement>('[data-ai-drag]')
    const grip = panel?.querySelector<HTMLElement>('[data-ai-resize]')
    if (!bar || !grip) return
    function onBarDown(event: PointerEvent) {
      if (event.button !== 0) return
      const target = event.target
      if (target instanceof Element && target.closest('button, a, input')) return
      event.preventDefault()
      const startX = event.clientX
      const startY = event.clientY
      const origin = useAiFrame.getState()
      const previous = document.body.style.userSelect
      document.body.style.userSelect = 'none'
      function move(next: PointerEvent) {
        useAiFrame.getState().move(origin.x + next.clientX - startX, origin.y + next.clientY - startY)
      }
      function up() {
        document.body.style.userSelect = previous
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
    function onGripDown(event: PointerEvent) {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      const startX = event.clientX
      const startY = event.clientY
      const origin = useAiFrame.getState()
      function move(next: PointerEvent) {
        useAiFrame.getState().resize(origin.width + next.clientX - startX, origin.height + next.clientY - startY)
      }
      function up() {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
    bar.addEventListener('pointerdown', onBarDown)
    grip.addEventListener('pointerdown', onGripDown)
    return () => {
      bar.removeEventListener('pointerdown', onBarDown)
      grip.removeEventListener('pointerdown', onGripDown)
    }
  }, [open])

  function commit(id: string, nextLines: ChatLine[]) {
    if (activeRef.current === id) setLines(nextLines)
    setChats((current) => {
      const next = rememberChat(current, id, nextLines, chatTitle(nextLines, t('aiChatTitle')))
      writeChats(next)
      return next
    })
    writeActiveChat(id)
  }

  function close() {
    setOpen(false)
    clearMarks()
  }

  function startNew() {
    const id = freshId()
    setActiveId(id)
    setLines([])
    setHistoryOpen(false)
    writeActiveChat(id)
  }

  function openChat(id: string) {
    const chat = chats.find((item) => item.id === id)
    if (!chat) return
    setActiveId(id)
    setLines(chat.lines as ChatLine[])
    setHistoryOpen(false)
    writeActiveChat(id)
  }

  function deleteChat(id: string) {
    const next = removeChat(chats, id)
    setChats(next)
    writeChats(next)
    if (id !== activeId) return
    const idNext = freshId()
    setActiveId(idNext)
    setLines([])
    writeActiveChat(idNext)
  }

  async function send() {
    const content = draft.trim()
    if (!content || pending) return
    const id = activeId
    const history = [...lines, { role: 'user' as const, content }]
    commit(id, history)
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
      commit(id, [...history, { role: 'assistant', content: result.message, proposals: result.proposals, highlights: result.highlights }])
    } catch (error) {
      commit(id, [...history, { role: 'assistant', content: error instanceof Error ? error.message : t('error') }])
    } finally {
      setPending(false)
    }
  }

  async function apply(index: number, proposal: AiCellProposal) {
    const plan = cellWritePlan(proposal)
    const id = activeId
    setApplying(index)
    try {
      await api.request(plan.path, { method: plan.method, body: JSON.stringify(plan.body) })
      await queryClient.invalidateQueries({ queryKey: ['rows', proposal.tableId] })
      toast.success(t('aiApplied'))
      commit(id, lines.map((line, lineIndex) => (lineIndex === index ? { ...line, proposals: line.proposals?.filter((item) => item !== proposal) } : line)))
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

  const title = chatTitle(lines, t('aiChatTitle'))

  return (
    <section
      ref={panelRef}
      className="fixed z-30 flex flex-col border border-border bg-card shadow-md"
      style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
      aria-label={t('aiChatTitle')}
    >
      <div data-ai-drag="" className="flex shrink-0 cursor-grab items-center gap-2 border-b border-border px-3 py-2 select-none">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>{title}</h2>
        <div className="flex shrink-0 items-center">
          <Button type="button" variant="ghost" className="h-7 w-7 p-0" aria-label={t('aiNewChat')} title={t('aiNewChat')} onClick={startNew}>
            <Plus className="size-4" />
          </Button>
          <Button type="button" variant="ghost" className="h-7 w-7 p-0" aria-label={t('aiChats')} title={t('aiChats')} aria-pressed={historyOpen} onClick={() => setHistoryOpen((current) => !current)}>
            <MessagesSquare className="size-4" />
          </Button>
          <Button type="button" variant="ghost" className="h-7 w-7 p-0" aria-label={t('aiClearHighlights')} title={t('aiClearHighlights')} onClick={() => clearMarks()}>
            <Eraser className="size-4" />
          </Button>
          <Button type="button" variant="ghost" className="h-7 w-7 p-0" aria-label={t('close')} title={t('close')} onClick={close}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
      {historyOpen ? (
        <div className="max-h-40 shrink-0 overflow-y-auto border-b border-border">
          {chats.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">{t('aiNoChats')}</p> : null}
          {chats.map((chat) => (
            <div key={chat.id} className={`flex items-center gap-1 px-2 py-1 ${chat.id === activeId ? 'bg-accent' : ''}`}>
              <button type="button" className="h-8 min-w-0 flex-1 truncate px-1 text-left text-sm hover:bg-accent" onClick={() => openChat(chat.id)}>
                {chat.title || t('aiChatTitle')}
              </button>
              <Button type="button" variant="ghost" className="h-7 px-2" aria-label={t('aiDeleteChat')} onClick={() => deleteChat(chat.id)}>{t('delete')}</Button>
            </div>
          ))}
        </div>
      ) : null}
      <div ref={scrollerRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {lines.map((line, index) => (
          <div key={`${line.role}:${index}`} className={`flex ${line.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex max-w-[92%] flex-col gap-2 border border-border px-2 py-1.5 ${line.role === 'user' ? 'bg-accent' : 'bg-card'}`}>
              <p className="whitespace-pre-wrap text-sm">{line.content}</p>
              {line.role === 'assistant' ? line.highlights?.filter((item) => item.tableId !== context.tableId).map((item) => (
                <Link key={`${item.tableId}:${item.label}`} className="text-sm underline" to={`/projects/${item.projectId}/tables/${item.tableId}`}>
                  {item.label || t('aiOtherTables')}
                </Link>
              )) : null}
              {line.role === 'assistant' ? line.proposals?.map((proposal) =>
                proposal.kind === 'cells' ? (
                  <ProposalCard
                    key={`${proposal.tableId}:${proposal.changes.map((change) => change.rowId + change.columnId).join(',')}`}
                    proposal={proposal}
                    pending={applying === index}
                    onApply={() => void apply(index, proposal)}
                    onCancel={() => commit(activeId, lines.map((item, itemIndex) => (itemIndex === index ? { ...item, proposals: item.proposals?.filter((entry) => entry !== proposal) } : item)))}
                  />
                ) : (
                  <FormulaNote key={proposal.expression} proposal={proposal} />
                ),
              ) : null}
            </div>
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
      <button
        type="button"
        aria-label={t('formulaResize')}
        data-ai-resize=""
        className="absolute right-0 bottom-0 size-4 cursor-nwse-resize border-r-2 border-b-2 border-muted-foreground"
      />
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
