import { Plus, Redo2, Undo2, X } from 'lucide-react'
import { type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'
import { selectionKind } from './grid-ux'

type GridStatusBarProps = {
  dataReadOnly: boolean
  canUndo: boolean
  canRedo: boolean
  checkedCount: number
  selectedColumnCount: number
  onInsertRow: () => void
  onUndo: () => void
  onRedo: () => void
  onDuplicateRows: () => void
  onDuplicateColumns: () => void
  onRowColor: (event: ReactMouseEvent<HTMLButtonElement>) => void
  onDeleteRows: () => void
  onDeleteColumns: () => void
  onClearSelection: () => void
}

export function GridStatusBar({
  dataReadOnly,
  canUndo,
  canRedo,
  checkedCount,
  selectedColumnCount,
  onInsertRow,
  onUndo,
  onRedo,
  onDuplicateRows,
  onDuplicateColumns,
  onRowColor,
  onDeleteRows,
  onDeleteColumns,
  onClearSelection,
}: GridStatusBarProps) {
  const { t } = useTranslation()
  const kind = selectionKind(checkedCount, selectedColumnCount)
  return (
    <div className="flex h-12 shrink-0 justify-start items-center gap-2 overflow-x-auto border-t border-border bg-card px-2">
      {!dataReadOnly ? (
        <button
          type="button"
          className="flex h-9 shrink-0 items-center gap-1 whitespace-nowrap text-muted-foreground hover:text-foreground"
          onClick={onInsertRow}
        >
          <Plus className="size-3.5" />
          {t('insertRow')}
        </button>
      ) : null}
      <Button type="button" variant="ghost" className="shrink-0" disabled={!canUndo} aria-label={t('undo')} title={t('undo')} onClick={onUndo}>
        <Undo2 className="size-3.5" />
      </Button>
      <Button type="button" variant="ghost" className="shrink-0" disabled={!canRedo} aria-label={t('redo')} title={t('redo')} onClick={onRedo}>
        <Redo2 className="size-3.5" />
      </Button>
      {checkedCount > 0 || selectedColumnCount > 0 ? (
        <div className="border-l border-border pl-4 mr-auto flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap text-sm">
            {kind === 'both'
              ? t('selectedRowsAndColumns', { rows: checkedCount, columns: selectedColumnCount })
              : kind === 'columns'
                ? t('selectedColumns', { count: selectedColumnCount })
                : t('selectedRows', { count: checkedCount })}
          </span>
          {checkedCount > 0 ? (
            <Button type="button" variant="outline" className="shrink-0 whitespace-nowrap" onClick={onDuplicateRows}>
              {t('duplicateRows')}
            </Button>
          ) : null}
          {selectedColumnCount > 0 ? (
            <Button type="button" variant="outline" className="shrink-0 whitespace-nowrap" onClick={onDuplicateColumns}>
              {t('duplicateColumns')}
            </Button>
          ) : null}
          {checkedCount > 0 ? (
            <Button type="button" variant="outline" className="shrink-0 whitespace-nowrap" onClick={onRowColor}>
              {t('rowColor')}
            </Button>
          ) : null}
          {checkedCount > 0 ? (
            <Button type="button" variant="danger" className="shrink-0 whitespace-nowrap" onClick={onDeleteRows}>
              {t('deleteRows')}
            </Button>
          ) : null}
          {selectedColumnCount > 0 ? (
            <Button type="button" variant="danger" className="shrink-0 whitespace-nowrap" onClick={onDeleteColumns}>
              {t('deleteColumns')}
            </Button>
          ) : null}
          <button type="button" aria-label={t('close')} className="text-muted-foreground" onClick={onClearSelection}>
            <X className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  )
}
