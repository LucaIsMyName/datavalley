import {
  SWITCH_COLUMN_TYPES,
  columnWritable,
  copyFits,
  opNeedsValue,
  operatorsFor,
  valueKindsFor,
  type AutomationCatalogColumn,
  type AutomationCatalogTable,
  type AutomationFlow,
  type FieldValue,
  type FlowActionKind,
  type FlowEdge,
  type FlowField,
  type FlowNode,
} from '@datavalley/shared'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { SelectField } from '../../components/ui/select'

export function AutomationInspector({
  flow,
  tables,
  nodeId,
  edgeId,
  readOnly,
  onChange,
  onChangeEdge,
  onRemove,
}: {
  flow: AutomationFlow
  tables: AutomationCatalogTable[]
  nodeId: string | null
  edgeId: string | null
  readOnly: boolean
  onChange: (node: FlowNode) => void
  onChangeEdge: (edge: FlowEdge) => void
  onRemove: (id: string) => void
}) {
  const { t } = useTranslation()
  const node = flow.nodes.find((item) => item.id === nodeId)
  const edge = flow.edges.find((item) => item.id === edgeId)
  if (!node && edge) return <EdgeFields flow={flow} tables={tables} edge={edge} readOnly={readOnly} onChange={onChangeEdge} />
  if (!node) return <p className="text-sm text-muted-foreground">{t('flowSelect')}</p>
  const trigger = flow.nodes.find((item) => item.type === 'trigger')
  const triggerTable = tables.find((table) => table.id === trigger?.tableId) ?? tables[0]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{t(nodeTitle(node))}</h2>
        {readOnly ? null : (
          <Button variant="ghost" onClick={() => onRemove(node.id)}>
            {t('flowRemove')}
          </Button>
        )}
      </div>
      {node.type === 'trigger' ? (
        <TriggerFields node={node} tables={tables} readOnly={readOnly} onChange={onChange} />
      ) : null}
      {node.type === 'condition' && triggerTable ? (
        <ConditionFields node={node} table={triggerTable} readOnly={readOnly} onChange={onChange} />
      ) : null}
      {node.type === 'switch' && triggerTable ? (
        <SwitchFields node={node} table={triggerTable} readOnly={readOnly} onChange={onChange} />
      ) : null}
      {node.type === 'action' ? (
        <ActionFields node={node} tables={tables} triggerTable={triggerTable} readOnly={readOnly} onChange={onChange} />
      ) : null}
    </div>
  )
}

function EdgeFields({
  flow,
  tables,
  edge,
  readOnly,
  onChange,
}: {
  flow: AutomationFlow
  tables: AutomationCatalogTable[]
  edge: FlowEdge
  readOnly: boolean
  onChange: (edge: FlowEdge) => void
}) {
  const { t } = useTranslation()
  const source = flow.nodes.find((node) => node.id === edge.source)
  const options =
    source?.type === 'condition'
      ? [
          { value: 'yes', label: t('flowYes') },
          { value: 'no', label: t('flowNo') },
        ]
      : source?.type === 'switch'
        ? [
            ...source.cases.map((item) => ({
              value: item.id,
              label: item.optionIds
                .map((id) => tables.flatMap((table) => table.columns).find((column) => column.id === source.columnId)?.choices.find((choice) => choice.id === id)?.label ?? id)
                .join(', '),
            })),
            { value: 'else', label: t('flowElse') },
          ]
        : []
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{t('flowLine')}</h2>
      {options.length > 0 ? (
        <SelectField
          label={t('flowLineWhen')}
          value={edge.when ?? options[0]?.value ?? ''}
          onValueChange={(when) => {
            if (readOnly) return
            onChange({ ...edge, when })
          }}
          options={options}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t('flowLineAlways')}</p>
      )}
    </div>
  )
}

function TriggerFields({
  node,
  tables,
  readOnly,
  onChange,
}: {
  node: Extract<FlowNode, { type: 'trigger' }>
  tables: AutomationCatalogTable[]
  readOnly: boolean
  onChange: (node: FlowNode) => void
}) {
  const { t } = useTranslation()
  const table = tables.find((item) => item.id === node.tableId) ?? tables[0]
  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-3">
      <SelectField
        label={t('flowTable')}
        value={table?.id ?? ''}
        onValueChange={(tableId) => {
          const next = tables.find((item) => item.id === tableId)
          onChange({ ...node, tableId, columnId: next?.columns[0]?.id ?? null })
        }}
        options={tables.map((item) => ({ value: item.id, label: item.name }))}
      />
      <SelectField
        label={t('flowTrigger')}
        value={node.event}
        onValueChange={(event) =>
          onChange({
            ...node,
            event: event === 'row_created' || event === 'row_deleted' ? event : 'column_changed',
            columnId: event === 'column_changed' ? (table?.columns[0]?.id ?? null) : null,
          })
        }
        options={[
          { value: 'column_changed', label: t('flowEventChanged') },
          { value: 'row_created', label: t('flowEventCreated') },
          { value: 'row_deleted', label: t('flowEventDeleted') },
        ]}
      />
      {node.event === 'column_changed' && table ? (
        <SelectField
          label={t('flowColumn')}
          value={node.columnId ?? ''}
          onValueChange={(columnId) => onChange({ ...node, columnId })}
        options={table.columns.map((column) => ({ value: column.id, label: column.name }))}
      />
      ) : null}
    </fieldset>
  )
}

function ConditionFields({
  node,
  table,
  readOnly,
  onChange,
}: {
  node: Extract<FlowNode, { type: 'condition' }>
  table: AutomationCatalogTable
  readOnly: boolean
  onChange: (node: FlowNode) => void
}) {
  const { t } = useTranslation()
  const column = table.columns.find((item) => item.id === node.columnId) ?? table.columns[0]
  const operators = operatorsFor(column?.type ?? 'text')
  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-3">
      <SelectField
        label={t('flowColumn')}
        value={column?.id ?? ''}
        onValueChange={(columnId) => {
          const next = table.columns.find((item) => item.id === columnId)
          const ops = operatorsFor(next?.type ?? 'text')
          const op = ops.includes(node.op) ? node.op : ops[0]
          onChange({ ...node, columnId, op, value: opNeedsValue(op) ? defaultCompare(next, op) : null })
        }}
        options={table.columns.map((item) => ({ value: item.id, label: item.name }))}
      />
      <SelectField
        label={t('flowCondition')}
        value={operators.includes(node.op) ? node.op : operators[0]}
        onValueChange={(op) => onChange({ ...node, op, value: opNeedsValue(op) ? defaultCompare(column, op) : null })}
        options={operators.map((op) => ({ value: op, label: t(`op_${op}`) }))}
      />
      {column && opNeedsValue(operators.includes(node.op) ? node.op : operators[0]) ? (
        <CompareValue
          column={column}
          op={operators.includes(node.op) ? node.op : operators[0]}
          value={node.value}
          onChange={(value) => onChange({ ...node, value })}
        />
      ) : null}
    </fieldset>
  )
}

function SwitchFields({
  node,
  table,
  readOnly,
  onChange,
}: {
  node: Extract<FlowNode, { type: 'switch' }>
  table: AutomationCatalogTable
  readOnly: boolean
  onChange: (node: FlowNode) => void
}) {
  const { t } = useTranslation()
  const choices = table.columns.filter((column) =>
    SWITCH_COLUMN_TYPES.includes(column.type as (typeof SWITCH_COLUMN_TYPES)[number]),
  )
  const column = table.columns.find((item) => item.id === node.columnId)
  const shown = choices.some((item) => item.id === column?.id) ? choices : column ? [column, ...choices] : choices
  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-3">
      <SelectField
        label={t('flowColumn')}
        value={column?.id ?? ''}
        onValueChange={(columnId) => {
          const next = table.columns.find((item) => item.id === columnId)
          const first = next?.choices[0]
          onChange({
            ...node,
            columnId,
            cases: first ? [{ id: crypto.randomUUID(), optionIds: [first.id] }] : [],
          })
        }}
        options={shown.map((item) => ({ value: item.id, label: item.name }))}
      />
      {node.cases.map((item) => (
        <div key={item.id} className="flex flex-col gap-2 border border-border p-2">
          <ChoiceChecks
            choices={column?.choices ?? []}
            selected={item.optionIds}
            onChange={(optionIds) =>
              onChange({ ...node, cases: node.cases.map((entry) => (entry.id === item.id ? { ...entry, optionIds } : entry)) })
            }
          />
          <Button
            variant="ghost"
            onClick={() => onChange({ ...node, cases: node.cases.filter((entry) => entry.id !== item.id) })}
          >
            {t('flowRemove')}
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        onClick={() => onChange({ ...node, cases: [...node.cases, { id: crypto.randomUUID(), optionIds: [] }] })}
      >
        {t('flowAddCase')}
      </Button>
    </fieldset>
  )
}

function ActionFields({
  node,
  tables,
  triggerTable,
  readOnly,
  onChange,
}: {
  node: Extract<FlowNode, { type: 'action' }>
  tables: AutomationCatalogTable[]
  triggerTable: AutomationCatalogTable | undefined
  readOnly: boolean
  onChange: (node: FlowNode) => void
}) {
  const { t } = useTranslation()
  const table =
    node.action === 'update_source' ? triggerTable : (tables.find((item) => item.id === node.tableId) ?? tables[0])
  const links = (table?.columns ?? []).filter((column) => column.type === 'relation' && column.toTableId === triggerTable?.id)
  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-3">
      <SelectField
        label={t('flowAction')}
        value={node.action}
        onValueChange={(action) => onChange(withAction(node, action as FlowActionKind, tables, triggerTable))}
        options={[
          { value: 'create', label: t('automationCreate') },
          { value: 'update_source', label: t('flowUpdateSource') },
          { value: 'update_linked', label: t('flowUpdateLinked') },
          { value: 'update_created', label: t('flowUpdateCreated') },
        ]}
      />
      {node.action === 'update_source' ? null : (
        <SelectField
          label={t('flowTable')}
          value={table?.id ?? ''}
          onValueChange={(tableId) => onChange({ ...node, tableId, linkColumnId: null, fields: [] })}
          options={tables.map((item) => ({ value: item.id, label: item.name }))}
        />
      )}
      {node.action === 'update_linked' ? (
        <SelectField
          label={t('flowLink')}
          value={node.linkColumnId ?? ''}
          onValueChange={(linkColumnId) => onChange({ ...node, linkColumnId: linkColumnId || null })}
          options={[{ value: '', label: t('automationNone') }, ...links.map((column) => ({ value: column.id, label: column.name }))]}
        />
      ) : null}
      <Label>{t('flowFields')}</Label>
      {node.fields.map((field, index) => (
        <FieldEditor
          key={`${field.columnId}-${index}`}
          field={field}
          table={table}
          triggerTable={triggerTable}
          onChange={(next) => onChange({ ...node, fields: node.fields.map((item, itemIndex) => (itemIndex === index ? next : item)) })}
          onRemove={() => onChange({ ...node, fields: node.fields.filter((_, itemIndex) => itemIndex !== index) })}
        />
      ))}
      <Button variant="outline" onClick={() => table && onChange({ ...node, fields: [...node.fields, blankField(table)] })}>
        {t('flowAddField')}
      </Button>
    </fieldset>
  )
}

function FieldEditor({
  field,
  table,
  triggerTable,
  onChange,
  onRemove,
}: {
  field: FlowField
  table: AutomationCatalogTable | undefined
  triggerTable: AutomationCatalogTable | undefined
  onChange: (field: FlowField) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const columns = table?.columns ?? []
  const column = columns.find((item) => item.id === field.columnId)
  const writable = columns.filter((item) => columnWritable(item.type))
  const listed = column && !writable.some((item) => item.id === column.id) ? [column, ...writable] : writable
  const kinds = valueKindsFor(column?.type ?? 'text')
  const copies = (triggerTable?.columns ?? []).filter((item) => column && copyFits(column.type, item.type))
  return (
    <div className="flex flex-col gap-2 border border-border p-2">
      <SelectField
        label={t('flowColumn')}
        value={field.columnId}
        onValueChange={(columnId) => {
          const next = columns.find((item) => item.id === columnId)
          const kind = valueKindsFor(next?.type ?? 'text')[0] ?? 'literal'
          onChange({ columnId, value: defaultFieldValue(next, kind, triggerTable?.columns ?? []) })
        }}
        options={listed.map((item) => ({ value: item.id, label: item.name }))}
      />
      <SelectField
        label={t('flowValueKind')}
        value={kinds.includes(field.value.kind) ? field.value.kind : (kinds[0] ?? 'literal')}
        onValueChange={(kind) =>
          onChange({
            ...field,
            value: defaultFieldValue(column, kind as FieldValue['kind'], triggerTable?.columns ?? []),
          })
        }
        options={kinds.map((kind) => ({ value: kind, label: t(kindLabel(kind)) }))}
      />
      {column && field.value.kind === 'literal' ? (
        <LiteralValue column={column} value={field.value.value} onChange={(value) => onChange({ ...field, value: { kind: 'literal', value } })} />
      ) : null}
      {field.value.kind === 'column' ? (
        <SelectField
          label={t('flowValueColumn')}
          value={field.value.columnId}
          onValueChange={(columnId) => onChange({ ...field, value: { kind: 'column', columnId } })}
          options={copies.map((item) => ({ value: item.id, label: item.name }))}
        />
      ) : null}
      {field.value.kind === 'template' ? (
        <>
          <Input
            value={field.value.template}
            onChange={(event) => onChange({ ...field, value: { kind: 'template', template: event.target.value } })}
          />
          <p className="text-xs text-muted-foreground">{t('flowTokens')}</p>
        </>
      ) : null}
      <Button variant="ghost" onClick={onRemove}>
        {t('flowRemove')}
      </Button>
    </div>
  )
}

function CompareValue({
  column,
  op,
  value,
  onChange,
}: {
  column: AutomationCatalogColumn
  op: string
  value: unknown
  onChange: (value: unknown) => void
}) {
  const { t } = useTranslation()
  if (op === 'any_of' || op === 'contains_any') {
    const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    return <ChoiceChecks choices={column.choices} selected={selected} onChange={onChange} />
  }
  if (column.type === 'select' || column.type === 'radio' || column.type === 'status' || column.type === 'tags') {
    return (
      <SelectField
        label={t('flowValueLiteral')}
        value={typeof value === 'string' ? value : ''}
        onValueChange={onChange}
        options={column.choices.map((choice) => ({ value: choice.id, label: choice.label }))}
      />
    )
  }
  if (column.type === 'number' || column.type === 'currency') {
    return (
      <Input
        type="number"
        value={typeof value === 'number' ? String(value) : ''}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      />
    )
  }
  return (
    <Input
      type={column.type === 'date' || column.type === 'datetime' ? 'date' : 'text'}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function LiteralValue({
  column,
  value,
  onChange,
}: {
  column: AutomationCatalogColumn
  value: unknown
  onChange: (value: unknown) => void
}) {
  const { t } = useTranslation()
  if (column.type === 'checkbox') {
    return (
      <SelectField
        label={t('flowValueLiteral')}
        value={value === true ? 'true' : 'false'}
        onValueChange={(next) => onChange(next === 'true')}
        options={[
          { value: 'true', label: t('flowTrue') },
          { value: 'false', label: t('flowFalse') },
        ]}
      />
    )
  }
  if (column.type === 'tags' || column.type === 'multi_select') {
    const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    return <ChoiceChecks choices={column.choices} selected={selected} onChange={onChange} />
  }
  if (column.type === 'select' || column.type === 'radio' || column.type === 'status') {
    return (
      <SelectField
        label={t('flowValueLiteral')}
        value={typeof value === 'string' ? value : ''}
        onValueChange={onChange}
        options={column.choices.map((choice) => ({ value: choice.id, label: choice.label }))}
      />
    )
  }
  if (column.type === 'number' || column.type === 'currency') {
    return (
      <Input
        type="number"
        value={typeof value === 'number' ? String(value) : ''}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      />
    )
  }
  return (
    <Input
      type={column.type === 'date' || column.type === 'datetime' ? 'date' : 'text'}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function ChoiceChecks({
  choices,
  selected,
  onChange,
}: {
  choices: { id: string; label: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {choices.map((choice) => (
        <label key={choice.id} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={selected.includes(choice.id)}
            onCheckedChange={(checked) =>
              onChange(checked === true ? [...selected, choice.id] : selected.filter((id) => id !== choice.id))
            }
          />
          {choice.label}
        </label>
      ))}
    </div>
  )
}

function withAction(
  node: Extract<FlowNode, { type: 'action' }>,
  action: FlowActionKind,
  tables: AutomationCatalogTable[],
  triggerTable: AutomationCatalogTable | undefined,
): FlowNode {
  const next =
    action === 'update_source'
      ? { ...node, action, tableId: triggerTable?.id ?? node.tableId, linkColumnId: null }
      : action === 'update_linked'
        ? {
            ...node,
            action,
            tableId: (tables.find((item) => item.id === node.tableId) ?? tables[0])?.id ?? node.tableId,
            linkColumnId:
              (tables.find((item) => item.id === node.tableId) ?? tables[0])?.columns.find(
                (column) => column.type === 'relation' && column.toTableId === triggerTable?.id,
              )?.id ?? null,
          }
        : { ...node, action, linkColumnId: null }
  const target = next.action === 'update_source' ? triggerTable : tables.find((item) => item.id === next.tableId)
  const ids = new Set(target?.columns.map((column) => column.id) ?? [])
  return { ...next, fields: next.fields.filter((field) => ids.has(field.columnId)) }
}

function blankField(table: AutomationCatalogTable): FlowField {
  const column = table.columns.find((item) => columnWritable(item.type)) ?? table.columns[0]
  const kind = valueKindsFor(column?.type ?? 'text')[0] ?? 'literal'
  return { columnId: column?.id ?? '', value: defaultFieldValue(column, kind, []) }
}

function defaultFieldValue(
  column: AutomationCatalogColumn | undefined,
  kind: FieldValue['kind'],
  sources: AutomationCatalogColumn[],
): FieldValue {
  if (kind === 'empty') return { kind: 'empty' }
  if (kind === 'template') return { kind: 'template', template: '' }
  if (kind === 'column') {
    const source = sources.find((item) => column && copyFits(column.type, item.type))
    return { kind: 'column', columnId: source?.id ?? '' }
  }
  if (!column) return { kind: 'literal', value: '' }
  if (column.type === 'checkbox') return { kind: 'literal', value: false }
  if (column.type === 'number' || column.type === 'currency') return { kind: 'literal', value: 0 }
  if (column.type === 'select' || column.type === 'radio' || column.type === 'status') {
    return { kind: 'literal', value: column.choices[0]?.id ?? '' }
  }
  if (column.type === 'tags' || column.type === 'multi_select') return { kind: 'literal', value: [] }
  return { kind: 'literal', value: '' }
}

function defaultCompare(column: AutomationCatalogColumn | undefined, op: string) {
  if (!column) return ''
  if (op === 'any_of' || op === 'contains_any') return column.choices[0] ? [column.choices[0].id] : []
  if (column.type === 'number' || column.type === 'currency') return 0
  if (column.choices[0] && (column.type === 'select' || column.type === 'radio' || column.type === 'status' || column.type === 'tags')) {
    return column.choices[0].id
  }
  return ''
}

function kindLabel(kind: FieldValue['kind']) {
  if (kind === 'column') return 'flowValueColumn'
  if (kind === 'template') return 'flowValueTemplate'
  if (kind === 'empty') return 'flowValueEmpty'
  return 'flowValueLiteral'
}

function nodeTitle(node: FlowNode) {
  if (node.type === 'trigger') return 'flowTrigger'
  if (node.type === 'condition') return 'flowCondition'
  if (node.type === 'switch') return 'flowSwitch'
  return 'flowAction'
}
