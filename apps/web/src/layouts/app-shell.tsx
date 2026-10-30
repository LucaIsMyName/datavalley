import { Bell, BookOpen, FolderKanban, LayoutDashboard, LogOut, Plug, Settings, Star, Clock3 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { api } from '../lib/api'
import { applyTheme, useSession } from '../stores/session'
import { ContextMenuProvider } from '../components/context-menu'
import { HeaderSearch } from '../components/command-palette'
import { Button } from '../components/ui/button'

const links = [
  { to: '/', key: 'dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', key: 'projects', icon: FolderKanban, end: false },
  { to: '/recent', key: 'recent', icon: Clock3, end: false },
  { to: '/favorites', key: 'favorites', icon: Star, end: false },
  { to: '/doc', key: 'docs', icon: BookOpen, end: false },
  { to: '/integrations', key: 'integrations', icon: Plug, end: false },
  { to: '/settings/profile', key: 'settings', icon: Settings, end: false },
]

export function AppShell() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const user = useSession((state) => state.user)
  const [open, setOpen] = useState(false)
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
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card p-3">
        <div className="px-2 py-3 text-sm font-semibold tracking-tight">{t('appName')}</div>
        <nav className="flex flex-1 flex-col gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex h-9 items-center gap-2 rounded-md px-2 text-sm ${isActive ? 'bg-accent font-medium' : 'hover:bg-accent'}`
              }
            >
              <link.icon className="size-4" />
              {t(link.key)}
            </NavLink>
          ))}
        </nav>
        <Button
          variant="ghost"
          onClick={async () => {
            await api.request('/auth/logout', { method: 'POST' })
            useSession.getState().setUser(null)
            navigate('/login')
          }}
        >
          <LogOut className="size-4" />
          {t('logout')}
        </Button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-1 border-b border-border px-4">
          <HeaderSearch />
          <div className="relative">
            <Button variant="ghost" aria-label={t('notifications')} onClick={() => setOpen((value) => !value)}>
              <Bell className="size-4" />
            </Button>
            {open ? (
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-md border border-border bg-card p-2 shadow-sm">
                <p className="px-2 py-1 text-sm font-medium">{t('notifications')}</p>
                <div className="min-h-16">
                  {(notifications.data?.notifications ?? []).length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">{t('noNotifications')}</p>
                  ) : (
                    notifications.data?.notifications.map((item) => (
                      <button
                        key={item.id}
                        className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => api.request(`/notifications/${item.id}/read`, { method: 'POST' })}
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
        <main className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </div>
    </ContextMenuProvider>
  )
}
