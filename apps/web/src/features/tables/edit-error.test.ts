import { ApiClientError } from '@datavalley/api-client'
import { describe, expect, it } from 'vitest'
import { editFailureMessage } from './edit-error.js'

const fallback = 'Something went wrong'

describe('edit failure message', () => {
  it('keeps a rejected cell value on the cell', () => {
    const error = new ApiClientError(400, { error: { message: 'Not a number' } })
    expect(editFailureMessage(error, fallback, { cell: true })).toBeNull()
  })

  it('leaves the version-conflict toast in place', () => {
    const conflict = new ApiClientError(409, { error: { code: 'version_conflict', message: 'Row was updated elsewhere' } })
    expect(editFailureMessage(conflict, fallback, { cell: true })).toBeNull()
    expect(editFailureMessage(new Error('version_conflict'), fallback, { cell: true })).toBeNull()
  })

  it('toasts the fallback when a cell save fails for another reason', () => {
    const rejected = new ApiClientError(500, { error: { message: 'Request failed' } })
    expect(editFailureMessage(rejected, fallback, { cell: true })).toBe(fallback)
    expect(editFailureMessage(new Error('network'), fallback, { cell: true })).toBe(fallback)
    expect(editFailureMessage('down', fallback, { cell: true })).toBe(fallback)
  })

  it('keeps the API or undo message for other edit failures', () => {
    const rejected = new ApiClientError(400, { error: { message: 'Unknown function' } })
    expect(editFailureMessage(rejected, fallback)).toBe('Unknown function')
    expect(editFailureMessage(new Error('Could not undo'), fallback)).toBe('Could not undo')
    expect(editFailureMessage('down', fallback)).toBe(fallback)
  })
})
