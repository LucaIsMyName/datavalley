import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const backup = fileURLToPath(new URL('./backup.sh', import.meta.url))
const restore = fileURLToPath(new URL('./restore.sh', import.meta.url))

/** Stand-ins for pg_dump and pg_restore so the scripts run without a database. */
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'datavalley-backup-'))
  const bin = join(root, 'bin')
  const media = join(root, 'media')
  mkdirSync(bin)
  mkdirSync(media)
  writeFileSync(join(media, 'logo.png'), 'image-bytes')
  writeFileSync(
    join(bin, 'pg_dump'),
    '#!/usr/bin/env bash\nfor arg in "$@"; do case "$arg" in --file=*) printf "dump-bytes" > "${arg#--file=}";; esac; done\n',
  )
  writeFileSync(
    join(bin, 'pg_restore'),
    '#!/usr/bin/env bash\nif [[ "$1" == "--list" ]]; then grep -q dump-bytes "$2"; exit; fi\ncp "${@: -1}" "$RESTORED"\n',
  )
  chmodSync(join(bin, 'pg_dump'), 0o755)
  chmodSync(join(bin, 'pg_restore'), 0o755)
  return { root, media, out: join(root, 'backups'), restored: join(root, 'restored.dump'), bin }
}

function run(script: string, args: string[], dir: ReturnType<typeof workspace>, env: Record<string, string> = {}) {
  return spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir.bin}:${process.env.PATH ?? ''}`,
      DATABASE_URL: 'postgres://example/datavalley',
      MEDIA_ROOT: dir.media,
      RESTORED: dir.restored,
      ...env,
    },
  })
}

describe('backup and restore scripts', () => {
  it('encrypts a backup and restores it with the same passphrase', () => {
    const dir = workspace()
    const written = run(backup, [dir.out], dir, { BACKUP_PASSPHRASE: 'correct horse battery staple' })
    expect(written.status, written.stderr).toBe(0)
    const files = readdirSync(dir.out).sort()
    expect(files).toHaveLength(2)
    expect(files.every((file) => file.endsWith('.enc'))).toBe(true)
    const dump = join(dir.out, files.find((file) => file.startsWith('datavalley-')) ?? '')
    expect(readFileSync(dump, 'utf8')).not.toContain('dump-bytes')

    const missing = run(restore, [dump], dir)
    expect(missing.status).not.toBe(0)
    expect(missing.stderr).toContain('BACKUP_PASSPHRASE is required')

    const restored = run(restore, [dump], dir, { BACKUP_PASSPHRASE: 'correct horse battery staple' })
    expect(restored.status, restored.stderr).toBe(0)
    expect(readFileSync(dir.restored, 'utf8')).toBe('dump-bytes')
  })

  it('fails when the dump cannot be read back', () => {
    const dir = workspace()
    writeFileSync(join(dir.bin, 'pg_dump'), '#!/usr/bin/env bash\nfor arg in "$@"; do case "$arg" in --file=*) printf "broken" > "${arg#--file=}";; esac; done\n')
    const written = run(backup, [dir.out], dir)
    expect(written.status).not.toBe(0)
    expect(written.stderr).toContain('cannot be read back')
  })

  it('removes backups older than BACKUP_KEEP_DAYS and rejects a bad value', () => {
    const dir = workspace()
    mkdirSync(dir.out)
    const old = join(dir.out, 'datavalley-20200101T000000Z.dump')
    const unrelated = join(dir.out, 'notes.txt')
    writeFileSync(old, 'old')
    writeFileSync(unrelated, 'keep')
    const longAgo = new Date('2020-01-01T00:00:00Z')
    utimesSync(old, longAgo, longAgo)
    utimesSync(unrelated, longAgo, longAgo)

    expect(run(backup, [dir.out], dir, { BACKUP_KEEP_DAYS: 'soon' }).status).not.toBe(0)
    const written = run(backup, [dir.out], dir, { BACKUP_KEEP_DAYS: '14' })
    expect(written.status, written.stderr).toBe(0)
    expect(existsSync(old)).toBe(false)
    expect(existsSync(unrelated)).toBe(true)
    expect(readdirSync(dir.out).filter((file) => file.startsWith('datavalley-'))).toHaveLength(1)
  })
})
