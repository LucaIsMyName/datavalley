import {
  BUILTIN_FUNCTIONS,
  LIMITS,
  astDepth,
  type AstNode,
  type FormulaBinding,
  type FormulaDeclaration,
  type FormulaFunction,
  type FormulaParam,
  type RefNode,
} from './ast.js'

type Token =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'ident'; value: string }
  | { type: 'var'; name: string }
  | { type: 'ref'; ref: RefNode }
  | { type: 'op'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'lbrace' }
  | { type: 'rbrace' }
  | { type: 'comma' }
  | { type: 'colon' }
  | { type: 'semi' }
  | { type: 'eof' }

const RESERVED = new Set(['VAR', 'FUNCTION', 'RETURN', 'TRUE', 'FALSE', 'IT', 'AND', 'OR', 'NOT'])

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

export class FormulaSyntaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormulaSyntaxError'
  }
}

export class FormulaLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormulaLimitError'
  }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const pushOp = (value: string) => tokens.push({ type: 'op', value })
  while (i < input.length) {
    const char = input[i]
    if (char === ' ' || char === '\n' || char === '\t' || char === '\r') {
      i++
      continue
    }
    if (char === '(') {
      tokens.push({ type: 'lparen' })
      i++
      continue
    }
    if (char === ')') {
      tokens.push({ type: 'rparen' })
      i++
      continue
    }
    if (char === ',') {
      tokens.push({ type: 'comma' })
      i++
      continue
    }
    if (char === ':') {
      tokens.push({ type: 'colon' })
      i++
      continue
    }
    if (char === ';') {
      tokens.push({ type: 'semi' })
      i++
      continue
    }
    if (char === '}') {
      tokens.push({ type: 'rbrace' })
      i++
      continue
    }
    if (char === '$') {
      const match = input.slice(i + 1).match(/^[A-Za-z_][A-Za-z0-9_]*/)
      if (!match || match[0] === '_') throw new FormulaSyntaxError('Invalid variable')
      tokens.push({ type: 'var', name: match[0] })
      i += 1 + match[0].length
      continue
    }
    if (char === '{') {
      const match = input.slice(i).match(new RegExp(`^\\{(${UUID})\\}(?:\\.\\{(${UUID})\\})?(?:@\\{(${UUID})\\})?`))
      if (!match) {
        tokens.push({ type: 'lbrace' })
        i++
        continue
      }
      const tableOrColumn = match[1]
      const second = match[2]
      const rowId = match[3]
      const ref: RefNode = second
        ? { tableId: tableOrColumn, columnId: second, rowId }
        : { columnId: tableOrColumn, rowId }
      tokens.push({ type: 'ref', ref })
      i += match[0].length
      continue
    }
    if (char === '"') {
      let value = ''
      i++
      while (i < input.length) {
        if (input[i] === '"') {
          if (input[i + 1] === '"') {
            value += '"'
            i += 2
            continue
          }
          i++
          break
        }
        if (input[i] === '\\' && input[i + 1] === '"') {
          value += '"'
          i += 2
          continue
        }
        value += input[i]
        i++
      }
      tokens.push({ type: 'string', value })
      continue
    }
    if (/[0-9.]/.test(char)) {
      const match = input.slice(i).match(/^\d+(\.\d+)?/)
      if (!match) throw new FormulaSyntaxError('Invalid number')
      tokens.push({ type: 'number', value: Number(match[0]) })
      i += match[0].length
      continue
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = input.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)!
      tokens.push({ type: 'ident', value: match[0] })
      i += match[0].length
      continue
    }
    const two = input.slice(i, i + 2)
    if (['<>', '<=', '>='].includes(two)) {
      pushOp(two)
      i += 2
      continue
    }
    if ('+-*/%=&<>'.includes(char)) {
      pushOp(char)
      i++
      continue
    }
    throw new FormulaSyntaxError(`Unexpected character ${char}`)
  }
  tokens.push({ type: 'eof' })
  return tokens
}

class Parser {
  private index = 0
  private vars: string[] = []
  private localVars: string[] = []
  private params: string[] = []
  private functions: string[] = []
  constructor(private tokens: Token[]) {}

  parse(): AstNode {
    const declarations: FormulaDeclaration[] = []
    while (this.isIdent('VAR') || this.isIdent('FUNCTION')) {
      if (this.isIdent('VAR')) declarations.push({ kind: 'var', binding: this.parseVar() })
      else declarations.push({ kind: 'function', fn: this.parseFunction() })
    }
    const body = this.parseOr()
    this.expect('eof')
    if (declarations.length === 0) return body
    return { type: 'program', declarations, body }
  }

  private peek(): Token {
    return this.tokens[this.index] ?? { type: 'eof' }
  }

  private eat(): Token {
    const token = this.peek()
    this.index++
    return token
  }

  private expect(type: Token['type']): Token {
    const token = this.peek()
    if (token.type !== type) throw new FormulaSyntaxError(`Expected ${type}`)
    return this.eat()
  }

  private parseOr(): AstNode {
    let left = this.parseAnd()
    while (this.isIdent('OR')) {
      this.eat()
      left = { type: 'binary', op: 'OR', left, right: this.parseAnd() }
    }
    return left
  }

  private parseAnd(): AstNode {
    let left = this.parseNot()
    while (this.isIdent('AND')) {
      this.eat()
      left = { type: 'binary', op: 'AND', left, right: this.parseNot() }
    }
    return left
  }

  private parseNot(): AstNode {
    if (this.isIdent('NOT') && this.tokens[this.index + 1]?.type !== 'lparen') {
      this.eat()
      return { type: 'unary', op: 'NOT', expr: this.parseNot() }
    }
    return this.parseComparison()
  }

  private parseComparison(): AstNode {
    let left = this.parseConcat()
    const ops = new Set(['=', '<>', '>', '<', '>=', '<='])
    while (this.peek().type === 'op' && ops.has((this.peek() as { value: string }).value)) {
      const op = (this.eat() as { value: string }).value
      left = { type: 'binary', op, left, right: this.parseConcat() }
    }
    return left
  }

  private parseConcat(): AstNode {
    let left = this.parseTerm()
    while (this.peek().type === 'op' && (this.peek() as { value: string }).value === '&') {
      this.eat()
      left = { type: 'binary', op: '&', left, right: this.parseTerm() }
    }
    return left
  }

  private parseTerm(): AstNode {
    let left = this.parseFactor()
    while (this.peek().type === 'op' && ['+', '-'].includes((this.peek() as { value: string }).value)) {
      const op = (this.eat() as { value: string }).value
      left = { type: 'binary', op, left, right: this.parseFactor() }
    }
    return left
  }

  private parseFactor(): AstNode {
    let left = this.parseUnary()
    while (this.peek().type === 'op' && ['*', '/', '%'].includes((this.peek() as { value: string }).value)) {
      const op = (this.eat() as { value: string }).value
      left = { type: 'binary', op, left, right: this.parseUnary() }
    }
    return left
  }

  private parseUnary(): AstNode {
    if (this.peek().type === 'op' && (this.peek() as { value: string }).value === '-') {
      this.eat()
      return { type: 'unary', op: '-', expr: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parseVar(): FormulaBinding {
    this.eat()
    const name = this.bindingName()
    if (this.params.includes(name)) throw new FormulaSyntaxError(`Duplicate name ${name}`)
    if (this.localVars.includes(name)) throw new FormulaSyntaxError(`Duplicate variable ${name}`)
    this.expectOp('=')
    const expr = this.parseOr()
    if (this.peek().type !== 'semi') throw new FormulaSyntaxError('Expected ;')
    this.eat()
    this.vars.push(name)
    this.localVars.push(name)
    return { name, expr }
  }

  private parseFunction(): FormulaFunction {
    this.eat()
    const token = this.expectIdent()
    if (!/^[A-Z][A-Z0-9_]*$/.test(token.value)) throw new FormulaSyntaxError('Function names are uppercase')
    if (BUILTIN_FUNCTIONS.has(token.value) || RESERVED.has(token.value)) {
      throw new FormulaSyntaxError(`Reserved name ${token.value}`)
    }
    if (this.functions.includes(token.value)) throw new FormulaSyntaxError(`Duplicate function ${token.value}`)
    this.functions.push(token.value)
    this.expect('lparen')
    const params = this.parseParams()
    this.expect('rparen')
    this.expectOp('=')
    this.expect('lbrace')
    const savedVars = this.vars
    const savedParams = this.params
    const savedLocals = this.localVars
    this.vars = [...savedVars]
    this.localVars = []
    this.params = params.map((param) => param.name)
    const locals: FormulaBinding[] = []
    while (this.isIdent('VAR')) locals.push(this.parseVar())
    if (!this.isIdent('RETURN')) throw new FormulaSyntaxError('Expected RETURN')
    this.eat()
    const body = this.parseOr()
    this.expect('rbrace')
    this.vars = savedVars
    this.params = savedParams
    this.localVars = savedLocals
    return { name: token.value, params, locals, body }
  }

  private parseParams(): FormulaParam[] {
    const params: FormulaParam[] = []
    if (this.peek().type === 'rparen') return params
    params.push(this.parseParam(params))
    while (this.peek().type === 'comma') {
      this.eat()
      params.push(this.parseParam(params))
    }
    return params
  }

  private parseParam(soFar: FormulaParam[]): FormulaParam {
    const name = this.bindingName()
    if (soFar.some((param) => param.name === name)) throw new FormulaSyntaxError(`Duplicate parameter ${name}`)
    if (!this.isOp('=')) return { name }
    this.eat()
    return { name, fallback: this.parseOr() }
  }

  private bindingName(): string {
    const token = this.expectIdent()
    if (token.value === '_' || RESERVED.has(token.value.toUpperCase())) {
      throw new FormulaSyntaxError(`Reserved name ${token.value}`)
    }
    return token.value
  }

  private expectIdent(): { type: 'ident'; value: string } {
    const token = this.peek()
    if (token.type !== 'ident') throw new FormulaSyntaxError('Expected name')
    this.eat()
    return token
  }

  private expectOp(value: string) {
    if (!this.isOp(value)) throw new FormulaSyntaxError(`Expected ${value}`)
    this.eat()
  }

  private isOp(value: string): boolean {
    const token = this.peek()
    return token.type === 'op' && token.value === value
  }

  private parsePrimary(): AstNode {
    const token = this.peek()
    if (token.type === 'number') {
      this.eat()
      return { type: 'number', value: token.value }
    }
    if (token.type === 'string') {
      this.eat()
      return { type: 'string', value: token.value }
    }
    if (token.type === 'var') {
      this.eat()
      if (this.params.includes(token.name)) return { type: 'param', name: token.name }
      if (!this.vars.includes(token.name)) throw new FormulaSyntaxError(`Unknown variable ${token.name}`)
      return { type: 'var', name: token.name }
    }
    if (token.type === 'ident') {
      const name = token.value.toUpperCase()
      const call = this.tokens[this.index + 1]?.type === 'lparen'
      if ((name === 'TRUE' || name === 'FALSE') && !call) {
        this.eat()
        return { type: 'bool', value: name === 'TRUE' }
      }
      if (name === 'IT' && !call) {
        this.eat()
        return { type: 'it' }
      }
      if (token.value === '_' && !call) {
        this.eat()
        return { type: 'omit' }
      }
      this.eat()
      if (this.peek().type === 'lparen') {
        this.eat()
        const args: AstNode[] = []
        if (this.peek().type !== 'rparen') {
          args.push(this.parseOr())
          while (this.peek().type === 'comma') {
            this.eat()
            args.push(this.parseOr())
          }
        }
        this.expect('rparen')
        return { type: 'call', name, args }
      }
      throw new FormulaSyntaxError(`Unknown identifier ${token.value}`)
    }
    if (token.type === 'ref') {
      this.eat()
      if (this.peek().type === 'colon') {
        this.eat()
        const end = this.peek()
        if (end.type !== 'ref') throw new FormulaSyntaxError('Range end must be a reference')
        this.eat()
        return { type: 'range', start: token.ref, end: end.ref }
      }
      return { type: 'ref', ref: token.ref }
    }
    if (token.type === 'lparen') {
      this.eat()
      const expr = this.parseOr()
      this.expect('rparen')
      return expr
    }
    throw new FormulaSyntaxError('Unexpected token')
  }

  private isIdent(value: string): boolean {
    const token = this.peek()
    return token.type === 'ident' && token.value.toUpperCase() === value
  }
}

export function parseFormula(input: string): AstNode {
  const source = input.trim().replace(/^=/, '')
  if (source.length > LIMITS.maxLength) throw new FormulaLimitError('Formula is too long')
  const ast = new Parser(tokenize(source)).parse()
  if (astDepth(ast) > LIMITS.maxDepth) throw new FormulaLimitError('Formula is too deep')
  return ast
}
