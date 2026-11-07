import { useQuery } from '@tanstack/react-query'
import type { Project } from '@datavalley/api-client'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ResourceIcon } from '../../components/resource-icon'
import { SavedRowTitle } from '../../components/saved-row-title'
import { Card } from '../../components/ui/card'
import { EmptyState, ErrorState, LoadingBlock, Page } from '../../components/states'
import { ProjectCard, sortProjectsByLastEdited } from '../projects/project-card'
import { ProjectAdminActions, useProjectCreateImport } from '../projects/project-create-import'
import { api } from '../../lib/api'
import { useSession } from '../../stores/session'

const SAVED_PREVIEW_LIMIT = 5

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
        <LoadingBlock />
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
  const sortedProjects = sortProjectsByLastEdited(projects.data?.projects ?? [])
  const projectsReady = !projects.isLoading && !projects.isError && projects.data
  return (
    <Page
      title={t('dashboard')}
      actions={user?.role === 'admin' ? <ProjectAdminActions openCreate={openCreate} openImport={openImport} /> : null}
    >
      {projects.isLoading && !projects.data ? <LoadingBlock /> : null}
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
      {recents.isLoading ? <LoadingBlock /> : null}
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
      {favorites.isLoading ? <LoadingBlock /> : null}
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
