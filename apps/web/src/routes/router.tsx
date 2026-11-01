import type { ReactNode } from 'react'
import { HelmetProvider } from 'react-helmet-async'
import { Navigate, Outlet, createBrowserRouter } from 'react-router'
import { LoadingBlock } from '../components/states'
import { api } from '../lib/api'
import { useSession } from '../stores/session'
import { lazyRoute } from './lazy-route'
import { RouteErrorPage } from './route-error'

const screenFallback = (
  <div className="grid h-screen place-items-center bg-background">
    <LoadingBlock />
  </div>
)
const pageFallback = <LoadingBlock />

function route<Exports extends Record<string, unknown>>(
  load: () => Promise<Exports>,
  name: keyof Exports & string,
  fallback: ReactNode = pageFallback,
) {
  return lazyRoute(load, name, fallback)
}

const authPages = () => import('../features/auth/pages')
const homePages = () => import('../features/home/pages')
const docsLayout = () => import('../features/docs/layout')
const settingsLayout = () => import('../features/settings/layout')

const LoginPage = route(authPages, 'LoginPage', screenFallback)
const ForgotPasswordPage = route(authPages, 'ForgotPasswordPage', screenFallback)
const ResetPasswordPage = route(authPages, 'ResetPasswordPage', screenFallback)
const ChangePasswordPage = route(authPages, 'ChangePasswordPage', screenFallback)
const AppShell = route(() => import('../layouts/app-shell'), 'AppShell', screenFallback)
const DashboardPage = route(homePages, 'DashboardPage')
const ProjectsPage = route(() => import('../features/projects/projects-page'), 'ProjectsPage')
const ProjectPage = route(() => import('../features/projects/project-page'), 'ProjectPage')
const TablePage = route(() => import('../features/tables/page'), 'TablePage')
const RecentPage = route(homePages, 'RecentPage')
const FavoritesPage = route(homePages, 'FavoritesPage')
const DocsLayout = route(docsLayout, 'DocsLayout')
const DocsIndexRedirect = route(docsLayout, 'DocsIndexRedirect')
const SettingsLayout = route(settingsLayout, 'SettingsLayout')
const UserGuidePage = route(() => import('../features/docs/use-page'), 'UserGuidePage')
const DeveloperGuidePage = route(
  () => import('../features/docs/develop-page'),
  'DeveloperGuidePage',
)
const ApiReferencePage = route(() => import('../features/docs/api-page'), 'ApiReferencePage')
const IntegrationsPage = route(
  () => import('../features/integrations/integrations-page'),
  'IntegrationsPage',
)
const MediaPage = route(() => import('../features/media/page'), 'MediaPage')
const ProfilePage = route(() => import('../features/settings/profile-page'), 'ProfilePage')
const UsersPage = route(() => import('../features/settings/admin-pages'), 'UsersPage')
const ApiKeysPage = route(() => import('../features/settings/admin-pages'), 'ApiKeysPage')
const AuditPage = route(() => import('../features/settings/admin-pages'), 'AuditPage')

function RequireAuth() {
  const user = useSession((state) => state.user)
  const ready = useSession((state) => state.ready)
  if (!ready)
    return (
      <div className="grid h-screen place-items-center bg-background">
        <LoadingBlock />
      </div>
    )
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />
  return <Outlet />
}

function RequireAdmin() {
  const user = useSession((state) => state.user)
  if (user?.role !== 'admin') return <Navigate to="/settings/profile" replace />
  return <Outlet />
}

function RootWithHelmet() {
  return (
    <HelmetProvider>
      <Outlet />
    </HelmetProvider>
  )
}

export const router = createBrowserRouter([
  {
    element: <RootWithHelmet />,
    errorElement: <RouteErrorPage />,
    children: [
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
              {
                errorElement: <RouteErrorPage />,
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
                  { path: '/media', element: <MediaPage /> },
                  {
                    path: '/doc',
                    element: <DocsLayout />,
                    children: [
                      { index: true, element: <DocsIndexRedirect /> },
                      { path: 'use', element: <UserGuidePage /> },
                      { path: 'develop', element: <DeveloperGuidePage /> },
                      { path: 'api', element: <ApiReferencePage /> },
                    ],
                  },
                  { path: '/integrations', element: <IntegrationsPage /> },
                  {
                    path: '/settings',
                    element: <SettingsLayout />,
                    children: [
                      { index: true, element: <Navigate to="/settings/profile" replace /> },
                      { path: 'profile', element: <ProfilePage /> },
                      {
                        element: <RequireAdmin />,
                        children: [
                          { path: 'users', element: <UsersPage /> },
                          { path: 'api-keys', element: <ApiKeysPage /> },
                          { path: 'audit', element: <AuditPage /> },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
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
