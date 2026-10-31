import { describe, expect, it } from 'vitest'
import {
  describeOperation,
  exampleCode,
  examplePath,
  listApiGroups,
  needsCsrf,
  openApiSpec,
  schemaToTs,
  type OpenApiSpec,
} from './api-ref'

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
      post: {
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  color: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Default Response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['widget'],
                  properties: {
                    widget: {
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

describe('api reference', () => {
  it('groups operations and converts schemas to TypeScript', () => {
    const groups = listApiGroups(spec)
    expect(groups.map((group) => group.id)).toEqual(['widgets', 'search'])
    const widgets = groups[0]
    expect(widgets.operations.map((operation) => operation.title)).toEqual(['GET /widgets', 'POST /widgets', 'GET /widgets/{id}'])
    expect(widgets.operations[0].url).toBe('/api/v1/widgets')
    expect(widgets.operations[1].requestTs).toContain('name: string')
    expect(widgets.operations[1].requestTs).toContain('color?: string')
    expect(widgets.operations[0].responseTs).toBe('{\n  widgets: {\n    id: string;\n  }[];\n}')
  })

  it('describes routes and marks mutating methods for CSRF', () => {
    expect(describeOperation('GET', '/widgets/{id}')).toBe('Get a widget')
    expect(describeOperation('POST', '/widgets')).toBe('Create a widget')
    expect(describeOperation('POST', '/widgets/{id}/archive')).toBe('Archive a widget')
    expect(describeOperation('GET', '/search')).toBe('Search records')
    expect(needsCsrf('POST')).toBe(true)
    expect(needsCsrf('GET')).toBe(false)
  })

  it('builds a client example with query, path, and CSRF', () => {
    expect(examplePath('/widgets/{id}')).toBe('/widgets/widget_1')
    const search = listApiGroups(spec)[1].operations[0]
    expect(search.queryParams.map((param) => param.name)).toEqual(['q', 'locale'])
    expect(search.example).toBe('const result = await api.request("/search?q=acme&locale=en")')
    const created = listApiGroups(spec)[0].operations[1]
    expect(created.example).toContain('await api.ensureCsrf()')
    expect(created.example).toContain('method: "POST"')
    expect(created.example).toContain('"name": "name"')
  })

  it('turns a JSON schema into a compact TypeScript type', () => {
    expect(schemaToTs({ type: 'string' })).toBe('string')
    expect(schemaToTs({ anyOf: [{ type: 'string', enum: ['en'] }, { type: 'string', enum: ['de'] }] })).toBe('"en" | "de"')
  })

  it('reads the generated OpenAPI contract', () => {
    const groups = listApiGroups(openApiSpec)
    expect(groups.find((group) => group.id === 'auth')?.operations.some((operation) => operation.path === '/auth/login')).toBe(true)
    const login = groups.flatMap((group) => group.operations).find((operation) => operation.path === '/auth/login')
    expect(login?.requestTs).toContain('login: string')
    expect(login?.responseTs).toContain('user:')
    expect(login?.example).toContain('await api.ensureCsrf()')
    const search = groups.flatMap((group) => group.operations).find((operation) => operation.path === '/search')
    expect(search?.queryParams.map((param) => param.name)).toEqual(['q', 'locale'])
    expect(search?.url).toBe('/api/v1/search')
  })
})
