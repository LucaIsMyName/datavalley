import { tokenizeExample, type ExampleTokenType } from './api-example-tokens'

const tokenClass: Record<ExampleTokenType, string> = {
  keyword: 'font-semibold text-primary',
  string: 'text-primary',
  number: 'text-danger',
  punctuation: 'text-muted-foreground',
  text: '',
}

export function ApiExample({ code }: { code: string }) {
  return (
    <pre className="border border-border mt-1 overflow-x-auto bg-muted p-3 font-mono text-xs">
      {tokenizeExample(code).map((token, index) => (
        <span key={index} className={tokenClass[token.type] || undefined}>
          {token.text}
        </span>
      ))}
    </pre>
  )
}
