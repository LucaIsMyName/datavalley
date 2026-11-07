import { describe, expect, it } from 'vitest'
import { loginPath, safeNextPath } from './safe-next'

describe('safeNextPath', () => {
  it('keeps in-app paths including search and hash', () => {
    expect(safeNextPath('/projects/abc?table=1#row')).toBe('/projects/abc?table=1#row')
  })

  it('rejects external and auth destinations', () => {
    expect(safeNextPath(null)).toBeNull()
    expect(safeNextPath('https://evil.test')).toBeNull()
    expect(safeNextPath('//evil.test')).toBeNull()
    expect(safeNextPath('/login?next=/projects')).toBeNull()
    expect(safeNextPath('/change-password')).toBeNull()
  })
})

describe('loginPath', () => {
  it('omits next for the dashboard and encodes other paths', () => {
    expect(loginPath('/')).toBe('/login')
    expect(loginPath('/projects/abc?x=1')).toBe('/login?next=%2Fprojects%2Fabc%3Fx%3D1')
  })
})
