import { DollarSign, EyeOff, Palette, Pencil, Trash2, Type } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import type { MenuEntry, MenuItem } from '../../components/context-menu.js'
import { buildColumnHeaderMenu } from './column-menu.js'

function menuFor(column: { type: string; config?: Record<string, unknown> }, checkedCount = 0) {
  return buildColumnHeaderMenu({
    column: { type: column.type, config: column.config ?? {} },
    checkedCount,
    label: (key) => key,
    onSelect: () => undefined,
  })
}

function headings(entries: MenuEntry[]) {
  return entries.filter((entry) => 'kind' in entry && entry.kind === 'heading').map((entry) => entry.id)
}

function items(entries: MenuEntry[]) {
  return entries.filter((entry): entry is MenuItem => !('kind' in entry))
}

function idsBetween(entries: MenuEntry[], start: string, end?: string) {
  const startAt = entries.findIndex((entry) => entry.id === start)
  const endAt = end ? entries.findIndex((entry) => entry.id === end) : entries.length
  return entries.slice(startAt + 1, endAt).map((entry) => entry.id)
}

describe('column header menu', () => {
  it('groups data types, actions, the footer, and conditions', () => {
    const entries = menuFor({ type: 'text' })
    expect(headings(entries)).toEqual(['datatypes', 'actions', 'footer', 'conditions'])
    expect(entries.find((entry) => entry.id === 'datatypes')).toMatchObject({ label: 'menuDatatypes' })
    expect(entries.find((entry) => entry.id === 'actions')).toMatchObject({ label: 'menuActions' })
    expect(entries.find((entry) => entry.id === 'footer')).toMatchObject({ label: 'footer' })
    expect(entries.find((entry) => entry.id === 'conditions')).toMatchObject({ label: 'menuConditions' })
  })

  it('labels each data type and disables the current one', () => {
    const entries = menuFor({ type: 'text' })
    const text = items(entries).find((entry) => entry.id === 'type-text')
    const number = items(entries).find((entry) => entry.id === 'type-number')
    expect(text).toMatchObject({ label: 'type_text', disabled: true, icon: Type })
    expect(number).toMatchObject({ label: 'type_number', disabled: false })
  })

  it('keeps column actions together and delete last', () => {
    const entries = menuFor({ type: 'text' }, 1)
    expect(idsBetween(entries, 'actions', 'footer')).toEqual([
      'rename',
      'hide',
      'sort',
      'filter',
      'left',
      'right',
      'duplicate',
      'fill',
      'delete',
    ])
    expect(items(entries).find((entry) => entry.id === 'rename')?.icon).toBe(Pencil)
    expect(items(entries).find((entry) => entry.id === 'hide')?.icon).toBe(EyeOff)
    expect(items(entries).find((entry) => entry.id === 'fill')?.disabled).toBe(true)
    expect(items(entries).find((entry) => entry.id === 'delete')).toMatchObject({ icon: Trash2, danger: true })
    expect(items(menuFor({ type: 'text' }, 2)).find((entry) => entry.id === 'fill')?.disabled).toBe(false)
  })

  it('offers number footer math and text footer counts', () => {
    expect(idsBetween(menuFor({ type: 'number' }), 'footer', 'conditions')).toEqual([
      'footer-count',
      'footer-sum',
      'footer-avg',
      'footer-median',
      'footer-min',
      'footer-max',
      'footer-empty',
      'footer-filled',
    ])
    expect(idsBetween(menuFor({ type: 'text' }), 'footer', 'conditions')).toEqual([
      'footer-count',
      'footer-unique',
      'footer-empty',
      'footer-filled',
      'footer-percent_empty',
      'footer-percent_filled',
    ])
  })

  it('puts format options in data types and conditional color in conditions', () => {
    const money = menuFor({ type: 'number', config: { variant: 'money' } })
    expect(idsBetween(money, 'datatypes', 'actions')).toContain('variant-money')
    expect(idsBetween(money, 'datatypes', 'actions')).toContain('currency-EUR')
    expect(items(money).find((entry) => entry.id === 'variant-money')?.disabled).toBe(true)
    expect(items(money).find((entry) => entry.id === 'currency-USD')?.icon).toBe(DollarSign)
    expect(idsBetween(money, 'conditions')).toEqual(['conditional'])
    expect(items(money).find((entry) => entry.id === 'conditional')).toMatchObject({
      label: 'conditionalColor',
      icon: Palette,
    })
    expect(items(menuFor({ type: 'row_id' })).find((entry) => entry.id === 'style-sequence')?.disabled).toBe(true)
  })

  it('gives every action an icon', () => {
    const columns = [
      menuFor({ type: 'text' }),
      menuFor({ type: 'number', config: { variant: 'money', currency: 'EUR' } }),
      menuFor({ type: 'currency' }),
      menuFor({ type: 'row_id', config: { style: 'uuid' } }),
    ]
    for (const entries of columns) {
      for (const entry of items(entries)) expect(entry.icon).toBeTruthy()
    }
  })
})
