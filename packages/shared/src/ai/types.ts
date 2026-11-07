export type AiHighlightTarget = { rowId: string; columnId: string }

export type AiHighlight = {
  tableId: string
  projectId: string
  label: string
  cells: AiHighlightTarget[]
  rowIds: string[]
  columnIds: string[]
}

export type AiCellChange = {
  rowId: string
  columnId: string
  value: unknown
  version: number
  rowLabel: string
  columnName: string
  before: unknown
}

export type AiCellProposal = {
  kind: 'cells'
  tableId: string
  projectId: string
  changes: AiCellChange[]
}

export type AiFormulaProposal = {
  kind: 'formula'
  tableId: string
  projectId: string
  expression: string
  preview: string
  columnId?: string
  rowId?: string
}

export type AiProposal = AiCellProposal | AiFormulaProposal

export type AiConnectorFieldDraft = {
  sourceKey: string
  targetFieldKey: string
  targetLabel?: string
}

export type AiConnectorDraft = {
  name: string
  format: 'json' | 'csv' | 'xml' | 'html'
  recordsPath?: string
  externalIdPath?: string
  fields: AiConnectorFieldDraft[]
}

export type AiChatResponse = {
  message: string
  highlights: AiHighlight[]
  proposals: AiProposal[]
}
