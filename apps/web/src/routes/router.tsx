import { useEffect } from 'react'
import { Navigate, Outlet, createBrowserRouter, useNavigate } from 'react-router'
import { api } from '../lib/api'
import { DocsPage } from '../features/docs'
import { AppShell } from '../layouts/app-shell'
import { useSession } from '../stores/session'
import {
  ApiKeysPage,
  AuditPage,
  ChangePasswordPage,
  DashboardPage,
  ForgotPasswordPage,
  FavoritesPage,
  IntegrationsPage,
  LoginPage,
  ProfilePage,
  ProjectPage,
  ProjectsPage,
  RecentPage,
  ResetPasswordPage,
  TablePage,
  UsersPage,
} from '../features/pages'

function RequireAuth() {
  const user = useSession((state) => state.user)
  const ready = useSession((state) => state.ready)
  const navigate = useNavigate()
  useEffect(() => {
    if (!ready) return
    if (!user) navigate('/login')
    else if (user.mustChangePassword) navigate('/change-password')
  }, [navigate, ready, user])
  if (!ready) return <div className="h-screen bg-background" />
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/change-password', element: <ChangePasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/projects', element: <ProjectsPage /> },
          {
            path: '/projects/:projectId',
            element: <ProjectPage />,
            children: [{ path: 'tables/:tableId', element: <TablePage /> }],
          },
          { path: '/recent', element: <RecentPage /> },
          { path: '/favorites', element: <FavoritesPage /> },
          { path: '/doc', element: <DocsPage /> },
          { path: '/integrations', element: <IntegrationsPage /> },
          { path: '/settings/profile', element: <ProfilePage /> },
          { path: '/settings/users', element: <UsersPage /> },
          { path: '/settings/api-keys', element: <ApiKeysPage /> },
          { path: '/settings/audit', element: <AuditPage /> },
        ],
      },
    ],
  },
])

export function restoreSession() {
  const setUser = useSession.getState().setUser
  const setReady = useSession.getState().setReady
  return api
    .ensureCsrf()
    .then(() => api.request<{ user: import('@datavalley/api-client').User }>('/auth/me'))
    .then((result) => setUser(result.user))
    .catch(() => setUser(null))
    .finally(() => setReady(true))
}
