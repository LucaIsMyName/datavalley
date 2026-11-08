import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import type { AutomationCatalogTable, AutomationFlow, FlowIssue } from '@datavalley/shared'
import { useEffect, useRef, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import '@xyflow/react/dist/style.css'

type StepKind = 'trigger' | 'condition' | 'switch' | 'action'

type CardData = {
  title: string
  subtitle: string
  error: string | null
  kind: StepKind
  cases: { id: string; label: string }[]
}

const nodeTypes = { trigger: StepNode, condition: StepNode, switch: StepNode, action: StepNode }

export function AutomationCanvas({
  flow,
  tables,
  issues,
  readOnly,
  selectedId,
  onSelect,
  onMove,
  onConnectEdge,
  onRemove,
  onAdd,
}: {
  flow: AutomationFlow
  tables: AutomationCatalogTable[]
  issues: FlowIssue[]
  readOnly: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, position: { x: number; y: number }) => void
  onConnectEdge: (edge: AutomationFlow['edges'][number]) => void
  onRemove: (ids: string[]) => void
  onAdd: (kind: StepKind, position: { x: number; y: number }) => void
}) {
  return (
    <div className="h-full min-h-60 w-full">
    <ReactFlowProvider>
      <CanvasBody
        flow={flow}
        tables={tables}
        issues={issues}
        readOnly={readOnly}
        selectedId={selectedId}
        onSelect={onSelect}
        onMove={onMove}
        onConnectEdge={onConnectEdge}
        onRemove={onRemove}
        onAdd={onAdd}
      />
    </ReactFlowProvider>
    </div>
  )
}

function CanvasBody(props: {
  flow: AutomationFlow
  tables: AutomationCatalogTable[]
  issues: FlowIssue[]
  readOnly: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, position: { x: number; y: number }) => void
  onConnectEdge: (edge: AutomationFlow['edges'][number]) => void
  onRemove: (ids: string[]) => void
  onAdd: (kind: StepKind, position: { x: number; y: number }) => void
}) {
  const { t } = useTranslation()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const { flow } = props
  const fit = useRef(fitView)
  fit.current = fitView
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void fit.current({ padding: 0.2 })
    })
    return () => cancelAnimationFrame(frame)
  }, [flow.id])

  const nodes: Node<CardData>[] = flow.nodes.map((node) => {
    const issue = props.issues.find((item) => item.nodeId === node.id)
    return {
      id: node.id,
      type: node.type,
      position: node.position,
      selected: node.id === props.selectedId,
      data: {
        title: t(titleKey(node.type)),
        subtitle: subtitle(node, props.tables, t),
        error: issue ? t(`flowIssue_${issue.code}`) : null,
        kind: node.type,
        cases:
          node.type === 'switch'
            ? [
                ...node.cases.map((item) => ({ id: item.id, label: caseLabel(item.optionIds, node.columnId, props.tables) })),
                { id: 'else', label: t('flowElse') },
              ]
            : [],
      },
    }
  })
  const edges = flow.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.when ?? 'out',
    label: edgeLabel(edge.when, flow, props.tables, t),
  }))

  function onNodesChange(changes: NodeChange<Node<CardData>>[]) {
    if (props.readOnly) return
    for (const change of changes) {
      if (change.type === 'position' && change.position) props.onMove(change.id, change.position)
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    if (props.readOnly) return
    const kind = event.dataTransfer.getData('application/datavalley-flow')
    if (kind !== 'trigger' && kind !== 'condition' && kind !== 'switch' && kind !== 'action') return
    props.onAdd(kind, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      nodesDraggable={!props.readOnly}
      nodesConnectable={!props.readOnly}
      elementsSelectable
      deleteKeyCode={props.readOnly ? null : 'Backspace'}
      onNodesChange={onNodesChange}
      onNodesDelete={(deleted) => props.onRemove(deleted.map((node) => node.id))}
      onPaneClick={() => props.onSelect(null)}
      onNodeClick={(_, node) => props.onSelect(node.id)}
      onConnect={(connection: Connection) => {
        if (props.readOnly || !connection.source || !connection.target) return
        props.onConnectEdge({
          id: crypto.randomUUID(),
          source: connection.source,
          target: connection.target,
          when: connection.sourceHandle && connection.sourceHandle !== 'out' ? connection.sourceHandle : null,
        })
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={onDrop}
      className="h-full w-full"
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

function StepNode({ data }: NodeProps<Node<CardData>>) {
  const { t } = useTranslation()
  return (
    <div className={cn('w-48 border bg-card px-3 py-2 text-left text-sm', data.error ? 'border-danger' : 'border-border')}>
      {data.kind === 'trigger' ? null : <Handle type="target" position={Position.Top} />}
      <div className="font-medium">{data.title}</div>
      <div className="truncate text-muted-foreground">{data.subtitle}</div>
      {data.error ? <div className="mt-1 text-danger">{data.error}</div> : null}
      {data.kind === 'trigger' || data.kind === 'action' ? <Handle type="source" id="out" position={Position.Bottom} /> : null}
      {data.kind === 'condition' ? (
        <>
          <Handle type="source" id="yes" position={Position.Bottom} style={{ left: '30%' }} />
          <Handle type="source" id="no" position={Position.Bottom} style={{ left: '70%' }} />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{t('flowYes')}</span>
            <span>{t('flowNo')}</span>
          </div>
        </>
      ) : null}
      {data.kind === 'switch' ? (
        <div className="relative mt-3 h-4">
          {data.cases.map((item, index) => (
            <Handle
              key={item.id}
              type="source"
              id={item.id}
              position={Position.Bottom}
              style={{ left: `${((index + 1) / (data.cases.length + 1)) * 100}%` }}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function titleKey(kind: StepKind) {
  if (kind === 'trigger') return 'flowTrigger'
  if (kind === 'condition') return 'flowCondition'
  if (kind === 'switch') return 'flowSwitch'
  return 'flowAction'
}

function subtitle(
  node: AutomationFlow['nodes'][number],
  tables: AutomationCatalogTable[],
  t: (key: string) => string,
) {
  if (node.type === 'trigger') {
    const table = tables.find((item) => item.id === node.tableId)
    if (node.event === 'row_created') return `${table?.name ?? ''} · ${t('flowEventCreated')}`
    if (node.event === 'row_deleted') return `${table?.name ?? ''} · ${t('flowEventDeleted')}`
    const column = table?.columns.find((item) => item.id === node.columnId)
    return [table?.name, column?.name].filter(Boolean).join(' · ')
  }
  if (node.type === 'condition') return t(`op_${node.op}`)
  if (node.type === 'switch') return String(node.cases.length)
  if (node.action === 'update_source') return t('flowUpdateSource')
  if (node.action === 'update_linked') return t('flowUpdateLinked')
  if (node.action === 'update_created') return t('flowUpdateCreated')
  const table = tables.find((item) => item.id === node.tableId)
  return table?.name ?? t('flowAction')
}

function caseLabel(optionIds: string[], columnId: string, tables: AutomationCatalogTable[]) {
  const column = tables.flatMap((table) => table.columns).find((item) => item.id === columnId)
  return optionIds.map((id) => column?.choices.find((choice) => choice.id === id)?.label ?? id).join(', ')
}

function edgeLabel(
  when: string | null,
  flow: AutomationFlow,
  tables: AutomationCatalogTable[],
  t: (key: string) => string,
) {
  if (when === 'yes') return t('flowYes')
  if (when === 'no') return t('flowNo')
  if (when === 'else') return t('flowElse')
  if (!when) return undefined
  const source = flow.nodes.find((node) => node.type === 'switch' && node.cases.some((item) => item.id === when))
  if (!source || source.type !== 'switch') return when
  const item = source.cases.find((entry) => entry.id === when)
  return item ? caseLabel(item.optionIds, source.columnId, tables) : when
}
