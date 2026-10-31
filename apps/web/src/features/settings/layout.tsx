import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { useSession } from '../../stores/session'

function SettingsNav({ className }: { className?: string }) {
  const { t } = useTranslation()
  const user = useSession((state) => state.user)
  const links = [
    { to: '/settings/profile', key: 'profile' },
    ...(user?.role === 'admin'
      ? [
          { to: '/settings/users', key: 'users' },
          { to: '/settings/api-keys', key: 'apiKeys' },
          { to: '/settings/audit', key: 'audit' },
        ]
      : []),
  ]
  return (
    <nav className={className}>
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) =>
            `flex h-9 shrink-0 items-center px-2 text-sm ${isActive ? 'bg-accent font-medium' : 'hover:bg-accent'}`
          }
        >
          {t(link.key)}
        </NavLink>
      ))}
    </nav>
  )
}

export function SettingsLayout() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <aside className="hidden w-52 shrink-0 flex-col overflow-y-auto border-r border-border bg-card p-3 md:flex">
        <SettingsNav className="flex flex-col gap-1" />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 md:hidden">
          <SettingsNav className="flex min-w-0 flex-1 gap-1" />
        </div>
        <Outlet />
      </div>
    </div>
  )
}
