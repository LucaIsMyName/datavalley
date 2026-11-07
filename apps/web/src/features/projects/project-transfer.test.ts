import { describe, expect, it } from 'vitest'
import { PROJECT_TRANSFER_KIND, PROJECT_TRANSFER_VERSION, type ProjectTransferDocument } from '@datavalley/shared'
import { parseProjectImportFile } from './project-transfer'

describe('parseProjectImportFile', () => {
  it('accepts a valid transfer document', () => {
    const payload: ProjectTransferDocument = {
      kind: PROJECT_TRANSFER_KIND,
      version: PROJECT_TRANSFER_VERSION,
      exportedAt: '2026-03-24T00:00:00.000Z',
      project: { name: 'Demo', description: '', icon: 'FolderKanban', settings: {} },
      tables: [],
      formulas: [],
    }
    expect(parseProjectImportFile(JSON.stringify(payload))).toEqual(payload)
  })

  it('rejects invalid documents', () => {
    expect(() => parseProjectImportFile('{}')).toThrow('invalid_project_file')
  })
})
