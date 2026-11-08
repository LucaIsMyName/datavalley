import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  SWITCH_COLUMN_TYPES,
  builtinStageRule,
  operatorsFor,
  validateFlow,
  type AutomationCatalogTable,
  type AutomationFlow,
  type AutomationRule,
  type FlowNode,
} from '@datavalley/shared'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { SelectField } from '../../components/ui/select'
import { api } from '../../lib/api'
import { AutomationCanvas } from './automation-canvas'
import { AutomationInspector } from './automation-inspector'
import { FlowProblemList } from './flow-problems'

type Payload = {
  rules: AutomationRule[]
  flows: AutomationFlow[]
  canEdit: boolean
  tables: AutomationCatalogTable[]
}

type StepKind = 'trigger' | 'condition' | 'switch' | 'action'

export function AutomationsPage() {
  const { projectId = '' } = useParams()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['automations', projectId],
    queryFn: () => api.request<Payload>(`/projects/${projectId}/automations`),
  })
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [flows, setFlows] = useState<AutomationFlow[]>([])
  const [flowId, setFlowId] = useState('')
  const [nodeId, setNodeId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const tables = query.data?.tables ?? []
  const canEdit = query.data?.canEdit ?? false
  const flow = flows.find((item) => item.id === flowId) ?? flows[0]
  const issues = flow ? validateFlow(flow, tables) : []
  const builtin = rules.find((rule) => rule.builtin) ?? builtinStageRule(true)
  const hydrated = useRef(false)

  useEffect(() => {
    if (!query.data || hydrated.current) return
    hydrated.current = true
    setRules(query.data.rules)
    setFlows(query.data.flows)
    setFlowId(query.data.flows[0]?.id ?? '')
  }, [query.data])

  function updateFlow(next: AutomationFlow) {
    setFlows((current) => current.map((item) => (item.id === next.id ? next : item)))
  }

  async function persist(body: { rules: AutomationRule[]; flows?: AutomationFlow[] }, keepFlows = false) {
    setSaving(true)
    try {
      const saved = await api.request<Payload>(`/projects/${projectId}/automations`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      setRules(saved.rules)
      if (!keepFlows) {
        setFlows(saved.flows)
        setFlowId(saved.flows.some((item) => item.id === flow?.id) ? (flow?.id ?? saved.flows[0]?.id ?? '') : (saved.flows[0]?.id ?? ''))
      }
      queryClient.setQueryData(['automations', projectId], saved)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('error'))
    } finally {
      setSaving(false)
    }
  }

  function addStep(kind: StepKind, position: { x: number; y: number }) {
    if (!flow || !canEdit) return
    const node = blankNode(kind, position, tables, flow)
    updateFlow({ ...flow, nodes: [...flow.nodes, node] })
    setNodeId(node.id)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 md:p-6 border-t border-border">
      <div className="flex flex-wrap items-center gap-3">
        <Checkbox
          id="builtin-stage"
          checked={builtin.enabled}
          disabled={!canEdit || saving}
          onCheckedChange={(checked) =>
            void persist(
              { rules: rules.map((rule) => (rule.builtin ? { ...rule, enabled: checked === true } : rule)) },
              true,
            )
          }
        />
        <Label htmlFor="builtin-stage" className="font-normal">
          {t('automationBuiltin')}
        </Label>
      </div>
      {query.isLoading ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}
      {canEdit || !query.data ? null : <p className="text-sm text-muted-foreground">{t('flowReadOnly')}</p>}
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        <div className="flex w-full shrink-0 flex-col gap-2 md:w-44">
          {flows.length > 0 ? (
            <SelectField
              label={t('automations')}
              value={flow?.id ?? ''}
              onValueChange={(id) => {
                setFlowId(id)
                setNodeId(null)
              }}
              options={flows.map((item) => ({ value: item.id, label: item.name || t('flowNew') }))}
            />
          ) : null}
          {canEdit ? (
            <>
              <Button
                variant="outline"
                disabled={saving || tables.length === 0}
                onClick={() => {
                  const created = blankFlow(tables[0], t('flowNew'))
                  setFlows((current) => [...current, created])
                  setFlowId(created.id)
                  setNodeId(created.nodes[0]?.id ?? null)
                }}
              >
                {t('flowNew')}
              </Button>
              <p className="text-xs text-muted-foreground">{t('flowPalette')}</p>
              {(['trigger', 'condition', 'switch', 'action'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/datavalley-flow', kind)
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  className="border border-border bg-card px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  {t(kind === 'trigger' ? 'flowTrigger' : kind === 'condition' ? 'flowCondition' : kind === 'switch' ? 'flowSwitch' : 'flowAction')}
                </button>
              ))}
            </>
          ) : null}
        </div>
        <div className="min-h-60 min-w-0 flex-1 border border-border">
          {flow ? (
            <AutomationCanvas
              flow={flow}
              tables={tables}
              issues={issues}
              readOnly={!canEdit}
              selectedId={nodeId}
              onSelect={setNodeId}
              onMove={(id, position) =>
                updateFlow({
                  ...flow,
                  nodes: flow.nodes.map((node) => (node.id === id ? { ...node, position } : node)),
                })
              }
              onConnectEdge={(edge) => updateFlow({ ...flow, edges: [...flow.edges, edge] })}
              onRemove={(ids) => {
                const gone = new Set(ids)
                updateFlow({
                  ...flow,
                  nodes: flow.nodes.filter((node) => !gone.has(node.id)),
                  edges: flow.edges.filter((edge) => !gone.has(edge.source) && !gone.has(edge.target)),
                })
                if (nodeId && gone.has(nodeId)) setNodeId(null)
              }}
              onAdd={addStep}
            />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">{t('automationHelp')}</p>
          )}
        </div>
        <div className="flex max-h-80 w-full shrink-0 flex-col gap-3 overflow-auto border border-border p-3 md:max-h-none md:w-80">
          {flow ? (
            <>
              <Label htmlFor="flow-name">{t('flowName')}</Label>
              <Input
                id="flow-name"
                value={flow.name}
                disabled={!canEdit}
                onChange={(event) => updateFlow({ ...flow, name: event.target.value.slice(0, 80) })}
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="flow-enabled"
                  checked={flow.enabled}
                  disabled={!canEdit || saving || (issues.length > 0 && !flow.enabled)}
                  onCheckedChange={(checked) => {
                    if (checked === true && issues.length > 0) return
                    updateFlow({ ...flow, enabled: checked === true })
                  }}
                />
                <Label htmlFor="flow-enabled" className="font-normal">
                  {t('flowEnabled')}
                </Label>
              </div>
              <AutomationInspector
                flow={flow}
                tables={tables}
                nodeId={nodeId}
                readOnly={!canEdit}
                onChange={(node) => updateFlow({ ...flow, nodes: flow.nodes.map((item) => (item.id === node.id ? node : item)) })}
                onRemove={(id) => {
                  updateFlow({
                    ...flow,
                    nodes: flow.nodes.filter((node) => node.id !== id),
                    edges: flow.edges.filter((edge) => edge.source !== id && edge.target !== id),
                  })
                  setNodeId(null)
                }}
              />
              <FlowProblemList issues={issues} />
              {canEdit ? (
                <div className="flex gap-2">
                  <Button disabled={saving || (flow.enabled && issues.length > 0)} onClick={() => void persist({ rules: [builtin], flows })}>
                    {t('flowSave')}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={saving}
                    onClick={() => {
                      const next = flows.filter((item) => item.id !== flow.id)
                      setFlows(next)
                      setFlowId(next[0]?.id ?? '')
                      setNodeId(null)
                      void persist({ rules: [builtin], flows: next })
                    }}
                  >
                    {t('flowDelete')}
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function blankFlow(table: AutomationCatalogTable, name: string): AutomationFlow {
  const column = table.columns[0]
  return {
    id: crypto.randomUUID(),
    name,
    enabled: false,
    nodes: [
      {
        id: crypto.randomUUID(),
        type: 'trigger',
        tableId: table.id,
        event: column ? 'column_changed' : 'row_created',
        columnId: column?.id ?? null,
        position: { x: 40, y: 40 },
      },
    ],
    edges: [],
  }
}

function blankNode(kind: StepKind, position: { x: number; y: number }, tables: AutomationCatalogTable[], flow: AutomationFlow): FlowNode {
  const trigger = flow.nodes.find((node) => node.type === 'trigger')
  const table = tables.find((item) => item.id === trigger?.tableId) ?? tables[0]
  const column = table?.columns[0]
  const id = crypto.randomUUID()
  if (kind === 'trigger') {
    return { id, type: 'trigger', tableId: table?.id ?? '', event: 'column_changed', columnId: column?.id ?? null, position }
  }
  if (kind === 'condition') {
    return { id, type: 'condition', columnId: column?.id ?? '', op: operatorsFor(column?.type ?? 'text')[0] ?? 'empty', value: null, position }
  }
  if (kind === 'switch') {
    const choice =
      table?.columns.find((item) => SWITCH_COLUMN_TYPES.includes(item.type as (typeof SWITCH_COLUMN_TYPES)[number])) ?? column
    const first = choice?.choices[0]
    return {
      id,
      type: 'switch',
      columnId: choice?.id ?? '',
      cases: first ? [{ id: crypto.randomUUID(), optionIds: [first.id] }] : [],
      position,
    }
  }
  const target = tables.find((item) => item.name === 'Tasks') ?? table
  const name = target?.columns.find((item) => item.type === 'text')
  return {
    id,
    type: 'action',
    action: 'create',
    tableId: target?.id ?? '',
    linkColumnId: null,
    fields: name ? [{ columnId: name.id, value: { kind: 'template', template: 'Follow up: {{label}}' } }] : [],
    position,
  }
}
