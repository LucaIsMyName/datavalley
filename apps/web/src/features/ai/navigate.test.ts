import { describe, expect, it } from 'vitest'
import { highlightsForDestination, safeAppPath } from './navigate.js'

const project = '11111111-1111-4111-8111-111111111111'
const table = '22222222-2222-4222-8222-222222222222'

describe('ai navigation paths', () => {
  it('accepts only a project or table route', () => {
    expect(safeAppPath(`/projects/${project}`)).toBe(`/projects/${project}`)
    expect(safeAppPath(`/projects/${project}/tables/${table}`)).toBe(`/projects/${project}/tables/${table}`)
    expect(safeAppPath('https://example.com')).toBeNull()
    expect(safeAppPath('//example.com')).toBeNull()
    expect(safeAppPath('/settings/ai')).toBeNull()
    expect(safeAppPath(`/projects/${project}/tables/${table}/extra`)).toBeNull()
    expect(safeAppPath(null)).toBeNull()
  })

  it('keeps highlights for the table the path opens', () => {
    const marks = highlightsForDestination(
      [
        {
          tableId: table,
          projectId: project,
          label: 'People',
          cells: [{ rowId: 'row-1', columnId: 'col-1' }],
          rowIds: [],
          columnIds: ['col-2'],
        },
      ],
      `/projects/${project}/tables/${table}`,
      'other-table',
    )
    expect(marks).toEqual({
      tableId: table,
      cells: [{ rowId: 'row-1', columnId: 'col-1' }],
      rowIds: [],
      columnIds: ['col-2'],
    })
    expect(highlightsForDestination([], `/projects/${project}`, 'other-table')).toBeNull()
    expect(
      highlightsForDestination(
        [{ tableId: 'other-table', projectId: project, label: 'Here', cells: [], rowIds: ['row-1'], columnIds: [] }],
        `/projects/${project}`,
        'other-table',
      ),
    ).toBeNull()
  })
})
