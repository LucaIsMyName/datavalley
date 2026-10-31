import { Bell, BookOpen, FolderKanban, LayoutDashboard, LogOut, Menu, Plug, Settings, Star, Clock3, type LucideIcon } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { api } from '../lib/api'
import { applyTheme, useSession } from '../stores/session'
import { Breadcrumbs } from '../components/breadcrumbs'
import { ContextMenuProvider } from '../components/context-menu'
import { HeaderSearch } from '../components/command-palette'
import { Button } from '../components/ui/button'
import { Toaster } from '../components/ui/sonner'
import { FormulaWindow } from '../features/tables/formula-window'

const links: { to: string; key: string; icon: LucideIcon; end: boolean }[] = [
  { to: '/', key: 'dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', key: 'projects', icon: FolderKanban, end: false },
  { to: '/recent', key: 'recent', icon: Clock3, end: false },
  { to: '/favorites', key: 'favorites', icon: Star, end: false },
  { to: '/doc', key: 'docs', icon: BookOpen, end: false },
  { to: '/integrations', key: 'integrations', icon: Plug, end: false },
  { to: '/settings/profile', key: 'settings', icon: Settings, end: false },
]

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <>
      <div className="px-2 py-3 text-sm font-semibold tracking-tight">{t('appName')}</div>
      <nav className="flex flex-1 flex-col gap-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex h-11 items-center gap-2 rounded-md px-2 text-sm md:h-9 ${isActive ? 'bg-accent font-medium' : 'hover:bg-accent'}`
            }
          >
            <link.icon className="size-4" />
            {t(link.key)}
          </NavLink>
        ))}
      </nav>
      <Button
        variant="ghost"
        className="h-11 md:h-9"
        onClick={async () => {
          await api.request('/auth/logout', { method: 'POST' })
          useSession.getState().setUser(null)
          navigate('/login')
          onNavigate?.()
        }}
      >
        <LogOut className="size-4" />
        {t('logout')}
      </Button>
    </>
  )
}

export function AppShell() {
  const { t, i18n } = useTranslation()
  const user = useSession((state) => state.user)
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [nav, setNav] = useState(false)
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.request<{ notifications: { id: string; title: string; readAt: string | null }[] }>('/notifications'),
  })

  useEffect(() => {
    const stored = (localStorage.getItem('theme') ?? user?.theme ?? 'system') as 'light' | 'dark' | 'system'
    applyTheme(stored)
    if (user?.locale) void i18n.changeLanguage(user.locale)
  }, [i18n, user?.locale, user?.theme])

  return (
    <ContextMenuProvider>
      <div className="flex h-screen overflow-hidden">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card p-3 md:flex">
          <SideNav />
        </aside>
        {nav ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button type="button" className="absolute inset-0 bg-black/40" aria-label={t('close')} onClick={() => setNav(false)} />
            <aside className="relative flex h-full w-60 flex-col border-r border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <SideNav onNavigate={() => setNav(false)} />
            </aside>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
          <header className="flex h-14 min-w-0 items-center gap-1 border-b border-border px-3 md:px-4">
            <Button variant="ghost" className="shrink-0 md:hidden" aria-label={t('menu')} onClick={() => setNav(true)}>
              <Menu className="size-4" />
            </Button>
            <Breadcrumbs />
            <HeaderSearch />
            <div className="relative shrink-0">
              <Button variant="ghost" aria-label={t('notifications')} onClick={() => setOpen((value) => !value)}>
                <Bell className="size-4" />
              </Button>
              {open ? (
                <div className="absolute right-0 z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-md border border-border bg-card p-2 shadow-sm">
                  <p className="px-2 py-1 text-sm font-medium">{t('notifications')}</p>
                  <div className="min-h-16">
                    {(notifications.data?.notifications ?? []).length === 0 ? (
                      <p className="px-2 py-3 text-sm text-muted-foreground">{t('noNotifications')}</p>
                    ) : (
                      notifications.data?.notifications.map((item) => (
                        <button
                          key={item.id}
                          className="block min-h-11 w-full rounded px-2 py-2 text-left text-sm hover:bg-accent"
                          onClick={() => {
                            void api.request(`/notifications/${item.id}/read`, { method: 'POST' }).then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
                          }}
                        >
                          {item.title}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </header>
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
      <Toaster />
      <FormulaWindow />
    </ContextMenuProvider>
  )
}
