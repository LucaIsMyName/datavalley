import { DollarSign, EyeOff, Palette, Pencil, Trash2, Type } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { isMenuAccordion, type MenuEntry, type MenuItem } from '../../components/context-menu.js'
import { buildColumnHeaderMenu } from './column-menu.js'

function menuFor(
  column: { type: string; config?: Record<string, unknown> },
  checkedCount = 0,
  expandCurrency?: boolean,
) {
  return buildColumnHeaderMenu({
    column: { type: column.type, config: column.config ?? {} },
    checkedCount,
    expandCurrency,
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

function currencyAccordionItems(entries: MenuEntry[]) {
  const accordion = entries.find((entry) => isMenuAccordion(entry) && entry.id === 'currencyAccordion')
  return accordion && isMenuAccordion(accordion) ? accordion.items.map((item) => item.id) : []
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

  it('groups date format options under their own heading before actions', () => {
    const entries = menuFor({ type: 'date', config: { includeTime: true, range: true } })
    expect(headings(entries)).toEqual(['datatypes', 'dateOptions', 'actions', 'footer', 'conditions'])
    expect(idsBetween(entries, 'dateOptions', 'actions')).toEqual(['include-time-off', 'range-off'])
    expect(idsBetween(entries, 'datatypes', 'dateOptions').every((id) => !id.startsWith('include-time') && !id.startsWith('range-'))).toBe(true)
  })

  it('groups number variants under numberOptions and currencies in an accordion', () => {
    const floatCol = menuFor({ type: 'number', config: { variant: 'float' } })
    expect(headings(floatCol)).toEqual(['datatypes', 'numberOptions', 'actions', 'footer', 'conditions'])
    expect(idsBetween(floatCol, 'datatypes', 'numberOptions').every((id) => !id.startsWith('variant-'))).toBe(true)
    expect(idsBetween(floatCol, 'numberOptions', 'actions')).toEqual([
      'variant-float',
      'variant-integer',
      'variant-money',
    ])
    expect(currencyAccordionItems(floatCol)).toEqual([])

    const money = menuFor({ type: 'number', config: { variant: 'money', currency: 'EUR' } })
    expect(currencyAccordionItems(money)).toEqual([
      'currency-USD',
      'currency-EUR',
      'currency-GBP',
      'currency-CHF',
      'currency-JPY',
    ])
    const accordion = money.find((entry) => isMenuAccordion(entry) && entry.id === 'currencyAccordion')
    expect(accordion).toMatchObject({ label: 'menuCurrency' })
    expect(
      accordion && isMenuAccordion(accordion) ? accordion.items.find((item) => item.id === 'currency-EUR')?.disabled : false,
    ).toBe(true)
    expect(items(money).find((entry) => entry.id === 'variant-money')?.dismissMenu).toBe(false)
  })

  it('expands the currency accordion when expandCurrency is set', () => {
    const entries = menuFor({ type: 'number', config: { variant: 'money' } }, 0, true)
    const accordion = entries.find((entry) => isMenuAccordion(entry) && entry.id === 'currencyAccordion')
    expect(accordion && isMenuAccordion(accordion) ? accordion.expanded : false).toBe(true)
  })

  it('puts format options in data types and conditional color in conditions', () => {
    const money = menuFor({ type: 'number', config: { variant: 'money' } })
    expect(idsBetween(money, 'numberOptions', 'actions')).toContain('variant-money')
    expect(items(money).find((entry) => entry.id === 'variant-money')?.disabled).toBe(true)
    const accordion = money.find((entry) => isMenuAccordion(entry) && entry.id === 'currencyAccordion')
    expect(accordion && isMenuAccordion(accordion) ? accordion.items[0]?.icon : null).toBe(DollarSign)
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
      for (const entry of entries) {
        if (isMenuAccordion(entry)) {
          for (const item of entry.items) expect(item.icon).toBeTruthy()
        }
      }
    }
  })
})
