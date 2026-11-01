import { defaultTableDisplay } from '@datavalley/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login, type Harness } from './harness.js'

const password = 'correct horse battery'

describe('table interactions', () => {
  let harness: Harness
  let session: ApiSession

  beforeAll(async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    session = await new ApiSession(harness.app).prepare()
    const signedIn = await login(session, 'ada', password)
    expect(signedIn.statusCode).toBe(200)
  })

  afterAll(async () => {
    await harness?.close()
  })

  it('seeds every project with a People table and a sample row', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Starter', template: 'customers' } })
    expect(project.statusCode).toBe(200)
    const projectId = project.json().project.id as string
    const listed = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const names = (listed.json().tables as { name: string }[]).map((table) => table.name).sort()
    expect(names).toEqual(['Customers', 'People'])
    const people = (listed.json().tables as { id: string; name: string }[]).find((table) => table.name === 'People')
    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${people?.id}` })
    const columns = detail.json().table.columns as { id: string; name: string; type: string }[]
    expect(columns.map((column) => [column.name, column.type])).toEqual([
      ['Name', 'text'],
      ['Mail', 'mail'],
    ])
    const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${people?.id}/rows` })
    const cells = rows.json().rows[0].cells as Record<string, unknown>
    expect(cells[columns[0].id]).toBe('John Doe')
    expect(cells[columns[1].id]).toBe('john@doe.com')
  })

  it('names an untitled table, inserts between neighbors, moves a row, and copies a column', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Layout' } })
    const projectId = project.json().project.id as string
    const first = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: {} })
    const second = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: {} })
    expect(first.json().table.name).toBe('Untitled')
    expect(second.json().table.name).toBe('Untitled 2')
    const tableId = first.json().table.id as string
    const name = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Name', type: 'text' },
    })
    const nameId = name.json().column.id as string
    const note = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Note', type: 'text' },
    })
    const noteId = note.json().column.id as string
    const inserted = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Mail', type: 'mail', beforeId: noteId },
    })
    expect(inserted.statusCode).toBe(200)
    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}` })
    expect((detail.json().table.columns as { name: string }[]).map((column) => column.name)).toEqual(['Name', 'Mail', 'Note'])
    const mailId = (detail.json().table.columns as { id: string; name: string }[]).find((column) => column.name === 'Mail')!.id
    const alpha = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [nameId]: 'Ada', [mailId]: 'ada@example.com' } },
    })
    const beta = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [nameId]: 'Bea', [mailId]: 'not-an-email' } },
    })
    expect(beta.statusCode).toBe(400)
    const between = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { beforeId: alpha.json().row.id, cells: { [nameId]: 'Ann', [mailId]: 'ann@example.com' } },
    })
    expect(between.statusCode).toBe(200)
    const moved = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows/move`,
      payload: { rowId: alpha.json().row.id, beforeId: between.json().row.id },
    })
    expect(moved.statusCode).toBe(200)
    const listed = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const order = (listed.json().rows as { cells: Record<string, unknown> }[]).map((row) => row.cells[nameId])
    expect(order).toEqual(['Ada', 'Ann'])
    const copied = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns/duplicate`,
      payload: { columnIds: [nameId] },
    })
    expect(copied.statusCode).toBe(200)
    const copyId = copied.json().columns[0].id as string
    const afterCopy = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    expect(afterCopy.json().rows[0].cells[copyId]).toBe('Ada')
  })

  it('previews a type change and clears only cells that do not match', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Convert' } })
    const projectId = project.json().project.id as string
    const table = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Amounts' } })
    const tableId = table.json().table.id as string
    const column = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Amount', type: 'text' },
    })
    const columnId = column.json().column.id as string
    await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [columnId]: '12' } } })
    await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [columnId]: 'nope' } } })
    const preview = await session.inject({
      method: 'POST',
      url: `/api/v1/columns/${columnId}/convert`,
      payload: { type: 'number', dryRun: true },
    })
    expect(preview.json()).toMatchObject({ cleared: 1, kept: 1 })
    const before = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    expect((before.json().rows as { cells: Record<string, unknown> }[]).map((row) => row.cells[columnId]).sort()).toEqual(['12', 'nope'])
    const converted = await session.inject({
      method: 'POST',
      url: `/api/v1/columns/${columnId}/convert`,
      payload: { type: 'number' },
    })
    expect(converted.json().cleared).toBe(1)
    const after = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const values = (after.json().rows as { cells: Record<string, unknown> }[]).map((row) => row.cells[columnId])
    expect(values.filter((value) => value != null)).toEqual([12])
  })

  it('saves a row color, a cell color, and conditional rules', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Paint' } })
    const projectId = project.json().project.id as string
    const listed = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const people = (listed.json().tables as { id: string; name: string }[]).find((table) => table.name === 'People')
    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${people?.id}` })
    const nameId = (detail.json().table.columns as { id: string; name: string }[]).find((column) => column.name === 'Name')!.id
    const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${people?.id}/rows` })
    const row = rows.json().rows[0] as { id: string; version: number }
    const painted = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${row.id}`,
      payload: { version: row.version, cells: {}, color: '#fde68a', backgrounds: { [nameId]: '#bbf7d0' } },
    })
    expect(painted.statusCode).toBe(200)
    expect(painted.json().row.color).toBe('#fde68a')
    expect(painted.json().row.backgrounds[nameId]).toBe('#bbf7d0')
    const rules = [{ id: 'name', scope: 'cell', columnId: nameId, operator: 'eq', value: 'John Doe', style: { background: '#fecaca' } }]
    const saved = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${people?.id}`,
      payload: { formatRules: rules },
    })
    expect(saved.json().table.formatRules).toEqual(rules)
    const formula = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${people?.id}`,
      payload: { formatRules: [{ id: 'ada', scope: 'cell', columnId: nameId, expression: 'IF(IT = "Ada")', style: { color: '#112233', background: '#bbf7d0' } }] },
    })
    expect(formula.statusCode).toBe(200)
    expect(formula.json().table.formatRules).toEqual([{ id: 'ada', scope: 'cell', columnId: nameId, expression: 'IF(IT = "Ada")', style: { color: '#112233', background: 'green' } }])
    const named = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${people?.id}`,
      payload: { formatRules: [{ id: 'ada', scope: 'cell', columnId: nameId, expression: 'IF(IT = "Ada")', style: { background: 'green' } }] },
    })
    expect(named.statusCode).toBe(200)
    expect(named.json().table.formatRules[0].style.background).toBe('green')
    const unknown = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${people?.id}`,
      payload: { formatRules: [{ id: 'ada', scope: 'cell', columnId: nameId, expression: 'IF(IT = "Ada")', style: { background: 'nope' } }] },
    })
    expect(unknown.statusCode).toBe(400)
    const lookup = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${people?.id}`,
      payload: { formatRules: [{ id: 'bad', scope: 'cell', columnId: nameId, expression: 'LOOKUP([People -> Mail], "a", [People -> Name])', style: { background: '#bbf7d0' } }] },
    })
    expect(lookup.statusCode).toBe(400)
    const whole = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${people?.id}`,
      payload: { formatRules: [{ id: 'bad', scope: 'cell', columnId: nameId, expression: 'IF([People -> Name] = "A")', style: { background: '#bbf7d0' } }] },
    })
    expect(whole.statusCode).toBe(400)
    const cell = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${row.id}`,
      payload: {
        version: painted.json().row.version,
        cells: {},
        formats: { [nameId]: [{ id: 'cell', scope: 'cell', columnId: nameId, expression: 'IF(IT = "Ada")', style: { color: '#111111', background: '#fecaca' } }] },
      },
    })
    expect(cell.statusCode).toBe(200)
    expect(cell.json().row.formats[nameId][0].expression).toBe('IF(IT = "Ada")')
    const edited = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${row.id}`,
      payload: { version: cell.json().row.version, cells: { [nameId]: 'Ada' } },
    })
    expect(edited.statusCode).toBe(200)
    expect(edited.json().row.cells[nameId]).toBe('Ada')
    expect(edited.json().row.formats[nameId][0].expression).toBe('IF(IT = "Ada")')
  })

  it('remembers sort and filter for the signed-in user', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'State', template: 'customers' } })
    const projectId = project.json().project.id as string
    const listed = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const people = (listed.json().tables as { id: string; name: string }[]).find((table) => table.name === 'People')
    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${people?.id}` })
    const nameId = (detail.json().table.columns as { id: string; name: string }[]).find((column) => column.name === 'Name')!.id
    const empty = await session.inject({ method: 'GET', url: `/api/v1/tables/${people?.id}/state` })
    expect(empty.statusCode).toBe(200)
    expect(empty.json()).toEqual({ sort: null, filter: null, display: defaultTableDisplay() })
    const saved = await session.inject({
      method: 'PUT',
      url: `/api/v1/tables/${people?.id}/state`,
      payload: { sort: { columnId: nameId, direction: 'desc' }, filter: { op: 'contains', columnId: nameId, value: 'Ada' } },
    })
    expect(saved.statusCode).toBe(200)
    const chart = {
      ...defaultTableDisplay(),
      mode: 'chart',
      chart: { ...defaultTableDisplay().chart, type: 'line', dimensionIds: [nameId], valueIds: [] },
    }
    const withChart = await session.inject({
      method: 'PUT',
      url: `/api/v1/tables/${people?.id}/state`,
      payload: { display: chart },
    })
    expect(withChart.statusCode).toBe(200)
    expect(withChart.json()).toEqual({
      sort: { columnId: nameId, direction: 'desc' },
      filter: { op: 'contains', columnId: nameId, value: 'Ada' },
      display: chart,
    })
    const again = await session.inject({ method: 'GET', url: `/api/v1/tables/${people?.id}/state` })
    expect(again.json()).toEqual(withChart.json())
  })

  it('keeps a mirror display separate from the source table', async () => {
    const sourceProject = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Chart source' } })
    const sourceProjectId = sourceProject.json().project.id as string
    const source = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${sourceProjectId}/tables`,
      payload: { name: 'Inventory' },
    })
    const sourceId = source.json().table.id as string
    const host = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Chart host' } })
    const hostId = host.json().project.id as string
    const mirror = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${hostId}/tables/mirror`,
      payload: { sourceTableId: sourceId, name: 'Inventory view' },
    })
    const mirrorId = mirror.json().table.id as string
    const sourceDisplay = { ...defaultTableDisplay(), mode: 'chart', chart: { ...defaultTableDisplay().chart, type: 'bar' } }
    const mirrorDisplay = { ...defaultTableDisplay(), mode: 'chart', chart: { ...defaultTableDisplay().chart, type: 'doughnut' } }
    expect((await session.inject({ method: 'PUT', url: `/api/v1/tables/${sourceId}/state`, payload: { display: sourceDisplay } })).statusCode).toBe(200)
    expect((await session.inject({ method: 'PUT', url: `/api/v1/tables/${mirrorId}/state`, payload: { display: mirrorDisplay } })).statusCode).toBe(200)
    const sourceState = await session.inject({ method: 'GET', url: `/api/v1/tables/${sourceId}/state` })
    const mirrorState = await session.inject({ method: 'GET', url: `/api/v1/tables/${mirrorId}/state` })
    expect(sourceState.json().display).toEqual(sourceDisplay)
    expect(mirrorState.json().display).toEqual(mirrorDisplay)
  })

  it('orders tables, seeds demo data, and imports a CSV as a new table', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Tabs' } })
    const projectId = project.json().project.id as string
    const first = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Alpha' } })
    const second = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Beta' } })
    expect(first.statusCode).toBe(200)
    const firstId = first.json().table.id as string
    const secondId = second.json().table.id as string
    const listed = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    expect((listed.json().tables as { name: string }[]).map((table) => table.name)).toEqual(['People', 'Alpha', 'Beta'])
    const ordered = await session.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/tables/order`,
      payload: { tableIds: [secondId, firstId, (listed.json().tables as { id: string; name: string }[]).find((table) => table.name === 'People')!.id] },
    })
    expect(ordered.statusCode).toBe(200)
    const after = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    expect((after.json().tables as { name: string }[]).map((table) => table.name)).toEqual(['Beta', 'Alpha', 'People'])

    const demo = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { template: 'demo' } })
    expect(demo.statusCode).toBe(200)
    const demoId = demo.json().table.id as string
    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${demoId}` })
    const columns = detail.json().table.columns as { id: string; name: string; type: string }[]
    expect(columns.map((column) => [column.name, column.type])).toEqual([
      ['Name', 'text'],
      ['Email', 'text'],
      ['Company', 'text'],
      ['Notes', 'text'],
    ])
    const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${demoId}/rows` })
    expect(rows.json().rows).toHaveLength(3)
    expect(rows.json().rows[0].cells[columns[0].id]).toBe('Ada Lovelace')

    const boundary = '----datavalley-new-table'
    const csvBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="name"',
      '',
      'Cities',
      `--${boundary}`,
      'Content-Disposition: form-data; name="headerRow"',
      '',
      'true',
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="cities.csv"',
      'Content-Type: text/csv',
      '',
      'City,Country\nParis,France\nRome,Italy',
      `--${boundary}--`,
      '',
    ].join('\r\n')
    const imported = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables/import`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: csvBody,
    })
    expect(imported.statusCode).toBe(200)
    expect(imported.json().table.name).toBe('Cities')
    const csvId = imported.json().table.id as string
    const csvDetail = await session.inject({ method: 'GET', url: `/api/v1/tables/${csvId}` })
    expect((csvDetail.json().table.columns as { name: string; type: string }[]).map((column) => [column.name, column.type])).toEqual([
      ['City', 'text'],
      ['Country', 'text'],
    ])
    const csvRows = await session.inject({ method: 'GET', url: `/api/v1/tables/${csvId}/rows` })
    expect(csvRows.json().rows).toHaveLength(2)

    const semiBoundary = '----datavalley-semi'
    const semiBody = [
      `--${semiBoundary}`,
      'Content-Disposition: form-data; name="name"',
      '',
      'Semicolon',
      `--${semiBoundary}`,
      'Content-Disposition: form-data; name="headerRow"',
      '',
      'true',
      `--${semiBoundary}`,
      'Content-Disposition: form-data; name="delimiter"',
      '',
      ';',
      `--${semiBoundary}`,
      'Content-Disposition: form-data; name="file"; filename="semi.csv"',
      'Content-Type: text/csv',
      '',
      'Name;City\nAda;Vienna',
      `--${semiBoundary}--`,
      '',
    ].join('\r\n')
    const semiImported = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables/import`,
      headers: { 'content-type': `multipart/form-data; boundary=${semiBoundary}` },
      payload: semiBody,
    })
    expect(semiImported.statusCode).toBe(200)
    const semiId = semiImported.json().table.id as string
    const semiRows = await session.inject({ method: 'GET', url: `/api/v1/tables/${semiId}/rows` })
    expect(semiRows.json().rows).toHaveLength(1)

    const rawBoundary = '----datavalley-raw'
    const rawBody = [
      `--${rawBoundary}`,
      'Content-Disposition: form-data; name="name"',
      '',
      'Raw',
      `--${rawBoundary}`,
      'Content-Disposition: form-data; name="headerRow"',
      '',
      'false',
      `--${rawBoundary}`,
      'Content-Disposition: form-data; name="file"; filename="raw.csv"',
      'Content-Type: text/csv',
      '',
      'Ada,London',
      `--${rawBoundary}--`,
      '',
    ].join('\r\n')
    const raw = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables/import`,
      headers: { 'content-type': `multipart/form-data; boundary=${rawBoundary}` },
      payload: rawBody,
    })
    expect(raw.statusCode).toBe(200)
    const rawDetail = await session.inject({ method: 'GET', url: `/api/v1/tables/${raw.json().table.id}` })
    expect((rawDetail.json().table.columns as { name: string }[]).map((column) => column.name)).toEqual(['Column 1', 'Column 2'])
  })

  it('creates missing columns when importing a CSV into an existing table', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Import columns' } })
    const projectId = project.json().project.id as string
    const table = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Companies' } })
    const tableId = table.json().table.id as string
    await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Name', type: 'text' } })
    const boundary = '----datavalley-existing-import'
    const csv = 'ID,Name,UID,Mail\n1,Diakonie Österreich,1234,ada@example.com\n2,Diakoniewerk,3456,'
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="companies.csv"',
      'Content-Type: text/csv',
      '',
      csv,
      `--${boundary}--`,
      '',
    ].join('\r\n')
    const imported = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/import`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })
    expect(imported.statusCode).toBe(200)
    expect(imported.json().created).toBe(2)
    expect(imported.json().errors).toEqual([])
    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}` })
    const columns = detail.json().table.columns as { id: string; name: string; type: string }[]
    expect(columns.map((column) => [column.name, column.type])).toEqual([
      ['Name', 'text'],
      ['ID', 'text'],
      ['UID', 'text'],
      ['Mail', 'text'],
    ])
    const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const nameId = columns.find((column) => column.name === 'Name')!.id
    const idCol = columns.find((column) => column.name === 'ID')!.id
    expect(rows.json().rows).toHaveLength(2)
    expect(rows.json().rows[0].cells[nameId]).toBe('Diakonie Österreich')
    expect(rows.json().rows[0].cells[idCol]).toBe('1')
  })
})
