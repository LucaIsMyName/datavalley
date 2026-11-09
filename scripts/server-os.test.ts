import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const helper = fileURLToPath(new URL('./server-os.sh', import.meta.url))

function writeOsRelease(contents: string) {
  const directory = mkdtempSync(join(tmpdir(), 'datavalley-os-'))
  const file = join(directory, 'os-release')
  writeFileSync(file, contents)
  return file
}

function assertServerOs(osReleasePath: string) {
  return spawnSync('bash', ['-c', 'source "$1" && assert_supported_server_os "$2"', 'bash', helper, osReleasePath], {
    encoding: 'utf8',
  })
}

describe('server os', () => {
  it('accepts Ubuntu and Debian, including quoted ids', () => {
    for (const contents of ['ID=ubuntu\n', 'ID="ubuntu"\n', 'ID=debian\n', 'ID="Debian"\n']) {
      const result = assertServerOs(writeOsRelease(contents))
      expect(result.status, contents).toBe(0)
    }
  })

  it('rejects a missing or unsupported os-release', () => {
    const missing = assertServerOs(join(tmpdir(), 'datavalley-os-missing', 'os-release'))
    expect(missing.status).not.toBe(0)
    expect(missing.stderr).toContain('Ubuntu or Debian')

    const fedora = assertServerOs(writeOsRelease('ID=fedora\n'))
    expect(fedora.status).not.toBe(0)
    expect(fedora.stderr).toContain('Ubuntu or Debian')
  })
})