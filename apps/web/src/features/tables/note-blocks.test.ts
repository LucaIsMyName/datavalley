import { describe, expect, it } from 'vitest'
import {
  applyBlockShortcutOnInput,
  clampMenuPosition,
  enterFromBlock,
  insertBlock,
  parseInlineMarkdown,
  parseNotes,
  serializeNotes,
  turnBlockInto,
} from './note-blocks.js'

describe('parseNotes / serializeNotes', () => {
  it('round-trips headings and paragraphs', () => {
    const md = '# Title\n\nHello **world**'
    const blocks = parseNotes(md)
    expect(blocks.some((b) => b.type === 'heading' && b.level === 1 && b.text === 'Title')).toBe(true)
    expect(blocks.some((b) => b.type === 'paragraph' && b.text.includes('Hello'))).toBe(true)
    expect(serializeNotes(blocks)).toContain('# Title')
  })

  it('parses lists, todos, and dividers', () => {
    const md = '- item\n\n- [ ] task\n\n---'
    const blocks = parseNotes(md)
    expect(blocks.find((b) => b.type === 'bullet')?.text).toBe('item')
    expect(blocks.find((b) => b.type === 'todo')?.checked).toBe(false)
    expect(blocks.some((b) => b.type === 'divider')).toBe(true)
  })

  it('keeps unknown lines as paragraphs', () => {
    const blocks = parseNotes('plain line')
    expect(blocks[0]?.type).toBe('paragraph')
    expect(blocks[0]?.text).toBe('plain line')
  })
})

describe('applyBlockShortcutOnInput', () => {
  it('turns hash space into heading', () => {
    const block = { id: 'a', type: 'paragraph' as const, text: '# ' }
    const result = applyBlockShortcutOnInput(block, '# ')
    expect(result.consumed).toBe(true)
    expect(result.block.type).toBe('heading')
    expect(result.block.level).toBe(1)
  })

  it('turns double hash into h2', () => {
    const block = { id: 'a', type: 'paragraph' as const, text: '## ' }
    const result = applyBlockShortcutOnInput(block, '## ')
    expect(result.block.type).toBe('heading')
    expect(result.block.level).toBe(2)
  })
})

describe('enterFromBlock', () => {
  it('turns a blank list item into a paragraph', () => {
    for (const type of ['bullet', 'numbered', 'todo'] as const) {
      const result = enterFromBlock({ id: 'a', type, text: '   ' })
      expect(result.kind).toBe('replace')
      expect(result.block).toEqual({ id: 'a', type: 'paragraph', text: '' })
    }
  })

  it('inserts another item when the list line has text', () => {
    const bullet = enterFromBlock({ id: 'a', type: 'bullet', text: 'item' })
    expect(bullet.kind).toBe('insert')
    expect(bullet.block.type).toBe('bullet')
    expect(bullet.block.text).toBe('')
    const paragraph = enterFromBlock({ id: 'a', type: 'paragraph', text: 'hello' })
    expect(paragraph.kind).toBe('insert')
    expect(paragraph.block.type).toBe('paragraph')
  })
})

describe('clampMenuPosition', () => {
  it('moves a menu that would pass the bottom back into the viewport', () => {
    const placed = clampMenuPosition({
      x: 40,
      y: 560,
      width: 176,
      height: 470,
      viewportWidth: 800,
      viewportHeight: 600,
    })
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(600 - 8)
    expect(placed.top).toBeGreaterThanOrEqual(8)
    expect(placed.maxHeight).toBe(470)
  })

  it('caps a menu taller than the viewport', () => {
    const placed = clampMenuPosition({
      x: 40,
      y: 400,
      width: 176,
      height: 900,
      viewportWidth: 800,
      viewportHeight: 600,
    })
    expect(placed.maxHeight).toBe(600 - 16)
    expect(placed.top).toBe(8)
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(600 - 8)
  })
})

describe('insertBlock and turnBlockInto', () => {
  it('inserts at index', () => {
    const blocks = parseNotes('one')
    const next = insertBlock(blocks, 1, { id: 'x', type: 'paragraph', text: 'two' })
    expect(next).toHaveLength(2)
    expect(next[1]?.text).toBe('two')
  })

  it('turns paragraph into heading levels', () => {
    const block = { id: 'a', type: 'paragraph' as const, text: 'Hi' }
    const h3 = turnBlockInto(block, 'heading-3')
    expect(h3.type).toBe('heading')
    expect(h3.level).toBe(3)
  })
})

describe('parseInlineMarkdown', () => {
  it('splits bold and links', () => {
    const parts = parseInlineMarkdown('**bold** and [x](https://a.test)')
    expect(parts.some((p) => p.kind === 'bold' && p.value === 'bold')).toBe(true)
    expect(parts.some((p) => p.kind === 'link' && p.label === 'x')).toBe(true)
  })
})
