import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Markdown from 'react-markdown'
import { Page } from '../../components/states'
import dataModel from '../../../../../docs/data-model.md?raw'
import deploy from '../../../../../docs/deploy.md?raw'
import formulas from '../../../../../docs/formulas.md?raw'
import localSetup from '../../../../../docs/local-setup.md?raw'
import permissions from '../../../../../docs/permissions.md?raw'
import plugins from '../../../../../docs/plugins.md?raw'
import { useDocsToc } from './layout'
import type { TocItem } from './toc'

const markdown = {
  h1: ({ children }: { children?: ReactNode }) => <h2 className="text-lg font-semibold">{children}</h2>,
  h2: ({ children }: { children?: ReactNode }) => <h3 className="mt-4 text-base font-semibold">{children}</h3>,
  h3: ({ children }: { children?: ReactNode }) => <h4 className="mt-3 font-medium">{children}</h4>,
  p: ({ children }: { children?: ReactNode }) => <p className="mt-2 text-muted-foreground">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="mt-2 list-disc pl-5 text-muted-foreground">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="mt-2 list-decimal pl-5 text-muted-foreground">{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => <li className="mt-1">{children}</li>,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} className="underline">{children}</a>
  ),
  code: ({ children, className }: { children?: ReactNode; className?: string }) => <code className={className}>{children}</code>,
  pre: ({ children }: { children?: ReactNode }) => <pre className="mt-2 overflow-x-auto bg-muted p-3 text-xs">{children}</pre>,
}

export function DeveloperGuidePage() {
  const { t } = useTranslation('docs')
  const sections = useMemo(
    () => [
      { id: 'setup', title: t('setupTitle'), source: localSetup },
      { id: 'deploy', title: t('deployTitle'), source: deploy },
      { id: 'data-model', title: t('dataModelTitle'), source: dataModel },
      { id: 'permissions', title: t('permissionsTitle'), source: permissions },
      { id: 'plugins', title: t('pluginsTitle'), source: plugins },
      { id: 'formulas-engine', title: t('formulasEngineTitle'), source: formulas },
    ],
    [t],
  )
  const toc = useMemo<TocItem[]>(() => sections.map(({ id, title }) => ({ id, title })), [sections])
  useDocsToc(toc)

  return (
    <Page title={t('develop')}>
      <article className="doc-content max-w-3xl space-y-8 overflow-x-auto pb-6 text-sm leading-6 break-words [&_code]:break-all">
        {sections.map((section) => (
          <section key={section.id} id={section.id}>
            <Markdown components={markdown}>{section.source}</Markdown>
          </section>
        ))}
      </article>
    </Page>
  )
}
