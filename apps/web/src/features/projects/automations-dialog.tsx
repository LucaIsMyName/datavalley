import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { AutomationRule } from '@datavalley/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AppDialog } from '../../components/ui/app-dialog'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { SelectField } from '../../components/ui/select'
import { api } from '../../lib/api'

type AutomationColumn = { id: string; name: string; type: string; toTableId: string | null }
type AutomationTable = { id: string; name: string; columns: AutomationColumn[] }
type AutomationsPayload = { rules: AutomationRule[]; canEdit: boolean; tables: AutomationTable[] }

export function AutomationsDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['automations', projectId],
    enabled: open,
    queryFn: () => api.request<AutomationsPayload>(`/projects/${projectId}/automations`),
  })
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [saving, setSaving] = useState(false)
  const [sourceTableId, setSourceTableId] = useState('')
  const [sourceColumnId, setSourceColumnId] = useState('')
  const [action, setAction] = useState<'create' | 'update'>('create')
  const [targetTableId, setTargetTableId] = useState('')
  const [linkColumnId, setLinkColumnId] = useState('')
  const [template, setTemplate] = useState('Follow up: {{label}}')
  const tables = query.data?.tables ?? []
  const canEdit = query.data?.canEdit ?? false
  const source = tables.find((table) => table.id === sourceTableId) ?? tables[0]
  const target = tables.find((table) => table.id === targetTableId) ?? tables.find((table) => table.name === 'Tasks') ?? tables[0]
  const columnId = source?.columns.some((column) => column.id === sourceColumnId)
    ? sourceColumnId
    : (source?.columns[0]?.id ?? '')

  useEffect(() => {
    if (query.data) setRules(query.data.rules)
  }, [query.data])

  useEffect(() => {
    if (!target || !source) return
    const match = target.columns.find((column) => column.type === 'relation' && column.toTableId === source.id)
    setLinkColumnId(match?.id ?? '')
  }, [target?.id, source?.id])

  async function persist(next: AutomationRule[]) {
    const previous = rules
    setRules(next)
    setSaving(true)
    try {
      const saved = await api.request<AutomationsPayload>(`/projects/${projectId}/automations`, {
        method: 'PUT',
        body: JSON.stringify({ rules: next }),
      })
      setRules(saved.rules)
      queryClient.setQueryData(['automations', projectId], saved)
    } catch (error) {
      setRules(previous)
      toast.error(error instanceof Error ? error.message : t('error'))
    } finally {
      setSaving(false)
    }
  }

  function addRule() {
    if (!canEdit || !source || !target || !columnId) return
    const nameColumn = target.columns.find((column) => column.type === 'text') ?? target.columns[0]
    const link = linkColumnId ? target.columns.find((column) => column.id === linkColumnId) : undefined
    const cells = []
    if (nameColumn) cells.push({ columnId: nameColumn.id, template: template.trim() || 'Follow up: {{label}}' })
    if (link && link.id !== nameColumn?.id) cells.push({ columnId: link.id, template: '{{row}}' })
    if (cells.length === 0) return
    const column = source.columns.find((item) => item.id === columnId)
    const replacesBuiltin = column?.name.trim().toLowerCase() === 'stage'
    const kept = rules.map((rule) => (rule.builtin && replacesBuiltin ? { ...rule, enabled: false } : rule))
    void persist([
      ...kept,
      {
        id: crypto.randomUUID(),
        builtin: false,
        enabled: true,
        sourceTableId: source.id,
        sourceColumnId: columnId,
        action,
        targetTableId: target.id,
        linkColumnId: link?.id ?? null,
        cells,
      },
    ])
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('automations')}
      description={t('automationHelp')}
      className="max-h-[85vh] w-[min(36rem,calc(100vw-2rem))] overflow-auto"
    >
      <div className="mt-4 flex flex-col gap-4">
        {query.isLoading ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}
        {canEdit ? null : query.data ? <p className="text-sm text-muted-foreground">{t('automationReadOnly')}</p> : null}
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-2">
              <Checkbox
                id={`rule-${rule.id}`}
                checked={rule.enabled}
                disabled={!canEdit || saving}
                onCheckedChange={(checked) =>
                  void persist(rules.map((item) => (item.id === rule.id ? { ...item, enabled: checked === true } : item)))
                }
              />
              <Label htmlFor={`rule-${rule.id}`} className="min-w-0 flex-1 font-normal">
                {ruleLabel(rule, tables, t)}
              </Label>
              {rule.builtin || !canEdit ? null : (
                <Button
                  variant="ghost"
                  disabled={saving}
                  onClick={() => void persist(rules.filter((item) => item.id !== rule.id))}
                >
                  {t('automationRemove')}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && source && target ? (
          <div className="flex flex-col gap-2 border border-border p-3">
            <Label>{t('automationWhen')}</Label>
            <SelectField
              label={t('automationWhen')}
              value={source.id}
              onValueChange={setSourceTableId}
              options={tables.map((table) => ({ value: table.id, label: table.name }))}
            />
            <SelectField
              label={t('automationWhen')}
              value={columnId}
              onValueChange={setSourceColumnId}
              options={source.columns.map((column) => ({ value: column.id, label: column.name }))}
            />
            <Label>{t('automationAction')}</Label>
            <SelectField
              label={t('automationAction')}
              value={action}
              onValueChange={(value) => setAction(value === 'update' ? 'update' : 'create')}
              options={[
                { value: 'create', label: t('automationCreate') },
                { value: 'update', label: t('automationUpdate') },
              ]}
            />
            <Label>{t('automationTarget')}</Label>
            <SelectField
              label={t('automationTarget')}
              value={target.id}
              onValueChange={setTargetTableId}
              options={tables.map((table) => ({ value: table.id, label: table.name }))}
            />
            <Label>{t('automationLink')}</Label>
            <SelectField
              label={t('automationLink')}
              value={linkColumnId}
              onValueChange={setLinkColumnId}
              options={[
                { value: '', label: t('automationNone') },
                ...target.columns
                  .filter((column) => column.type === 'relation')
                  .map((column) => ({ value: column.id, label: column.name })),
              ]}
            />
            <Label htmlFor="automation-template">{t('automationTemplate')}</Label>
            <Input id="automation-template" value={template} onChange={(event) => setTemplate(event.target.value)} />
            <Button disabled={saving || !columnId} onClick={addRule}>
              {t('automationAdd')}
            </Button>
          </div>
        ) : null}
      </div>
    </AppDialog>
  )
}

function ruleLabel(
  rule: AutomationRule,
  tables: AutomationTable[],
  t: (key: string) => string,
) {
  if (rule.builtin) return t('automationBuiltin')
  const source = tables.find((table) => table.id === rule.sourceTableId)
  const column = source?.columns.find((item) => item.id === rule.sourceColumnId)
  const target = tables.find((table) => table.id === rule.targetTableId)
  const action = rule.action === 'update' ? t('automationUpdate') : t('automationCreate')
  return [column?.name, target?.name, action].filter(Boolean).join(' · ')
}
