import { matchPath } from 'react-router'

export function projectRouteParams(pathname: string) {
  const table = matchPath({ path: '/projects/:projectId/tables/:tableId', end: true }, pathname)
  if (table?.params.projectId) {
    return { projectId: table.params.projectId, tableId: table.params.tableId ?? '' }
  }
  const project = matchPath({ path: '/projects/:projectId', end: true }, pathname)
  if (project?.params.projectId) {
    return { projectId: project.params.projectId, tableId: '' }
  }
  return { projectId: '', tableId: '' }
}
