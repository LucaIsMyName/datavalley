import { type Column, type RowRecord } from '@datavalley/api-client'
import { dateColumnIncludesTime, isDateColumnType } from '@datavalley/shared'
import { AnchoredLayer } from '../../components/anchored-layer'
import { DatePickerField } from '../../components/date-picker-field'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { SelectField } from '../../components/ui/select'
import { patchCachedTable } from './cache'
import { COLUMN_TYPES } from './column-menu'
import { filterOperatorKey, cardinalityKey } from './grid-ux'
import { operatorsFor } from './grid-model'
import { COLUMN_ICONS, ColumnIcon } from './icons'
import { SelectOptionsDialog } from './select-options-dialog'
import { Swatches } from './swatches'
import { sync } from '../../lib/sync'

export function GridPopovers(input: Record<string, any>) {
  const {
    popover,
    columns,
    rows,
    t,
    searchInput,
    setSearchInput,
    tableId,
    setSearch,
    newColumnType,
    setNewColumnType,
    createColumn,
    dataReadOnly,
    queryClient,
    refresh,
    filterInput,
    setFilterInput,
    setFilters,
    i18n,
    checked,
    paintRows,
    paintRow,
    paintCell,
    relationCardinality,
    setRelationCardinality,
    relationTarget,
    setRelationTarget,
    saveRelation,
    projectTables,
    saveConfig,
    setPopover,
    viewName,
    setViewName,
    saveView,
    sharedView,
    setSharedView,
  } = input
  if (!popover) return null
  const popoverColumn = columns.find((column: Column) => column.id === popover.columnId)
  const popoverRow = rows.find((row: RowRecord) => row.id === popover.rowId)
  return (
    <AnchoredLayer
      popover
      prefer="below"
      align="start"
      anchor={popover}
      className="w-[min(20rem,calc(100vw-2rem))] border border-border bg-card p-3 shadow-md"
    >
      {popover.kind === 'find' ? (
        <Input
          aria-label={t('find')}
          value={searchInput}
          onChange={(event) => {
            const value = event.target.value
            setSearchInput(value)
            sync.watch(`find:${tableId}`, 300, () => setSearch(value))
          }}
        />
      ) : null}
      {popover.kind === 'new-column' ? (
        <div className="flex flex-col gap-2">
          <SelectField
            label={t('columnType')}
            value={newColumnType}
            onValueChange={setNewColumnType}
            options={COLUMN_TYPES.map((type) => ({ value: type, label: t(`type_${type}`) }))}
          />
          <Button type="button" onClick={() => void createColumn(newColumnType)}>
            {t('confirm')}
          </Button>
        </div>
      ) : null}
      {popover.kind === 'select-options' && popoverColumn ? (
        <SelectOptionsDialog
          column={popoverColumn}
          readOnly={dataReadOnly}
          onChange={(next) =>
            patchCachedTable(queryClient, tableId, (current) => ({
              ...current,
              columns: current.columns?.map((item) => (item.id === next.id ? next : item)),
            }))
          }
          onRefresh={() => void refresh()}
        />
      ) : null}
      {popover.kind === 'filter' && popoverColumn ? (
        <div className="flex flex-col gap-2">
          <SelectField
            label={t('operator')}
            value={filterInput[popoverColumn.id]?.op ?? operatorsFor(popoverColumn.type)[0]}
            onValueChange={(op) => {
              const next = {
                ...filterInput,
                [popoverColumn.id]: {
                  op,
                  value: filterInput[popoverColumn.id]?.value ?? '',
                },
              }
              setFilterInput(next)
              sync.watch(`filter:${tableId}`, 300, () => setFilters(next))
            }}
            options={operatorsFor(popoverColumn.type).map((op) => ({
              value: op,
              label: t(filterOperatorKey(op)),
            }))}
          />
          {isDateColumnType(popoverColumn.type) ? (
            <DatePickerField
              label={t('value')}
              kind={dateColumnIncludesTime(popoverColumn) ? 'datetime' : 'date'}
              language={i18n.language}
              value={String(filterInput[popoverColumn.id]?.value ?? '')}
              onChange={(value) => {
                const next = {
                  ...filterInput,
                  [popoverColumn.id]: {
                    op: filterInput[popoverColumn.id]?.op ?? 'eq',
                    value,
                  },
                }
                setFilterInput(next)
                sync.watch(`filter:${tableId}`, 300, () => setFilters(next))
              }}
            />
          ) : (
            <Input
              aria-label={t('value')}
              value={filterInput[popoverColumn.id]?.value ?? ''}
              onChange={(event) => {
                const next = {
                  ...filterInput,
                  [popoverColumn.id]: {
                    op: filterInput[popoverColumn.id]?.op ?? 'eq',
                    value: event.target.value,
                  },
                }
                setFilterInput(next)
                sync.watch(`filter:${tableId}`, 300, () => setFilters(next))
              }}
            />
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const next = { ...filterInput }
              delete next[popoverColumn.id]
              setFilterInput(next)
              sync.watch(`filter:${tableId}`, 300, () => setFilters(next))
            }}
          >
            {t('clearFilter')}
          </Button>
        </div>
      ) : null}
      {popover.kind === 'row-color' ? (
        <Swatches
          role="background"
          value={popoverRow?.color}
          onPick={(color) => {
            if (checked.length > 1 && popover.rowId && checked.includes(popover.rowId))
              void paintRows(color)
            else if (popoverRow) void paintRow(popoverRow, color)
          }}
        />
      ) : null}
      {popover.kind === 'cell-color' && popoverRow && popover.columnId ? (
        <Swatches
          role="background"
          value={popoverRow.backgrounds?.[popover.columnId]}
          onPick={(color) => void paintCell(popoverRow, popover.columnId!, color)}
        />
      ) : null}
      {popover.kind === 'relation' && popoverColumn ? (
        <div className="flex flex-col gap-2">
          <SelectField
            label={t('cardinality')}
            value={relationCardinality}
            onValueChange={setRelationCardinality}
            options={[
              { value: 'many_to_one', label: t(cardinalityKey('many_to_one')) },
              { value: 'one_to_one', label: t(cardinalityKey('one_to_one')) },
              { value: 'one_to_many', label: t(cardinalityKey('one_to_many')) },
            ]}
          />
          <SelectField
            label={t('targetTable')}
            value={relationTarget}
            onValueChange={(next) => {
              setRelationTarget(next)
              if (next) void saveRelation(popoverColumn, next)
            }}
            options={[
              { value: '', label: t('targetTable') },
              ...(projectTables.data?.tables ?? [])
                .filter((item: any) => item.id !== tableId)
                .map((item: any) => ({ value: item.id, label: item.name })),
            ]}
          />
        </div>
      ) : null}
      {popover.kind === 'icon' && popoverColumn ? (
        <div className="grid grid-cols-5 gap-1">
          {Object.keys(COLUMN_ICONS).map((name) => (
            <button
              key={name}
              type="button"
              aria-label={`${t('icon')} ${name}`}
              className="flex h-8 items-center justify-center hover:bg-accent"
              onClick={() => {
                void saveConfig(popoverColumn, { icon: name })
                setPopover(null)
              }}
            >
              <ColumnIcon name={name} />
            </button>
          ))}
        </div>
      ) : null}
      {popover.kind === 'view' ? (
        <div className="flex flex-col gap-2">
          <Input
            aria-label={t('viewName')}
            value={viewName}
            onChange={(event) => setViewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void saveView()
            }}
          />
          <label htmlFor="shared-view" className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              id="shared-view"
              checked={sharedView}
              onCheckedChange={(next) => setSharedView(next === true)}
            />
            {t('shared')}
          </label>
        </div>
      ) : null}
    </AnchoredLayer>
  )
}
