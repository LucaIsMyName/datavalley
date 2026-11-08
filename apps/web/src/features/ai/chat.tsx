import { useQueryClient } from '@tanstack/react-query'
import { Eraser, MessagesSquare, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import type { AiCellProposal, AiChatResponse, AiFormulaProposal, AiHighlight, AiProposal } from '@datavalley/shared'
import { AppSheet } from '../../components/ui/app-sheet'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import { AI_PANEL_WIDTH, AI_RAIL_WIDTH, readAiChatOpen, writeAiChatOpen } from './chat-open-state'
import { chatTitle, loadChats, readActiveChat, rememberChat, removeChat, writeActiveChat, writeChats, type StoredChat } from './chats'
import { useAiHighlight } from './highlight-store'
import { highlightsForDestination, safeAppPath } from './navigate'
import { cellWritePlan } from './proposals'
import { useAiEnabled } from './status'

const AI_DESKTOP_PANEL_ID = 'ai-chat-panel-desktop'
const AI_MOBILE_PANEL_ID = 'ai-chat-panel-mobile'

function useIsMobileViewport() {
  const query = '(max-width: 767px)'
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setMobile(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return mobile
}

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
  const isMobile = useIsMobileViewport()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setMarks = useAiHighlight((state) => state.setMarks)
  const clearMarks = useAiHighlight((state) => state.clear)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const session = useState(initialSession)[0]
  const [open, setOpen] = useState(readAiChatOpen)
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

  function setChatOpen(next: boolean) {
    setOpen(next)
    writeAiChatOpen(next)
    if (!next) clearMarks()
  }

  function toggleOpen() {
    setChatOpen(!open)
  }

  function commit(id: string, nextLines: ChatLine[]) {
    if (activeRef.current === id) setLines(nextLines)
    setChats((current) => {
      const next = rememberChat(current, id, nextLines, chatTitle(nextLines, t('aiChatTitle')))
      writeChats(next)
      return next
    })
    writeActiveChat(id)
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

  const title = chatTitle(lines, t('aiChatTitle'))

  const body = (
    <AiChatPanelBody
      title={title}
      lines={lines}
      pending={pending}
      historyOpen={historyOpen}
      chats={chats}
      activeId={activeId}
      draft={draft}
      applying={applying}
      context={context}
      scrollerRef={scrollerRef}
      onDraftChange={setDraft}
      onSend={() => void send()}
      onStartNew={startNew}
      onToggleHistory={() => setHistoryOpen((current) => !current)}
      onClearHighlights={() => clearMarks()}
      onClose={() => setChatOpen(false)}
      onOpenChat={openChat}
      onDeleteChat={deleteChat}
      onApply={apply}
      onCancelProposal={(index, proposal) =>
        commit(activeId, lines.map((item, itemIndex) => (itemIndex === index ? { ...item, proposals: item.proposals?.filter((entry) => entry !== proposal) } : item)))
      }
    />
  )

  return (
    <>
      <div
        className="hidden h-full shrink-0 self-stretch border-l border-border bg-card md:flex"
        aria-label={t('aiChatTitle')}
      >
        <button
          type="button"
          className="flex h-full shrink-0 flex-col items-center justify-center gap-2 border-r border-border bg-card text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          style={{ width: AI_RAIL_WIDTH }}
          aria-label={t('aiAsk')}
          aria-expanded={open}
          aria-controls={AI_DESKTOP_PANEL_ID}
          onClick={toggleOpen}
        >
          <MessagesSquare className="size-4 shrink-0" aria-hidden />
          <span className="text-[10px] leading-tight tracking-wide [writing-mode:vertical-rl]">{t('aiAsk')}</span>
        </button>
        {open && !isMobile ? (
          <section
            id={AI_DESKTOP_PANEL_ID}
            className="flex min-h-0 min-w-0 flex-col"
            style={{ width: AI_PANEL_WIDTH }}
          >
            {body}
          </section>
        ) : null}
      </div>

      <button
        type="button"
        className="fixed inset-x-0 bottom-0 z-30 flex h-11 items-center justify-center gap-2 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] text-sm font-medium hover:bg-accent md:hidden"
        aria-label={t('aiAsk')}
        aria-expanded={open}
        aria-controls={AI_MOBILE_PANEL_ID}
        onClick={toggleOpen}
      >
        <MessagesSquare className="size-4 shrink-0" aria-hidden />
        {t('aiAsk')}
      </button>

      {isMobile ? (
        <AppSheet open={open} onOpenChange={setChatOpen} title={title} contentId={AI_MOBILE_PANEL_ID}>
          {body}
        </AppSheet>
      ) : null}
    </>
  )
}

type PanelBodyProps = {
  title: string
  lines: ChatLine[]
  pending: boolean
  historyOpen: boolean
  chats: StoredChat[]
  activeId: string
  draft: string
  applying: number | null
  context: ChatContext
  scrollerRef: React.RefObject<HTMLDivElement | null>
  onDraftChange: (value: string) => void
  onSend: () => void
  onStartNew: () => void
  onToggleHistory: () => void
  onClearHighlights: () => void
  onClose: () => void
  onOpenChat: (id: string) => void
  onDeleteChat: (id: string) => void
  onApply: (index: number, proposal: AiCellProposal) => void
  onCancelProposal: (index: number, proposal: AiProposal) => void
}

function AiChatPanelBody({
  title,
  lines,
  pending,
  historyOpen,
  chats,
  activeId,
  draft,
  applying,
  context,
  scrollerRef,
  onDraftChange,
  onSend,
  onStartNew,
  onToggleHistory,
  onClearHighlights,
  onClose,
  onOpenChat,
  onDeleteChat,
  onApply,
  onCancelProposal,
}: PanelBodyProps) {
  const { t } = useTranslation()

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium" title={historyOpen ? t('aiChats') : title}>
          {historyOpen ? t('aiChats') : title}
        </h2>
        <div className="flex shrink-0 items-center">
          <Button type="button" variant="ghost" className="h-7 w-7 p-0" aria-label={t('aiNewChat')} title={t('aiNewChat')} onClick={onStartNew}>
            <Plus className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-7 w-7 p-0"
            aria-label={t('aiChats')}
            title={t('aiChats')}
            aria-pressed={historyOpen}
            onClick={onToggleHistory}
          >
            <MessagesSquare className="size-4" />
          </Button>
          <Button type="button" variant="ghost" className="h-7 w-7 p-0" aria-label={t('aiClearHighlights')} title={t('aiClearHighlights')} onClick={onClearHighlights}>
            <Eraser className="size-4" />
          </Button>
          <Button type="button" variant="ghost" className="h-7 w-7 p-0" aria-label={t('close')} title={t('close')} onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
      {historyOpen ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {chats.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">{t('aiNoChats')}</p> : null}
          {chats.map((chat) => (
            <div key={chat.id} className={cn('flex items-center gap-1 px-2 py-1', chat.id === activeId ? 'bg-accent' : '')}>
              <button type="button" className="h-8 min-w-0 flex-1 truncate px-1 text-left text-sm hover:bg-accent" onClick={() => onOpenChat(chat.id)}>
                {chat.title || t('aiChatTitle')}
              </button>
              <Button type="button" variant="ghost" className="h-7 px-2" aria-label={t('aiDeleteChat')} onClick={() => onDeleteChat(chat.id)}>
                {t('delete')}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div ref={scrollerRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {lines.map((line, index) => (
              <div key={`${line.role}:${index}`} className={`flex ${line.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={cn('flex max-w-[92%] flex-col gap-2 border border-border px-2 py-1.5', line.role === 'user' ? 'bg-accent' : 'bg-card')}>
                  <p className="whitespace-pre-wrap text-sm">{line.content}</p>
                  {line.role === 'assistant'
                    ? line.highlights?.filter((item) => item.tableId !== context.tableId).map((item) => (
                        <Link key={`${item.tableId}:${item.label}`} className="text-sm underline" to={`/projects/${item.projectId}/tables/${item.tableId}`}>
                          {item.label || t('aiOtherTables')}
                        </Link>
                      ))
                    : null}
                  {line.role === 'assistant'
                    ? line.proposals?.map((proposal) =>
                        proposal.kind === 'cells' ? (
                          <ProposalCard
                            key={`${proposal.tableId}:${proposal.changes.map((change) => change.rowId + change.columnId).join(',')}`}
                            proposal={proposal}
                            pending={applying === index}
                            onApply={() => void onApply(index, proposal)}
                            onCancel={() => onCancelProposal(index, proposal)}
                          />
                        ) : (
                          <FormulaNote key={proposal.expression} proposal={proposal} />
                        ),
                      )
                    : null}
                </div>
              </div>
            ))}
            {pending ? <p className="text-sm text-muted-foreground">{t('aiThinking')}</p> : null}
          </div>
          <form
            className="flex shrink-0 gap-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault()
              onSend()
            }}
          >
            <input
              aria-label={t('aiChatPlaceholder')}
              className="h-9 min-w-0 flex-1 border border-border bg-card px-2 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder={t('aiChatPlaceholder')}
            />
            <Button type="submit" disabled={pending || !draft.trim()}>
              {t('aiSend')}
            </Button>
          </form>
        </>
      )}
    </>
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
        <Button type="button" disabled={pending} onClick={onApply}>
          {t('aiApply')}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
          {t('cancel')}
        </Button>
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
