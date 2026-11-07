import type { Project } from '@datavalley/api-client'
import { MoreHorizontal } from 'lucide-react'
import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ResourceIcon } from '../../components/resource-icon'
import { Card } from '../../components/ui/card'
import { formatDateTime } from '../../lib/format'

export function sortProjectsByLastEdited(projects: Project[]): Project[] {
  return [...projects].sort(
    (a, b) => new Date(b.lastEditedAt).getTime() - new Date(a.lastEditedAt).getTime(),
  )
}

export function ProjectCard({
  project,
  showActions,
  onContextMenu,
  onMenuClick,
}: {
  project: Project
  showActions?: boolean
  onContextMenu?: (event: MouseEvent) => void
  onMenuClick?: (event: MouseEvent) => void
}) {
  const { t, i18n } = useTranslation()
  const description = project.description.trim()
  return (
    <Link
      to={`/projects/${project.id}`}
      onContextMenu={onContextMenu}
      className="block min-h-24"
    >
      <Card className="flex h-full min-h-24 flex-col items-start gap-2 px-4 py-2 hover:bg-accent">
        <div className="flex w-full items-center gap-2">
          <ResourceIcon name={project.icon} />
          <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
          {showActions ? (
            <button
              type="button"
              aria-label={t('menu')}
              className="inline-flex size-8 shrink-0 items-center justify-center hover:bg-accent"
              onClick={onMenuClick}
            >
              <MoreHorizontal className="size-4" />
            </button>
          ) : null}
        </div>
        {description ? (
          <p className="line-clamp-2 w-full text-sm text-muted-foreground">{description}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {t('projectTableCount', { count: project.tableCount })} ·{' '}
          {t('lastEdited', { date: formatDateTime(project.lastEditedAt, i18n.language) })}
        </p>
      </Card>
    </Link>
  )
}
