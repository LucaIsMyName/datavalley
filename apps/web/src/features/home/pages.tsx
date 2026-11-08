import { useQuery } from '@tanstack/react-query'
import type { Project } from '@datavalley/api-client'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ResourceIcon } from '../../components/resource-icon'
import { SavedRowTitle } from '../../components/saved-row-title'
import { Badge } from '../../components/ui/badge'
import { Card } from '../../components/ui/card'
import { EmptyState, ErrorState, LoadingBlock, Page } from '../../components/states'
import { ProjectCard, sortProjectsByLastEdited } from '../projects/project-card'
import { ProjectAdminActions, useProjectCreateImport } from '../projects/project-create-import'
import { api } from '../../lib/api'
import { useSession } from '../../stores/session'

const SAVED_PREVIEW_LIMIT = 5

export type WorkTask = {
  rowId: string
  title: string
  due: string
  overdue: boolean
  projectId: string
  projectName: string
  tableId: string
  tableName: string
  href: string
}

function formatDue(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return value
  return new Date(year, month - 1, day).toLocaleDateString()
}

export type SavedHit = {
  resourceType: string
  resourceId: string
  title: string
  subtitle?: string | null
  icon: string
  href: string
}

function SavedRows({ items, empty }: { items: SavedHit[]; empty: string }) {
  if (items.length === 0) return <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="mt-2 max-h-80 overflow-auto">
      {items.map((item) => (
        <li key={`${item.resourceType}:${item.resourceId}`} className="border-t border-border">
          <Link to={item.href} className="flex min-h-11 min-w-0 items-center gap-2 text-sm">
            <ResourceIcon name={item.icon} />
            <SavedRowTitle hit={item} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function SavedPreviewCard({
  title,
  viewAllTo,
  viewAllLabel,
  loading,
  error,
  items,
  empty,
}: {
  title: string
  viewAllTo: string
  viewAllLabel: string
  loading: boolean
  error: Error | null
  items: SavedHit[]
  empty: string
}) {
  const preview = items.slice(0, SAVED_PREVIEW_LIMIT)
  return (
    <Card className="flex min-h-40 flex-col p-4">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <h2 className="font-medium">{title}</h2>
        {items.length > 0 ? (
          <Link to={viewAllTo} className="shrink-0 text-sm text-primary hover:underline">
            {viewAllLabel}
          </Link>
        ) : null}
      </div>
      {loading ? (
        <LoadingBlock variant="rows" />
      ) : error ? (
        <ErrorState message={error.message} />
      ) : (
        <SavedRows items={preview} empty={empty} />
      )}
    </Card>
  )
}

export function DashboardPage() {
  const { t } = useTranslation()
  const user = useSession((state) => state.user)
  const { openCreate, openImport, dialogs } = useProjectCreateImport()
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.request<{ projects: Project[] }>('/projects'),
  })
  const recents = useQuery({
    queryKey: ['recents'],
    queryFn: () => api.request<{ recents: SavedHit[] }>('/recents'),
  })
  const favorites = useQuery({
    queryKey: ['favorites'],
    queryFn: () => api.request<{ favorites: SavedHit[] }>('/favorites'),
  })
  const work = useQuery({
    queryKey: ['work'],
    queryFn: () => api.request<{ tasks: WorkTask[] }>('/work'),
  })
  const sortedProjects = sortProjectsByLastEdited(projects.data?.projects ?? [])
  const projectsReady = !projects.isLoading && !projects.isError && projects.data
  return (
    <Page
      title={t('dashboard')}
      actions={user?.role === 'admin' ? <ProjectAdminActions openCreate={openCreate} openImport={openImport} /> : null}
    >
      <section aria-labelledby="dashboard-work-heading" className="flex min-w-0 flex-col gap-2">
        <h2 id="dashboard-work-heading" className="text-base font-medium">
          {t('myWork')}
        </h2>
        {work.isLoading && !work.data ? <LoadingBlock variant="rows" /> : null}
        {work.isError ? <ErrorState message={(work.error as Error).message} /> : null}
        {work.data && work.data.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('myWorkEmpty')}</p>
        ) : null}
        {work.data && work.data.tasks.length > 0 ? (
          <div className="min-w-0 overflow-auto border border-border">
            <table className="table-grid w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="h-10 px-2 text-left font-medium">{t('myWorkTitle')}</th>
                  <th className="h-10 px-2 text-left font-medium">{t('myWorkDate')}</th>
                  <th className="h-10 px-2 text-left font-medium">{t('myWorkDue')}</th>
                  <th className="h-10 px-2 text-left font-medium">{t('myWorkProject')}</th>
                </tr>
              </thead>
              <tbody>
                {work.data.tasks.map((task) => (
                  <tr key={task.rowId} className="border-t border-border">
                    <td className="h-11 max-w-0 px-2">
                      <Link to={task.href} className="block truncate font-medium text-primary hover:underline">
                        {task.title}
                      </Link>
                    </td>
                    <td className="h-11 whitespace-nowrap px-2">{formatDue(task.due)}</td>
                    <td className="h-11 px-2">
                      <Badge color={task.overdue ? 'red' : 'blue'}>
                        {task.overdue ? t('myWorkOverdue') : t('myWorkDue')}
                      </Badge>
                    </td>
                    <td className="h-11 max-w-0 px-2">
                      <Link
                        to={`/projects/${task.projectId}/tables/${task.tableId}`}
                        className="block truncate text-primary hover:underline"
                      >
                        {task.projectName}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {projects.isLoading && !projects.data ? <LoadingBlock variant="cards" /> : null}
      {projects.isError ? <ErrorState message={(projects.error as Error).message} /> : null}
      {projectsReady ? (
        <section aria-labelledby="dashboard-projects-heading" className="flex flex-col gap-3">
          <h2 id="dashboard-projects-heading" className="text-base font-medium">
            {t('projects')}
          </h2>
          {sortedProjects.length === 0 ? (
            <EmptyState
              title={t('emptyProjects')}
              body={user?.role === 'admin' ? t('emptyProjectsBody') : t('emptyProjectsBodyViewer')}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sortedProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </section>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <SavedPreviewCard
          title={t('recent')}
          viewAllTo="/recent"
          viewAllLabel={t('viewAll')}
          loading={recents.isLoading && !recents.data}
          error={recents.isError ? (recents.error as Error) : null}
          items={recents.data?.recents ?? []}
          empty={t('recentEmpty')}
        />
        <SavedPreviewCard
          title={t('favorites')}
          viewAllTo="/favorites"
          viewAllLabel={t('viewAll')}
          loading={favorites.isLoading && !favorites.data}
          error={favorites.isError ? (favorites.error as Error) : null}
          items={favorites.data?.favorites ?? []}
          empty={t('favoritesEmpty')}
        />
      </div>
      {dialogs}
    </Page>
  )
}

export function RecentPage() {
  const { t } = useTranslation()
  const recents = useQuery({
    queryKey: ['recents'],
    queryFn: () => api.request<{ recents: SavedHit[] }>('/recents'),
  })
  return (
    <Page title={t('recent')}>
      {recents.isLoading ? <LoadingBlock variant="rows" /> : null}
      {recents.isError ? <ErrorState message={(recents.error as Error).message} /> : null}
      {!recents.isLoading && !recents.isError && (recents.data?.recents.length ?? 0) === 0 ? (
        <EmptyState title={t('recentEmpty')} body={t('recentEmptyBody')} />
      ) : null}
      <ul className="flex flex-col gap-2">
        {recents.data?.recents.map((item) => (
          <li key={`${item.resourceType}:${item.resourceId}`}>
            <Link to={item.href}>
              <Card className="flex min-h-11 min-w-0 items-center gap-2 p-3 text-sm">
                <ResourceIcon name={item.icon} />
                <SavedRowTitle hit={item} />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  )
}

export function FavoritesPage() {
  const { t } = useTranslation()
  const favorites = useQuery({
    queryKey: ['favorites'],
    queryFn: () => api.request<{ favorites: SavedHit[] }>('/favorites'),
  })
  return (
    <Page title={t('favorites')}>
      {favorites.isLoading ? <LoadingBlock variant="rows" /> : null}
      {favorites.isError ? <ErrorState message={(favorites.error as Error).message} /> : null}
      {!favorites.isLoading && !favorites.isError && (favorites.data?.favorites.length ?? 0) === 0 ? (
        <EmptyState title={t('favoritesEmpty')} body={t('favoritesEmptyBody')} />
      ) : null}
      <ul className="flex flex-col gap-2">
        {favorites.data?.favorites.map((item) => (
          <li key={`${item.resourceType}:${item.resourceId}`}>
            <Link to={item.href}>
              <Card className="flex min-h-11 min-w-0 items-center gap-2 p-3 text-sm">
                <ResourceIcon name={item.icon} />
                <SavedRowTitle hit={item} />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  )
}
