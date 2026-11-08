import type { FlowIssue } from '@datavalley/shared'
import { useTranslation } from 'react-i18next'

export function FlowProblemList({ issues }: { issues: FlowIssue[] }) {
  const { t } = useTranslation()
  if (issues.length === 0) return <p className="text-sm text-muted-foreground">{t('flowNoProblems')}</p>
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((issue, index) => (
        <li key={`${issue.nodeId}-${issue.code}-${index}`} className="text-sm text-danger">
          {t(`flowIssue_${issue.code}`)}
        </li>
      ))}
    </ul>
  )
}
