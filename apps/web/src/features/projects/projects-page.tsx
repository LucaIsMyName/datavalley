import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import type { Project } from '@datavalley/api-client'
import { ResourceIcon } from '../../components/resource-icon'
import { useContextMenu } from '../../components/context-menu'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Card } from '../../components/ui/card'
import { ConfirmDialog, PromptDialog } from '../../components/confirm-dialog'
import { EmptyState, ErrorState, LoadingBlock, Page } from '../../components/states'
import { createdProjectPath } from '../tables/grid-ux'
import { api } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { sync } from '../../lib/sync'
import { useSession } from '../../stores/session'

export function ProjectsPage() {
  const { t, i18n } = useTranslation()
  const user = useSession((state) => state.user)
  const navigate = useNavigate()
  const { open: openMenu } = useContextMenu()
  const queryClient = useQueryClient()
  const [rename, setRename] = useState<Project | null>(null)
  const [remove, setRemove] = useState<Project | null>(null)
  const [creating, setCreating] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [customers, setCustomers] = useState(false)
  const [createError, setCreateError] = useState('')
  const nameInput = useRef<HTMLInputElement>(null)
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.request<{ projects: Project[] }>('/projects'),
  })
  const create = useMutation({
    mutationFn: (input: { name: string; template?: 'customers' }) =>
      api.request<{ project: Project }>('/projects', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      setCreating(false)
      setCreateError('')
      const path = createdProjectPath(result)
      if (path) navigate(path)
    },
    onError: (error) => {
      setCreateError(error instanceof Error ? error.message : t('error'))
    },
  })
  useEffect(() => {
    if (!creating) return
    const frame = window.requestAnimationFrame(() => nameInput.current?.select())
    return () => window.cancelAnimationFrame(frame)
  }, [creating])
  return (
    <Page
      title={t('projects')}
      actions={
        user?.role === 'admin' ? (
          <Button
            type="button"
            onClick={() => {
              setProjectName(t('name'))
              setCustomers(false)
              setCreating(true)
            }}
          >
            {t('newProject')}
          </Button>
        ) : null
      }
    >
      {projects.isLoading && !projects.data ? <LoadingBlock /> : null}
      {projects.isError ? <ErrorState message={(projects.error as Error).message} /> : null}
      {projects.data && projects.data.projects.length === 0 ? (
        <EmptyState title={t('emptyProjects')} body={t('emptyProjectsBody')} />
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
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              onContextMenu={(event) => openMenu(event, items)}
            >
              <Card className="flex min-h-24 flex-col items-start gap-2 p-4 hover:bg-accent">
                <div className="flex w-full items-start gap-2">
                  <ResourceIcon name={project.icon} />
                  <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
                  <button
                    type="button"
                    aria-label={t('menu')}
                    className="inline-flex size-8 shrink-0 items-center justify-center hover:bg-accent"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      openMenu(event, items)
                    }}
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('projectTableCount', { count: project.tableCount })} ·{' '}
                  {t('lastEdited', { date: formatDateTime(project.lastEditedAt, i18n.language) })}
                </p>
              </Card>
            </Link>
          )
        })}
      </div>
      <Dialog.Root
        open={creating}
        onOpenChange={(open) => {
          if (!open) setCreating(false)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2  border border-border bg-card p-4 shadow-md">
            <Dialog.Title className="text-base font-semibold">{t('newProject')}</Dialog.Title>
            <Dialog.Description className="sr-only">{t('newProject')}</Dialog.Description>
            <form
              className="mt-3 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                const name = projectName.trim()
                if (!name) return
                setCreateError('')
                create.mutate({ name, template: customers ? 'customers' : undefined })
              }}
            >
              <input
                ref={nameInput}
                autoFocus
                aria-label={t('name')}
                className="h-9 w-full border border-border bg-card px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
              <label
                htmlFor="project-customers-template"
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  id="project-customers-template"
                  checked={customers}
                  onCheckedChange={(next) => setCustomers(next === true)}
                />
                {t('customersTemplate')}
              </label>
              {createError ? (
                <p role="alert" className="text-sm text-danger">
                  {createError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                  {t('cancel')}
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {t('confirm')}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <PromptDialog
        open={Boolean(rename)}
        title={t('rename')}
        label={t('name')}
        value={rename?.name ?? ''}
        confirmLabel={t('save')}
        cancelLabel={t('cancel')}
        onClose={() => setRename(null)}
        onSubmit={(next) => {
          if (!rename) return
          void api
            .request(`/projects/${rename.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ name: next }),
            })
            .then(() => queryClient.invalidateQueries({ queryKey: ['projects'] }))
          setRename(null)
        }}
      />
      <ConfirmDialog
        open={Boolean(remove)}
        title={t('deleteProjectTitle')}
        body={t('deleteProjectWarning', { name: remove?.name ?? '' })}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        onClose={() => setRemove(null)}
        onConfirm={() => {
          if (!remove) return
          void api
            .request(`/projects/${remove.id}`, { method: 'DELETE' })
            .then(() => queryClient.invalidateQueries({ queryKey: ['projects'] }))
          setRemove(null)
        }}
      />
    </Page>
  )
}

export function ProjectDescription({ projectId, value }: { projectId: string; value: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [text, setText] = useState(value)
  const focused = useRef(false)
  const baseline = useRef(value)
  useEffect(() => {
    if (focused.current) return
    setText(value)
    baseline.current = value
  }, [value])
  return (
    <textarea
      aria-label={t('description')}
      className="min-h-40 w-full flex-1 resize-none  border border-border bg-transparent p-2 text-sm leading-5 outline-none"
      value={text}
      placeholder={t('description')}
      onFocus={() => {
        focused.current = true
      }}
      onChange={(event) => {
        const next = event.target.value
        setText(next)
        sync.edit(`project:${projectId}:description`, {
          draft: next,
          delay: 300,
          apply: () => undefined,
          commit: (draft) =>
            api.request<{ project: Project }>(`/projects/${projectId}`, {
              method: 'PATCH',
              body: JSON.stringify({ description: draft }),
            }),
          accept: (result) => {
            baseline.current = result.project.description
            queryClient.setQueryData(['project', projectId], result)
          },
          rollback: () => setText(baseline.current),
        })
      }}
      onBlur={() => {
        focused.current = false
        void sync.flush(`project:${projectId}:description`)
      }}
    />
  )
}
