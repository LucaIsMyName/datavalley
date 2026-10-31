import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Page } from '../../components/states'
import { Badge } from '../../components/ui/badge'
import { Card } from '../../components/ui/card'
import { listApiGroups } from './api-ref'
import { useDocsToc } from './layout'
import type { TocItem } from './toc'

const methodColor: Record<string, string> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'violet',
  PATCH: 'amber',
  DELETE: 'red',
}

export function ApiReferencePage() {
  const { t } = useTranslation('docs')
  const groups = useMemo(() => listApiGroups(), [])
  const toc = useMemo<TocItem[]>(() => groups.map((group) => ({ id: group.id, title: group.title })), [groups])
  useDocsToc(toc)

  return (
    <Page title={t('api')}>
      <article className="doc-content max-w-3xl space-y-10 overflow-x-auto pb-6 text-sm leading-6 break-words [&_code]:break-all">
        {groups.map((group) => (
          <section key={group.id} id={group.id} className="space-y-4">
            <h2 className="text-lg font-semibold">{group.title}</h2>
            {group.operations.map((operation) => (
              <Card key={operation.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={methodColor[operation.method] ?? 'slate'}>{operation.method}</Badge>
                  <code>{operation.url}</code>
                </div>
                <p className="text-muted-foreground">{operation.description}</p>
                <ParamList label={t('pathParams')} params={operation.pathParams} empty={t('none')} />
                <ParamList label={t('queryParams')} params={operation.queryParams} empty={t('none')} />
                <div>
                  <p className="font-medium">{t('example')}</p>
                  <pre className="mt-1 overflow-x-auto bg-muted p-3 font-mono text-xs">{operation.example}</pre>
                </div>
              </Card>
            ))}
          </section>
        ))}
      </article>
    </Page>
  )
}

function ParamList({
  label,
  params,
  empty,
}: {
  label: string
  params: { name: string; required: boolean; type: string }[]
  empty: string
}) {
  return (
    <div>
      <p className="font-medium">{label}</p>
      {params.length === 0 ? (
        <p className="mt-1 text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">
          {params.map((param) => (
            <li key={param.name}>
              <code>{param.name}</code>
              <span className="text-muted-foreground">{` ${param.type}${param.required ? '' : ' (optional)'}`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
