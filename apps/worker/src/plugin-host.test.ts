import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { describe, expect, it } from 'vitest'

function hostArgs(script: string, pluginPath: string) {
  const [major, minor] = process.versions.node.split('.').map(Number)
  const stripsByDefault = major > 23 || (major === 23 && minor >= 6) || (major === 22 && minor >= 18)
  if (stripsByDefault) return [script, pluginPath]
  const hasStripFlag = (major === 22 && minor >= 6) || (major === 23 && minor < 6)
  if (hasStripFlag) return ['--experimental-strip-types', script, pluginPath]
  return ['--import', 'tsx', script, pluginPath]
}

describe('plugin host', () => {
  it('strips application secrets before loading an untrusted plugin', async () => {
    const child = spawn(
      process.execPath,
      hostArgs('apps/worker/src/plugin-host.ts', `${process.cwd()}/examples/untrusted-plugin/index.js`),
      {
        env: {
          ...process.env,
          DATABASE_URL: 'postgres://secret',
          SESSION_SECRET: 'session-secret-value',
          PLUGIN_TOKEN: 'scoped-token',
        },
      },
    )
    let output = ''
    let errors = ''
    child.stdout.on('data', (chunk) => {
      output += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      errors += String(chunk)
    })
    const [code] = (await once(child, 'exit')) as [number]
    expect(code, errors).toBe(0)
    const result = JSON.parse(output) as { sawSecrets: string[] }
    expect(result.sawSecrets).toEqual([])
  })
})
