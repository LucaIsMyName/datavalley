import { describe, expect, it } from 'vitest'
import { extractRecordsFromPayload, getValueAtPath, normalizeConnectorParseConfig } from './extract.js'

describe('connector extract', () => {
  it('reads nested json paths', () => {
    const root = { items: [{ id: 'a', name: 'One' }, { id: 'b', name: 'Two' }] }
    expect(getValueAtPath(root, 'items')).toHaveLength(2)
    const parse = normalizeConnectorParseConfig({
      version: 1,
      recordsPath: 'items',
      fields: [{ sourceKey: 'name', targetFieldKey: 'name' }],
    })
    const rows = extractRecordsFromPayload('json', JSON.stringify(root), parse)
    expect(rows).toEqual([{ name: 'One' }, { name: 'Two' }])
  })

  it('maps csv headers', () => {
    const parse = normalizeConnectorParseConfig({
      version: 1,
      fields: [{ sourceKey: 'Email', targetFieldKey: 'email' }],
    })
    const rows = extractRecordsFromPayload('csv', 'Email\na@x.com\n', parse)
    expect(rows).toEqual([{ email: 'a@x.com' }])
  })

  it('auto-detects rss item path when recordsPath omitted', () => {
    const parse = normalizeConnectorParseConfig({
      version: 1,
      fields: [{ sourceKey: 'title', targetFieldKey: 'title' }],
    })
    const body = '<rss><channel><item><title>A</title></item></channel></rss>'
    const rows = extractRecordsFromPayload('xml', body, parse)
    expect(rows).toEqual([{ title: 'A' }])
  })

  it('extracts simple xml records', () => {
    const parse = normalizeConnectorParseConfig({
      version: 1,
      recordsPath: '/items/item',
      fields: [{ sourceKey: 'title', targetFieldKey: 'title' }],
    })
    const body = '<items><item><title>A</title></item><item><title>B</title></item></items>'
    const rows = extractRecordsFromPayload('xml', body, parse)
    expect(rows).toEqual([{ title: 'A' }, { title: 'B' }])
  })
})
