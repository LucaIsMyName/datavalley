import { describe, expect, it } from 'vitest'
import {
  applyBlockShortcutOnInput,
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
