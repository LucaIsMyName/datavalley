export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

export type NoteBlockType =
  | 'paragraph'
  | 'heading'
  | 'bullet'
  | 'numbered'
  | 'todo'
  | 'quote'
  | 'code'
  | 'divider'

export type NoteBlock = {
  id: string
  type: NoteBlockType
  text: string
  level?: HeadingLevel
  checked?: boolean
}

let blockId = 0
export function newBlockId() {
  blockId += 1
  return `nb-${blockId}`
}

export function emptyParagraphBlock(): NoteBlock {
  return { id: newBlockId(), type: 'paragraph', text: '' }
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const BULLET_RE = /^-\s+(.*)$/
const TODO_RE = /^-\s+\[( |x|X)\]\s+(.*)$/
const NUMBERED_RE = /^\d+\.\s+(.*)$/
const QUOTE_RE = /^>\s?(.*)$/
const DIVIDER_RE = /^---\s*$/

export function parseNotes(markdown: string): NoteBlock[] {
  const trimmed = markdown.trimEnd()
  if (!trimmed) return [emptyParagraphBlock()]

  const lines = trimmed.split('\n')
  const blocks: NoteBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (line.trim() === '```') {
      index += 1
      const codeLines: string[] = []
      while (index < lines.length && lines[index].trim() !== '```') {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ id: newBlockId(), type: 'code', text: codeLines.join('\n') })
      continue
    }

    if (DIVIDER_RE.test(line.trim())) {
      blocks.push({ id: newBlockId(), type: 'divider', text: '' })
      index += 1
      continue
    }

    const heading = HEADING_RE.exec(line)
    if (heading) {
      const level = Math.min(6, heading[1].length) as HeadingLevel
      blocks.push({ id: newBlockId(), type: 'heading', level, text: heading[2] })
      index += 1
      continue
    }

    const todo = TODO_RE.exec(line)
    if (todo) {
      blocks.push({
        id: newBlockId(),
        type: 'todo',
        checked: todo[1].toLowerCase() === 'x',
        text: todo[2],
      })
      index += 1
      continue
    }

    const bullet = BULLET_RE.exec(line)
    if (bullet && !TODO_RE.test(line)) {
      blocks.push({ id: newBlockId(), type: 'bullet', text: bullet[1] })
      index += 1
      continue
    }

    const numbered = NUMBERED_RE.exec(line)
    if (numbered) {
      blocks.push({ id: newBlockId(), type: 'numbered', text: numbered[1] })
      index += 1
      continue
    }

    const quote = QUOTE_RE.exec(line)
    if (quote) {
      blocks.push({ id: newBlockId(), type: 'quote', text: quote[1] })
      index += 1
      continue
    }

    if (line.trim() === '') {
      index += 1
      continue
    }

    const paraLines = [line]
    index += 1
    while (index < lines.length) {
      const next = lines[index]
      if (
        next.trim() === '' ||
        HEADING_RE.test(next) ||
        TODO_RE.test(next) ||
        (BULLET_RE.test(next) && !TODO_RE.test(next)) ||
        NUMBERED_RE.test(next) ||
        QUOTE_RE.test(next) ||
        DIVIDER_RE.test(next.trim()) ||
        next.trim() === '```'
      ) {
        break
      }
      paraLines.push(next)
      index += 1
    }
    blocks.push({ id: newBlockId(), type: 'paragraph', text: paraLines.join('\n') })
  }

  return blocks.length > 0 ? blocks : [emptyParagraphBlock()]
}

export function serializeBlock(block: NoteBlock): string {
  switch (block.type) {
    case 'heading': {
      const level = block.level ?? 1
      return `${'#'.repeat(level)} ${block.text}`
    }
    case 'bullet':
      return `- ${block.text}`
    case 'numbered':
      return `1. ${block.text}`
    case 'todo':
      return `- [${block.checked ? 'x' : ' '}] ${block.text}`
    case 'quote':
      return block.text
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    case 'code':
      return `\`\`\`\n${block.text}\n\`\`\``
    case 'divider':
      return '---'
    case 'paragraph':
    default:
      return block.text
  }
}

export function serializeNotes(blocks: NoteBlock[]): string {
  return blocks.map(serializeBlock).join('\n\n')
}

export type TurnIntoType = NoteBlockType | `heading-${HeadingLevel}`

export function turnBlockInto(block: NoteBlock, target: TurnIntoType): NoteBlock {
  if (target === 'divider') {
    return { id: block.id, type: 'divider', text: '' }
  }
  if (target.startsWith('heading-')) {
    const level = Number(target.slice(8)) as HeadingLevel
    return { id: block.id, type: 'heading', level, text: block.text }
  }
  if (target === 'todo') {
    return { id: block.id, type: 'todo', checked: false, text: block.text }
  }
  if (target === 'heading') {
    return { id: block.id, type: 'heading', level: 1, text: block.text }
  }
  const type = target as NoteBlockType
  return { id: block.id, type, text: block.text }
}

export function insertBlock(blocks: NoteBlock[], index: number, block: NoteBlock = emptyParagraphBlock()): NoteBlock[] {
  const next = [...blocks]
  next.splice(Math.max(0, Math.min(index, next.length)), 0, block)
  return next
}

export function removeBlock(blocks: NoteBlock[], id: string): NoteBlock[] {
  const next = blocks.filter((block) => block.id !== id)
  return next.length > 0 ? next : [emptyParagraphBlock()]
}

export function updateBlockText(blocks: NoteBlock[], id: string, text: string): NoteBlock[] {
  return blocks.map((block) => (block.id === id ? { ...block, text } : block))
}

export function updateBlock(blocks: NoteBlock[], id: string, patch: Partial<NoteBlock>): NoteBlock[] {
  return blocks.map((item) => (item.id === id ? { ...item, ...patch, id: item.id } : item))
}

export function nextBlockType(current: NoteBlockType): NoteBlockType {
  if (current === 'bullet' || current === 'numbered' || current === 'todo') return current
  return 'paragraph'
}

export type ShortcutResult = { block: NoteBlock; consumed: boolean }

/** Apply block-level markdown shortcuts when the user types at the start of a line. */
export function applyBlockShortcut(block: NoteBlock, rawText: string): ShortcutResult {
  if (block.type === 'code' || block.type === 'divider') {
    return { block: { ...block, text: rawText }, consumed: false }
  }

  const trimmed = rawText.trimEnd()
  if (DIVIDER_RE.test(trimmed) && trimmed === rawText.trim()) {
    return { block: { id: block.id, type: 'divider', text: '' }, consumed: true }
  }

  if (trimmed === '```' || rawText.startsWith('```\n')) {
    const body = rawText.startsWith('```\n') ? rawText.slice(4) : ''
    return { block: { id: block.id, type: 'code', text: body }, consumed: true }
  }

  const headingMatch = rawText.match(/^(#{1,6})\s+(.*)$/)
  if (headingMatch && rawText.length >= headingMatch[1].length + 1 && rawText[headingMatch[1].length] === ' ') {
    const level = Math.min(6, headingMatch[1].length) as HeadingLevel
    return {
      block: { id: block.id, type: 'heading', level, text: headingMatch[2] },
      consumed: true,
    }
  }

  const todoMatch = rawText.match(/^-\s+\[( |x|X)\]\s+(.*)$/)
  if (todoMatch) {
    return {
      block: {
        id: block.id,
        type: 'todo',
        checked: todoMatch[1].toLowerCase() === 'x',
        text: todoMatch[2],
      },
      consumed: true,
    }
  }

  if (rawText.match(/^-\s+\[( |x|X)\]\s$/) || rawText === '- [ ] ' || rawText === '- [x] ') {
    return {
      block: { id: block.id, type: 'todo', checked: rawText.includes('[x]') || rawText.includes('[X]'), text: '' },
      consumed: true,
    }
  }

  if (rawText.match(/^-\s$/) || (rawText.startsWith('- ') && !rawText.startsWith('- ['))) {
    const rest = rawText.startsWith('- ') ? rawText.slice(2) : ''
    if (rawText === '- ' || rawText.startsWith('- ')) {
      return { block: { id: block.id, type: 'bullet', text: rest }, consumed: rawText === '- ' || rest.length > 0 }
    }
  }

  const bulletOnly = rawText.match(/^-\s+(.*)$/)
  if (bulletOnly && !rawText.startsWith('- [')) {
    return { block: { id: block.id, type: 'bullet', text: bulletOnly[1] }, consumed: true }
  }

  const numberedMatch = rawText.match(/^\d+\.\s+(.*)$/)
  if (numberedMatch) {
    return { block: { id: block.id, type: 'numbered', text: numberedMatch[1] }, consumed: true }
  }
  if (/^\d+\.\s$/.test(rawText)) {
    return { block: { id: block.id, type: 'numbered', text: '' }, consumed: true }
  }

  const quoteMatch = rawText.match(/^>\s?(.*)$/)
  if (quoteMatch && (rawText.startsWith('> ') || rawText === '>')) {
    return { block: { id: block.id, type: 'quote', text: quoteMatch[1] ?? '' }, consumed: rawText.startsWith('> ') }
  }

  return { block: { ...block, text: rawText }, consumed: false }
}

/** Detect shortcut while typing (e.g. user just typed trailing space after `#`). */
export function applyBlockShortcutOnInput(block: NoteBlock, text: string): ShortcutResult {
  if (text.endsWith(' ')) {
    const withoutTrail = text.slice(0, -1)
    if (/^#{1,6}$/.test(withoutTrail)) {
      const level = withoutTrail.length as HeadingLevel
      return { block: { id: block.id, type: 'heading', level, text: '' }, consumed: true }
    }
    if (withoutTrail === '-') {
      return { block: { id: block.id, type: 'bullet', text: '' }, consumed: true }
    }
    if (/^\d+$/.test(withoutTrail)) {
      return { block: { id: block.id, type: 'numbered', text: '' }, consumed: true }
    }
    if (withoutTrail === '>') {
      return { block: { id: block.id, type: 'quote', text: '' }, consumed: true }
    }
    if (withoutTrail === '- [ ]' || withoutTrail === '- [x]') {
      return {
        block: { id: block.id, type: 'todo', checked: withoutTrail.includes('x'), text: '' },
        consumed: true,
      }
    }
    if (withoutTrail === '---') {
      return { block: { id: block.id, type: 'divider', text: '' }, consumed: true }
    }
  }

  const full = applyBlockShortcut(block, text)
  if (full.consumed) return full
  return { block: { ...block, text }, consumed: false }
}

export type InlinePart =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'link'; label: string; href: string }

export function parseInlineMarkdown(text: string): InlinePart[] {
  const parts: InlinePart[] = []
  let rest = text
  const pattern =
    /(\*\*(.+?)\*\*)|(\*(?!\*)(.+?)\*(?!\*))|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g

  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: 'text', value: text.slice(lastIndex, match.index) })
    }
    if (match[2] != null) parts.push({ kind: 'bold', value: match[2] })
    else if (match[4] != null) parts.push({ kind: 'italic', value: match[4] })
    else if (match[6] != null) parts.push({ kind: 'code', value: match[6] })
    else if (match[8] != null && match[9] != null) parts.push({ kind: 'link', label: match[8], href: match[9] })
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < text.length) {
    parts.push({ kind: 'text', value: text.slice(lastIndex) })
  }
  if (parts.length === 0) parts.push({ kind: 'text', value: text })
  return parts
}
