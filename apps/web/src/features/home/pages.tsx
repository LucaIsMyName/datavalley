import { useQuery } from '@tanstack/react-query'
import type { Project } from '@datavalley/api-client'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ResourceIcon } from '../../components/resource-icon'
import { SavedRowTitle } from '../../components/saved-row-title'
import { Card } from '../../components/ui/card'
import { EmptyState, ErrorState, LoadingBlock, Page } from '../../components/states'
import { api } from '../../lib/api'
import { formatDateTime } from '../../lib/format'

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

export function DashboardPage() {
  const { t, i18n } = useTranslation()
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
  if (projects.isError)
    return (
      <Page title={t('dashboard')}>
        <ErrorState message={(projects.error as Error).message} />
      </Page>
    )
  const projectRows = projects.data?.projects ?? []
  return (
    <Page title={t('dashboard')}>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex min-h-40 flex-col p-4">
          <h2 className="font-medium">{t('projects')}</h2>
          {projects.isLoading ? <LoadingBlock /> : null}
          {projectRows.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t('emptyProjects')}</p>
          ) : (
            <div className="mt-2 max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <tbody>
                  {projectRows.map((project) => (
                    <tr key={project.id} className="border-t border-border">
                      <td>
                        <Link
                          to={`/projects/${project.id}`}
                          className="flex min-h-11 flex-col justify-center gap-0.5 py-2"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <ResourceIcon name={project.icon} />
                            <span className="truncate">{project.name}</span>
                          </span>
                          <span className="pl-6 text-xs text-muted-foreground">
                            {t('lastEdited', {
                              date: formatDateTime(project.lastEditedAt, i18n.language),
                            })}
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card className="min-h-40 p-4">
          <h2 className="font-medium">{t('recent')}</h2>
          {recents.isLoading ? (
            <LoadingBlock />
          ) : recents.isError ? (
            <ErrorState message={(recents.error as Error).message} />
          ) : (
            <SavedRows items={recents.data?.recents ?? []} empty={t('recentEmpty')} />
          )}
        </Card>
        <Card className="min-h-40 p-4">
          <h2 className="font-medium">{t('favorites')}</h2>
          {favorites.isLoading ? (
            <LoadingBlock />
          ) : favorites.isError ? (
            <ErrorState message={(favorites.error as Error).message} />
          ) : (
            <SavedRows items={favorites.data?.favorites ?? []} empty={t('favoritesEmpty')} />
          )}
        </Card>
      </div>
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
      {(recents.data?.recents.length ?? 0) === 0 && !recents.isLoading ? (
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
      {(favorites.data?.favorites.length ?? 0) === 0 && !favorites.isLoading ? (
        <EmptyState title={t('favoritesEmpty')} body={t('favoritesEmptyBody')} />
      ) : null}
      <ul className="flex flex-col gap-2">
        {favorites.data?.favorites.map((item) => (
          <li key={`${item.resourceType}:${item.resourceId}`}>
            <Link to={item.href}>
              <Card className="flex min-h-11 items-center gap-2 p-3 text-sm">
                <ResourceIcon name={item.icon} />
                <span className="truncate">{item.title}</span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  )
}
