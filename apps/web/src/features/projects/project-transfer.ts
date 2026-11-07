import { isProjectTransferDocument, type ProjectTransferDocument } from '@datavalley/shared'
import { api } from '../../lib/api'

export function downloadProjectJson(name: string, transfer: ProjectTransferDocument) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(transfer, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${name.replace(/[^\w.-]+/g, '_') || 'project'}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function fetchProjectExport(projectId: string) {
  return api.request<ProjectTransferDocument>(`/projects/${projectId}/export`)
}

export function parseProjectImportFile(text: string): ProjectTransferDocument {
  const parsed = JSON.parse(text) as unknown
  if (!isProjectTransferDocument(parsed)) throw new Error('invalid_project_file')
  return parsed
}

export async function importProjectWorkspace(name: string, document: ProjectTransferDocument) {
  return api.request<{ project: { id: string; name: string }; warnings?: string[] }>('/projects/import', {
    method: 'POST',
    body: JSON.stringify({ name, document }),
  })
}
