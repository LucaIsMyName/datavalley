import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Page } from '../../components/states'
import { FORMULA_HELP } from '../tables/formula-help'
import { useDocsToc } from './layout'
import type { TocItem } from './toc'

export function UserGuidePage() {
  const { t } = useTranslation('docs')
  const toc = useMemo<TocItem[]>(
    () => [
      { id: 'projects', title: t('projectsTitle') },
      { id: 'tables', title: t('tablesTitle') },
      { id: 'formulas', title: t('formulasTitle') },
      { id: 'lookup', title: t('lookupTitle') },
    ],
    [t],
  )
  useDocsToc(toc)

  return (
    <Page title={t('use')}>
      <article className="doc-content max-w-3xl space-y-8 overflow-x-auto pb-6 text-sm leading-6 break-words [&_code]:break-all">
        <section id="projects">
          <h2 className="text-lg font-semibold">{t('projectsTitle')}</h2>
          <p className="mt-2 text-muted-foreground">{t('projectsBody')}</p>
        </section>
        <section id="tables">
          <h2 className="text-lg font-semibold">{t('tablesTitle')}</h2>
          <p className="mt-2 text-muted-foreground">{t('tablesBody')}</p>
        </section>
        <section id="formulas">
          <h2 className="text-lg font-semibold">{t('formulasTitle')}</h2>
          <p className="mt-2 text-muted-foreground">{t('formulasIntro')}</p>
          <ul className="mt-4 flex flex-col gap-3">
            {(['ThisRow', 'Cell', 'Link', 'Column', 'Lookup'] as const).map((item) => (
              <li key={item}>
                <code>{t(`formulas${item}Code`)}</code>
                <p className="text-muted-foreground">{t(`formulas${item}`)}</p>
              </li>
            ))}
          </ul>
          <ul className="mt-4 flex flex-col gap-3">
            {FORMULA_HELP.map((item) => (
              <li key={item.name}>
                <code>{item.example}</code>
                <p className="text-muted-foreground">{t(`functions.${item.name}`)}</p>
              </li>
            ))}
          </ul>
        </section>
        <section id="lookup">
          <h2 className="text-lg font-semibold">{t('lookupTitle')}</h2>
          <p className="mt-2 text-muted-foreground">{t('lookupBody')}</p>
        </section>
      </article>
    </Page>
  )
}
