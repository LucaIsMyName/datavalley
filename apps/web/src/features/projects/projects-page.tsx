import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import type { Project } from '@datavalley/api-client'
import { useContextMenu } from '../../components/context-menu'
import { ConfirmDialog, PromptDialog } from '../../components/confirm-dialog'
import { EmptyState, ErrorState, LoadingBlock, Page } from '../../components/states'
import {
  downloadProjectJson,
  fetchProjectExport,
} from './project-transfer'
import { ProjectCard } from './project-card'
import { ProjectAdminActions, useProjectCreateImport } from './project-create-import'
import { api } from '../../lib/api'
import { useSession } from '../../stores/session'

export function ProjectsPage() {
  const { t } = useTranslation()
  const user = useSession((state) => state.user)
  const navigate = useNavigate()
  const { open: openMenu } = useContextMenu()
  const queryClient = useQueryClient()
  const [rename, setRename] = useState<Project | null>(null)
  const [remove, setRemove] = useState<Project | null>(null)
  const [renamePending, setRenamePending] = useState(false)
  const [removePending, setRemovePending] = useState(false)
  const { openCreate, openImport, dialogs } = useProjectCreateImport()
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.request<{ projects: Project[] }>('/projects'),
  })
  return (
    <Page
      title={t('projects')}
      actions={user?.role === 'admin' ? <ProjectAdminActions openCreate={openCreate} openImport={openImport} /> : null}
    >
      {projects.isLoading && !projects.data ? <LoadingBlock /> : null}
      {projects.isError ? <ErrorState message={(projects.error as Error).message} /> : null}
      {projects.data && projects.data.projects.length === 0 ? (
        <EmptyState
          title={t('emptyProjects')}
          body={user?.role === 'admin' ? t('emptyProjectsBody') : t('emptyProjectsBodyViewer')}
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projects.data?.projects.map((project) => {
          const items = [
            {
              id: 'open',
              label: t('open'),
              icon: FolderOpen,
              onSelect: () => navigate(`/projects/${project.id}`),
            },
            ...(user?.role === 'admin'
              ? [
                  {
                    id: 'export',
                    label: t('exportProject'),
                    icon: Download,
                    onSelect: () => {
                      void fetchProjectExport(project.id)
                        .then((document) => downloadProjectJson(project.name, document))
                        .catch((error: unknown) => {
                          toast.error(error instanceof Error ? error.message : t('error'))
                        })
                    },
                  },
                  {
                    id: 'rename',
                    label: t('rename'),
                    icon: Pencil,
                    onSelect: () => setRename(project),
                  },
                  {
                    id: 'delete',
                    label: t('delete'),
                    icon: Trash2,
                    danger: true,
                    onSelect: () => setRemove(project),
                  },
                ]
              : []),
          ]
          return (
            <ProjectCard
              key={project.id}
              project={project}
              showActions
              onContextMenu={(event) => openMenu(event, items)}
              onMenuClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                openMenu(event, items)
              }}
            />
          )
        })}
      </div>
      {dialogs}
      <PromptDialog
        open={Boolean(rename)}
        title={t('rename')}
        label={t('name')}
        value={rename?.name ?? ''}
        confirmLabel={t('save')}
        cancelLabel={t('cancel')}
        pending={renamePending}
        onClose={() => setRename(null)}
        onSubmit={(next) => {
          if (!rename || renamePending) return
          const project = rename
          setRenamePending(true)
          void api
            .request(`/projects/${project.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ name: next }),
            })
            .then(() => queryClient.invalidateQueries({ queryKey: ['projects'] }))
            .then(() => setRename(null))
            .catch((error: unknown) => {
              toast.error(error instanceof Error ? error.message : t('error'))
            })
            .finally(() => setRenamePending(false))
        }}
      />
      <ConfirmDialog
        open={Boolean(remove)}
        title={t('deleteProjectTitle')}
        body={t('deleteProjectWarning', { name: remove?.name ?? '' })}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        pending={removePending}
        onClose={() => setRemove(null)}
        onConfirm={() => {
          if (!remove || removePending) return
          const project = remove
          setRemovePending(true)
          void api
            .request(`/projects/${project.id}`, { method: 'DELETE' })
            .then(() => queryClient.invalidateQueries({ queryKey: ['projects'] }))
            .then(() => setRemove(null))
            .catch((error: unknown) => {
              toast.error(error instanceof Error ? error.message : t('error'))
            })
            .finally(() => setRemovePending(false))
        }}
      />
    </Page>
  )
}

export { ProjectDescription } from './project-description'
