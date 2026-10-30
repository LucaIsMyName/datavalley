import { useTranslation } from 'react-i18next'
import { Page } from '../components/states'
import { FORMULA_HELP } from './tables/formula-help'

export function DocsPage() {
  const { t } = useTranslation('docs')
  return (
    <Page title={t('title')}>
      <article className="max-w-3xl space-y-8 pb-6 text-sm leading-6">
        <section>
          <h2 className="text-lg font-semibold">{t('projectsTitle')}</h2>
          <p className="mt-2 text-muted-foreground">{t('projectsBody')}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">{t('tablesTitle')}</h2>
          <p className="mt-2 text-muted-foreground">{t('tablesBody')}</p>
        </section>
        <section id="formulas">
          <h2 className="text-lg font-semibold">{t('formulasTitle')}</h2>
          <p className="mt-2 text-muted-foreground">{t('formulasIntro')}</p>
          <ul className="mt-4 flex flex-col gap-3">
            {FORMULA_HELP.map((item) => (
              <li key={item.name}>
                <code className="font-mono text-foreground">{item.example}</code>
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
