import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { describe, expect, it } from 'vitest'

describe('plugin host', () => {
  it('strips application secrets before loading an untrusted plugin', async () => {
    const child = spawn(process.execPath, ['--experimental-strip-types', 'apps/worker/src/plugin-host.ts', `${process.cwd()}/examples/untrusted-plugin/index.js`], {
      env: {
        ...process.env,
        DATABASE_URL: 'postgres://secret',
        SESSION_SECRET: 'session-secret-value',
        PLUGIN_TOKEN: 'scoped-token',
      },
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += String(chunk)
    })
    const [code] = (await once(child, 'exit')) as [number]
    expect(code).toBe(0)
    const result = JSON.parse(output) as { sawSecrets: string[] }
    expect(result.sawSecrets).toEqual([])
  })
})
