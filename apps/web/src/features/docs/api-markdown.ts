import type { ApiGroup, ApiParam } from './api-ref'

export function formatApiMarkdown(groups: ApiGroup[]): string {
  const sections = groups.map((group) => {
    const operations = group.operations.map((operation) =>
      [
        `### \`${operation.method} ${operation.url}\``,
        '',
        operation.description,
        '',
        paramBlock('Path', operation.pathParams),
        '',
        paramBlock('Query', operation.queryParams),
        '',
        '**Example**',
        '',
        '```ts',
        operation.example,
        '```',
      ].join('\n'),
    )
    return [`## ${group.title}`, '', operations.join('\n\n')].join('\n')
  })
  return [
    '# API reference',
    '',
    'Generated from the OpenAPI contract. This is the same reference as the in-app page at `/doc/api`.',
    '',
    sections.join('\n\n'),
    '',
  ].join('\n')
}

function paramBlock(label: string, params: ApiParam[]) {
  if (params.length === 0) return `**${label}**\n\nNone`
  const lines = params.map((param) => `- \`${param.name}\` ${param.type}${param.required ? '' : ' (optional)'}`)
  return `**${label}**\n\n${lines.join('\n')}`
}
