import { Command } from 'cmdk'
import { Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { api } from '../lib/api'
import { Button } from './ui/button'

type SearchHit = { id: string; title: string; subtitle: string | null; href: string }
type SearchGroup = 'projects' | 'tables' | 'columns' | 'rows' | 'routes' | 'favorites' | 'integrations'
type SearchResults = Record<SearchGroup, SearchHit[]>

const typedGroups: SearchGroup[] = ['projects', 'tables', 'columns', 'rows', 'routes', 'favorites', 'integrations']
const focusedGroups: SearchGroup[] = ['routes', 'tables']

function localeOf(language: string) {
  return language.startsWith('de') ? 'de' : 'en'
}

export function HeaderSearch() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [panel, setPanel] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const locale = localeOf(i18n.language)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 200)
    return () => window.clearTimeout(timer)
  }, [query])

  const results = useQuery({
    queryKey: ['search', debounced, locale],
    enabled: panel || drawer,
    placeholderData: (previous) => previous,
    queryFn: () => {
      const params = new URLSearchParams({ locale })
      const text = debounced.trim()
      if (text) params.set('q', text)
      return api.request<SearchResults>(`/search?${params}`)
    },
  })

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      if (window.matchMedia('(min-width: 768px)').matches) {
        setPanel(true)
        inputRef.current?.focus()
      } else {
        setDrawer(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function pick(href: string) {
    setPanel(false)
    setDrawer(false)
    setQuery('')
    navigate(href)
  }

  return (
    <>
      <div className="relative hidden w-64 md:block">
        <SearchMenu
          inputRef={inputRef}
          query={query}
          onQuery={setQuery}
          open={panel}
          onOpen={setPanel}
          results={results.data}
          loading={results.isLoading}
          error={results.isError}
          onPick={pick}
          variant="inline"
        />
      </div>
      <Button variant="ghost" className="md:hidden" aria-label={t('search')} onClick={() => setDrawer(true)}>
        <Search className="size-4" />
      </Button>
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed inset-0 z-50 flex flex-col bg-card p-4">
            <Dialog.Title className="sr-only">{t('search')}</Dialog.Title>
            <Dialog.Description className="sr-only">{t('search')}</Dialog.Description>
            <SearchMenu
              query={query}
              onQuery={setQuery}
              open
              onOpen={setDrawer}
              results={results.data}
              loading={results.isLoading}
              error={results.isError}
              onPick={pick}
              variant="drawer"
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

function SearchMenu({
  inputRef,
  query,
  onQuery,
  open,
  onOpen,
  results,
  loading,
  error,
  onPick,
  variant,
}: {
  inputRef?: RefObject<HTMLInputElement | null>
  query: string
  onQuery: (value: string) => void
  open: boolean
  onOpen: (open: boolean) => void
  results: SearchResults | undefined
  loading: boolean
  error: boolean
  onPick: (href: string) => void
  variant: 'inline' | 'drawer'
}) {
  const { t } = useTranslation()
  const groups = (query.trim() ? typedGroups : focusedGroups)
    .map((key) => ({ key, label: t(groupLabel[key]), hits: results?.[key] ?? [] }))
    .filter((group) => group.hits.length > 0)
  const showList = variant === 'drawer' || open

  return (
    <Command
      shouldFilter={false}
      vimBindings={false}
      label={t('search')}
      className={variant === 'drawer' ? 'flex min-h-0 flex-1 flex-col' : undefined}
    >
      <div className={variant === 'drawer' ? 'flex items-center gap-2' : undefined}>
        <Command.Input
          ref={inputRef}
          autoFocus={variant === 'drawer'}
          value={query}
          onValueChange={onQuery}
          placeholder={t('search')}
          aria-label={t('search')}
          onFocus={() => onOpen(true)}
          onBlur={() => {
            if (variant === 'inline') onOpen(false)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || variant !== 'inline') return
            onOpen(false)
            event.currentTarget.blur()
          }}
          className="h-9 w-full border border-border bg-card px-3 text-base outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:text-sm"
        />
        {variant === 'drawer' ? (
          <Button type="button" variant="ghost" onClick={() => onOpen(false)}>
            {t('close')}
          </Button>
        ) : null}
      </div>
      {showList ? (
        <Command.List
          className={
            variant === 'inline'
              ? 'absolute right-0 top-full z-30 mt-1 max-h-80 min-h-16 w-80 overflow-auto border border-border bg-card p-1 shadow-md [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground'
              : 'mt-3 min-h-16 flex-1 overflow-auto [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground'
          }
          onMouseDown={(event) => event.preventDefault()}
        >
          {loading ? <p className="px-2 py-3 text-sm text-muted-foreground">{t('loading')}</p> : null}
          {error ? <p className="px-2 py-3 text-sm text-muted-foreground">{t('error')}</p> : null}
          {!loading && !error && groups.length === 0 ? (
            <Command.Empty className="px-2 py-3 text-sm text-muted-foreground">{t('searchEmpty')}</Command.Empty>
          ) : null}
          {groups.map((group) => (
            <Command.Group key={group.key} heading={group.label}>
              {group.hits.map((hit) => (
                <Command.Item
                  key={hit.id}
                  value={hit.id}
                  onSelect={() => onPick(hit.href)}
                  className="flex min-h-11 cursor-pointer flex-col justify-center px-2 py-2 text-left data-[selected=true]:bg-accent"
                >
                  <span className="truncate text-sm">{hit.title}</span>
                  {hit.subtitle ? <span className="truncate text-xs text-muted-foreground">{hit.subtitle}</span> : null}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      ) : null}
    </Command>
  )
}

const groupLabel: Record<SearchGroup, string> = {
  projects: 'projects',
  tables: 'searchTables',
  columns: 'searchColumns',
  rows: 'searchRows',
  routes: 'searchRoutes',
  favorites: 'favorites',
  integrations: 'integrations',
}
