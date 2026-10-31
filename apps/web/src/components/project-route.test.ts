import { describe, expect, it } from 'vitest'
import { projectRouteParams } from './project-route'

describe('projectRouteParams', () => {
  it('returns empty ids on the projects list', () => {
    expect(projectRouteParams('/projects')).toEqual({ projectId: '', tableId: '' })
  })

  it('reads a project id', () => {
    expect(projectRouteParams('/projects/p1')).toEqual({ projectId: 'p1', tableId: '' })
  })

  it('reads project and table ids on a table route', () => {
    expect(projectRouteParams('/projects/p1/tables/t1')).toEqual({ projectId: 'p1', tableId: 't1' })
  })
})
