import { describe, expect, it } from 'vitest'
import { domainHost, duplicateKey, duplicateKind } from './duplicates.js'

describe('duplicate identity', () => {
  it('treats mail columns and website columns as identities', () => {
    expect(duplicateKind({ type: 'mail', name: 'Email' })).toBe('mail')
    expect(duplicateKind({ type: 'url', name: 'Domain' })).toBe('domain')
    expect(duplicateKind({ type: 'text', name: 'Website' })).toBe('domain')
    expect(duplicateKind({ type: 'text', name: 'Name' })).toBeNull()
  })

  it('matches emails and hosts ignoring case, www, and a path', () => {
    expect(duplicateKey('mail', ' Ada@Northwind.example ')).toBe('ada@northwind.example')
    expect(duplicateKey('mail', 'not-an-email')).toBeNull()
    expect(domainHost('https://www.Northwind.example/about')).toBe('northwind.example')
    expect(domainHost('northwind.example')).toBe('northwind.example')
    expect(duplicateKey('domain', 'https://www.Northwind.example/about')).toBe('northwind.example')
  })
})