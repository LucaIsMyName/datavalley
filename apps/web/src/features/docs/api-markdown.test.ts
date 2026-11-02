import { describe, expect, it } from 'vitest'
import { formatApiMarkdown } from './api-markdown'
import { listApiGroups, type OpenApiSpec } from './api-ref'

const spec: OpenApiSpec = {
  servers: [{ url: '/api/v1' }],
  paths: {
    '/widgets': {
      get: {
        responses: {
          '200': {
            description: 'Default Response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['widgets'],
                  properties: {
                    widgets: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['id'],
                        properties: { id: { type: 'string' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/widgets/{id}': {
      get: {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Default Response' } },
      },
    },
    '/search': {
      get: {
        parameters: [
          { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'locale', in: 'query', schema: { anyOf: [{ type: 'string', enum: ['en'] }, { type: 'string', enum: ['de'] }] } },
        ],
        responses: { '200': { description: 'Default Response' } },
      },
    },
  },
}

describe('formatApiMarkdown', () => {
  it('matches the in-app API reference shape', () => {
    const markdown = formatApiMarkdown(listApiGroups(spec))
    expect(markdown).toContain('# API reference')
    expect(markdown).toContain('## Widgets')
    expect(markdown).toContain('\n\n## Search\n')
    expect(markdown).toContain('### `GET /api/v1/widgets`')
    expect(markdown).toContain('List widgets')
    expect(markdown).toContain('**Path**')
    expect(markdown).toContain('**Query**')
    expect(markdown).toContain('None')
    expect(markdown).toContain('- `id` string')
    expect(markdown).toContain('- `q` string (optional)')
    expect(markdown).toContain('**Example**')
    expect(markdown).toContain('```ts')
    expect(markdown).toContain('const result = await api.request<{ widgets: { id: string }[] }>("/widgets")')
    expect(markdown).toContain('const result = await api.request("/search?q=acme&locale=en")')
  })
})
