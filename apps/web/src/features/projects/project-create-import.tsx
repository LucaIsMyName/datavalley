import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { Upload } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import type { Project } from '@datavalley/api-client'
import type { ProjectTransferDocument } from '@datavalley/shared'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Checkbox } from '../../components/ui/checkbox'
import { createdProjectPath } from '../tables/grid-ux'
import {
  importProjectWorkspace,
  parseProjectImportFile,
} from './project-transfer'
import { api } from '../../lib/api'
import { toast } from 'sonner'

export function useProjectCreateImport() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [customers, setCustomers] = useState(false)
  const [createError, setCreateError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importName, setImportName] = useState('')
  const [importFile, setImportFile] = useState<ProjectTransferDocument | null>(null)
  const [importPending, setImportPending] = useState(false)
  const [importError, setImportError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)

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

  const openCreate = () => {
    setProjectName('')
    setCustomers(false)
    setCreateError('')
    setCreating(true)
  }

  const openImport = () => {
    setImportName('')
    setImportFile(null)
    setImportError('')
    setImporting(true)
  }

  const dialogs: ReactNode = (
    <>
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
              <Label htmlFor="new-project-name">{t('name')}</Label>
              <Input
                id="new-project-name"
                ref={nameInput}
                autoFocus
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
                  {t('create')}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={importing}
        onOpenChange={(open) => {
          if (!open) setImporting(false)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 border border-border bg-card p-4 shadow-md">
            <Dialog.Title className="text-base font-semibold">{t('importProject')}</Dialog.Title>
            <Dialog.Description className="sr-only">{t('importProject')}</Dialog.Description>
            <form
              className="mt-3 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (!importFile || importPending) return
                const name = importName.trim() || importFile.project.name
                if (!name) return
                setImportPending(true)
                setImportError('')
                void importProjectWorkspace(name, importFile)
                  .then((result) => {
                    void queryClient.invalidateQueries({ queryKey: ['projects'] })
                    setImporting(false)
                    const path = createdProjectPath(result)
                    if (path) navigate(path)
                    if (result.warnings?.length) toast.message(t('importProjectWarnings'))
                  })
                  .catch((error: unknown) => {
                    setImportError(error instanceof Error ? error.message : t('error'))
                  })
                  .finally(() => setImportPending(false))
              }}
            >
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  setImportError('')
                  void file
                    .text()
                    .then((text) => {
                      const parsed = parseProjectImportFile(text)
                      setImportFile(parsed)
                      setImportName(parsed.project.name)
                    })
                    .catch(() => {
                      setImportFile(null)
                      setImportError(t('importProjectInvalid'))
                    })
                    .finally(() => {
                      event.target.value = ''
                    })
                }}
              />
              <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                <Upload className="mr-2 size-4" />
                {importFile ? t('importProjectChangeFile') : t('importProjectChooseFile')}
              </Button>
              {importFile ? (
                <p className="text-sm text-muted-foreground">{t('importProjectFileReady')}</p>
              ) : null}
              <Label htmlFor="import-project-name">{t('name')}</Label>
              <Input
                id="import-project-name"
                value={importName}
                onChange={(event) => setImportName(event.target.value)}
                disabled={!importFile}
              />
              {importError ? (
                <p role="alert" className="text-sm text-danger">
                  {importError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setImporting(false)}>
                  {t('cancel')}
                </Button>
                <Button type="submit" disabled={!importFile || importPending}>
                  {t('importProjectConfirm')}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )

  return { openCreate, openImport, dialogs }
}

export function ProjectAdminActions({
  openCreate,
  openImport,
}: {
  openCreate: () => void
  openImport: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" onClick={openImport}>
        {t('importProject')}
      </Button>
      <Button type="button" onClick={openCreate}>
        {t('newProject')}
      </Button>
    </div>
  )
}
