import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  NodeToolbar,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  getBezierPath,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import type { AutomationCatalogTable, AutomationFlow, FlowEdge, FlowIssue } from '@datavalley/shared'
import { GitBranch, Pencil, Play, Split, Trash2, Zap, type LucideIcon } from 'lucide-react'
import { createContext, useContext, useEffect, useMemo, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { shouldCommitNodePosition } from './automation-drag'
import '@xyflow/react/dist/style.css'

type StepKind = 'trigger' | 'condition' | 'switch' | 'action'

export type CanvasSelection = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null

type CardData = {
  title: string
  subtitle: string
  error: string | null
  kind: StepKind
  cases: { id: string; label: string }[]
}

type LineData = { caption: string; chosen: boolean }

type CanvasActions = {
  readOnly: boolean
  onEditNode: (id: string) => void
  onDeleteNode: (id: string) => void
  onEditEdge: (id: string) => void
  onDeleteEdge: (id: string) => void
}

const CanvasActionsContext = createContext<CanvasActions | null>(null)

const stepIcons: Record<StepKind, LucideIcon> = {
  trigger: Zap,
  condition: GitBranch,
  switch: Split,
  action: Play,
}

const nodeTypes = { trigger: StepNode, condition: StepNode, switch: StepNode, action: StepNode }
const edgeTypes = { line: FlowLine }

export function AutomationCanvas(props: {
  flow: AutomationFlow
  tables: AutomationCatalogTable[]
  issues: FlowIssue[]
  readOnly: boolean
  selection: CanvasSelection
  onSelect: (selection: CanvasSelection) => void
  onMove: (id: string, position: { x: number; y: number }) => void
  onConnectEdge: (edge: FlowEdge) => void
  onRemoveNodes: (ids: string[]) => void
  onRemoveEdges: (ids: string[]) => void
  onAdd: (kind: StepKind, position: { x: number; y: number }) => void
}) {
  return (
    <ReactFlowProvider>
      <CanvasBody {...props} />
    </ReactFlowProvider>
  )
}

function CanvasBody(props: {
  flow: AutomationFlow
  tables: AutomationCatalogTable[]
  issues: FlowIssue[]
  readOnly: boolean
  selection: CanvasSelection
  onSelect: (selection: CanvasSelection) => void
  onMove: (id: string, position: { x: number; y: number }) => void
  onConnectEdge: (edge: FlowEdge) => void
  onRemoveNodes: (ids: string[]) => void
  onRemoveEdges: (ids: string[]) => void
  onAdd: (kind: StepKind, position: { x: number; y: number }) => void
}) {
  const { t } = useTranslation()
  const { fitView, screenToFlowPosition } = useReactFlow()
  const model = useMemo(() => buildGraph(props.flow, props.tables, props.issues, props.selection, t), [props.flow, props.tables, props.issues, props.selection, t])
  const [nodes, setNodes] = useState<Node<CardData>[]>(model.nodes)
  const [edges, setEdges] = useState<Edge<LineData>[]>(model.edges)
  const actions = useMemo<CanvasActions>(
    () => ({
      readOnly: props.readOnly,
      onEditNode: (id) => props.onSelect({ kind: 'node', id }),
      onDeleteNode: (id) => props.onRemoveNodes([id]),
      onEditEdge: (id) => props.onSelect({ kind: 'edge', id }),
      onDeleteEdge: (id) => props.onRemoveEdges([id]),
    }),
    [props.readOnly, props.onSelect, props.onRemoveNodes, props.onRemoveEdges],
  )

  useEffect(() => {
    setNodes(model.nodes)
    setEdges(model.edges)
  }, [model])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.2 })
    })
    return () => cancelAnimationFrame(frame)
  }, [props.flow.id, fitView])

  function onNodesChange(changes: NodeChange<Node<CardData>>[]) {
    setNodes((current) => applyNodeChanges(changes, current))
    if (props.readOnly) return
    for (const change of changes) {
      if (change.type !== 'position') continue
      if (!shouldCommitNodePosition(change) || !change.position) continue
      props.onMove(change.id, { x: change.position.x, y: change.position.y })
    }
  }

  function onEdgesChange(changes: EdgeChange<Edge<LineData>>[]) {
    setEdges((current) => applyEdgeChanges(changes, current))
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    if (props.readOnly) return
    const kind = event.dataTransfer.getData('application/datavalley-flow')
    if (kind !== 'trigger' && kind !== 'condition' && kind !== 'switch' && kind !== 'action') return
    props.onAdd(kind, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  return (
    <CanvasActionsContext.Provider value={actions}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={!props.readOnly}
        nodesConnectable={!props.readOnly}
        elementsSelectable
        multiSelectionKeyCode={null}
        selectionOnDrag={false}
        deleteKeyCode={props.readOnly ? null : ['Backspace', 'Delete']}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodesDelete={(deleted) => props.onRemoveNodes(deleted.map((node) => node.id))}
        onEdgesDelete={(deleted) => props.onRemoveEdges(deleted.map((edge) => edge.id))}
        onPaneClick={() => props.onSelect(null)}
        onNodeClick={(_, node) => props.onSelect({ kind: 'node', id: node.id })}
        onEdgeClick={(_, edge) => props.onSelect({ kind: 'edge', id: edge.id })}
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
    </CanvasActionsContext.Provider>
  )
}

function StepNode({ data, selected, id }: NodeProps<Node<CardData>>) {
  const { t } = useTranslation()
  const actions = useContext(CanvasActionsContext)
  const Icon = stepIcons[data.kind]
  return (
    <div className={cn('w-48 border bg-card px-3 py-2 text-left text-sm', selected && 'ring-2 ring-primary', data.error ? 'border-danger' : 'border-border')}>
      {actions && !actions.readOnly ? (
        <NodeToolbar isVisible={selected} position={Position.Top} className="nodrag nopan">
          <SelectionActions
            onEdit={() => actions.onEditNode(id)}
            onDelete={() => actions.onDeleteNode(id)}
          />
        </NodeToolbar>
      ) : null}
      {data.kind === 'trigger' ? null : <Handle type="target" position={Position.Top} />}
      <div className="flex items-center gap-2">
        <span data-step-icon={data.kind} className="text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="font-medium">{data.title}</div>
      </div>
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

function FlowLine({ id, selected, data, ...props }: EdgeProps<Edge<LineData>>) {
  const actions = useContext(CanvasActionsContext)
  const [path, labelX, labelY] = getBezierPath(props)
  const chosen = selected || data?.chosen === true
  return (
    <>
      <BaseEdge id={id} path={path} interactionWidth={20} style={{ strokeWidth: chosen ? 2.5 : 1 }} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {chosen && actions && !actions.readOnly ? (
            <SelectionActions onEdit={() => actions.onEditEdge(id)} onDelete={() => actions.onDeleteEdge(id)} />
          ) : data?.caption ? (
            <span className="bg-card px-1 text-xs text-muted-foreground">{data.caption}</span>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export function SelectionActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex gap-1 border border-border bg-card p-1">
      <button type="button" className="p-1 hover:bg-accent" aria-label={t('flowEdit')} onClick={onEdit}>
        <Pencil className="size-3.5" aria-hidden />
      </button>
      <button type="button" className="p-1 hover:bg-accent" aria-label={t('flowDeleteStep')} onClick={onDelete}>
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}

export const automationStepIcons = stepIcons

function buildGraph(
  flow: AutomationFlow,
  tables: AutomationCatalogTable[],
  issues: FlowIssue[],
  selection: CanvasSelection,
  t: (key: string) => string,
) {
  const nodes: Node<CardData>[] = flow.nodes.map((node) => {
    const issue = issues.find((item) => item.nodeId === node.id)
    return {
      id: node.id,
      type: node.type,
      position: node.position,
      selected: selection?.kind === 'node' && selection.id === node.id,
      data: {
        title: t(titleKey(node.type)),
        subtitle: subtitle(node, tables, t),
        error: issue ? t(`flowIssue_${issue.code}`) : null,
        kind: node.type,
        cases:
          node.type === 'switch'
            ? [
                ...node.cases.map((item) => ({ id: item.id, label: caseLabel(item.optionIds, node.columnId, tables) })),
                { id: 'else', label: t('flowElse') },
              ]
            : [],
      },
    }
  })
  const edges: Edge<LineData>[] = flow.edges.map((edge) => ({
    id: edge.id,
    type: 'line',
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.when ?? 'out',
    selected: selection?.kind === 'edge' && selection.id === edge.id,
    data: {
      caption: edgeLabel(edge.when, flow, tables, t) ?? '',
      chosen: selection?.kind === 'edge' && selection.id === edge.id,
    },
  }))
  return { nodes, edges }
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
