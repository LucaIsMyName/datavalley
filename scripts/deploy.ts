import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { productionMediaRoot, releasePaths, releaseStamp } from './release-layout.ts'

const deployOnly = [
  'SSH_HOST',
  'SSH_USER',
  'SSH_PORT',
  'SSH_KEY_PATH',
  'DOMAIN',
  'DEPLOY_PATH',
  'APP_USER',
]

function parseEnvFile(text: string) {
  const values: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

function formatEnv(values: Record<string, string>) {
  return (
    Object.entries(values)
      .map(([key, value]) => {
        if (/^[A-Za-z0-9_./:@-]*$/.test(value)) return `${key}=${value}`
        return `${key}="${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
      })
      .join('\n') + '\n'
  )
}

function bashQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function required(values: Record<string, string>, key: string, min = 1) {
  const value = values[key]?.trim() ?? ''
  if (value.length < min) {
    console.error(`${key} is required in the selected env file.`)
    process.exit(1)
  }
  return value
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const names = readdirSync('.')
  .filter(
    (name) => name.startsWith('.env.') && !name.endsWith('.example') && name !== '.env.development',
  )
  .sort()

if (names.length === 0) {
  console.error(
    'No deployment env files. Copy .env.production.example to a name such as .env.customer1 and fill it in.',
  )
  process.exit(1)
}
if (!stdin.isTTY) {
  console.error('npm run deploy asks which env file to use. Run it in a terminal.')
  process.exit(1)
}

console.log('Env files:')
names.forEach((name, index) => console.log(`  ${index + 1}) ${name}`))
const prompt = createInterface({ input: stdin, output: stdout })
const answer = (await prompt.question('Choose an env file by number: ')).trim()
prompt.close()
const index = Number(answer) - 1
if (!Number.isInteger(index) || index < 0 || index >= names.length) {
  console.error('Unknown choice.')
  process.exit(1)
}

const selected = parseEnvFile(readFileSync(names[index], 'utf8'))
const sshHost = required(selected, 'SSH_HOST')
const sshUser = required(selected, 'SSH_USER')
const sshPort = selected.SSH_PORT?.trim() || '22'
const sshKey = required(selected, 'SSH_KEY_PATH')
const domain = required(selected, 'DOMAIN')
const deployPath = selected.DEPLOY_PATH?.trim() || '/opt/datavalley'
const appUser = selected.APP_USER?.trim() || 'datavalley'
const apiPort = selected.API_PORT?.trim() || '3000'

if (!isAbsolute(sshKey) || !existsSync(sshKey)) {
  console.error('SSH_KEY_PATH must be an absolute path to a private key on this machine.')
  process.exit(1)
}
if (!/^postgres(ql)?:\/\//.test(selected.DATABASE_URL?.trim() ?? '')) {
  console.error(
    'DATABASE_URL must be a postgres:// URL. Embedded pglite is not used in production.',
  )
  process.exit(1)
}
for (const key of ['SESSION_SECRET', 'CSRF_SECRET', 'CREDENTIALS_KEY']) required(selected, key, 32)
for (const key of ['INITIAL_ADMIN_EMAIL', 'INITIAL_ADMIN_USERNAME']) required(selected, key)
required(selected, 'INITIAL_ADMIN_PASSWORD', 12)
for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) required(selected, key)
required(selected, 'SMTP_PORT')
const origin = (selected.WEB_ORIGIN?.trim() || '').replace(/\/$/, '')
if (origin !== `https://${domain}`) {
  console.error(`WEB_ORIGIN must be https://${domain}`)
  process.exit(1)
}

const runtime: Record<string, string> = {}
for (const [key, value] of Object.entries(selected)) {
  if (!deployOnly.includes(key)) runtime[key] = value
}
runtime.TRUST_PROXY = 'true'
runtime.NODE_ENV = 'production'
runtime.WEB_ORIGIN = origin
runtime.API_HOST = runtime.API_HOST?.trim() || '127.0.0.1'
runtime.API_PORT = apiPort
runtime.MEDIA_ROOT = productionMediaRoot(deployPath, runtime.MEDIA_ROOT)

for (const command of ['ssh', 'scp', 'rsync']) {
  if (spawnSync('bash', ['-lc', `command -v ${command}`], { stdio: 'ignore' }).status !== 0) {
    console.error(`Missing ${command}. Install it before deploying.`)
    process.exit(1)
  }
}

const stamp = releaseStamp(new Date())
const paths = releasePaths(deployPath, stamp)
const sshBase = [
  '-i',
  sshKey,
  '-p',
  sshPort,
  '-o',
  'BatchMode=yes',
  '-o',
  'StrictHostKeyChecking=accept-new',
]
const target = `${sshUser}@${sshHost}`
const quotedPath = bashQuote(paths.root)
const quotedRelease = bashQuote(paths.release)
const quotedShared = bashQuote(paths.shared)
const quotedEnv = bashQuote(paths.envFile)
const prepare = [
  `mkdir -p ${quotedRelease} ${quotedShared}`,
  `chown ${bashQuote(sshUser)} ${quotedRelease} ${quotedShared}`,
  `if [ -f ${quotedEnv} ]; then chown ${bashQuote(sshUser)} ${quotedEnv}; fi`,
].join(' && ')
const remotePrepare = sshUser === 'root' ? prepare : `sudo -n bash -c ${bashQuote(prepare)}`
run('ssh', [...sshBase, target, remotePrepare])

run('rsync', [
  '-az',
  '--delete',
  '--exclude',
  'node_modules',
  '--exclude',
  'data',
  '--exclude',
  '.git',
  '--exclude',
  '.env',
  '--exclude',
  '.env.*',
  '--exclude',
  'coverage',
  '--exclude',
  'playwright-report',
  '--exclude',
  'test-results',
  '--exclude',
  'apps/web/dist',
  '-e',
  `ssh -i ${bashQuote(sshKey)} -p ${bashQuote(sshPort)} -o BatchMode=yes -o StrictHostKeyChecking=accept-new`,
  './',
  `${target}:${paths.release}/`,
])

const directory = mkdtempSync(join(tmpdir(), 'datavalley-env-'))
const envFile = join(directory, 'env')
writeFileSync(envFile, formatEnv(runtime), { mode: 0o600 })
run('scp', [
  '-i',
  sshKey,
  '-P',
  sshPort,
  '-o',
  'BatchMode=yes',
  '-o',
  'StrictHostKeyChecking=accept-new',
  envFile,
  `${target}:${paths.envFile}`,
])

const installEnv = `DEPLOY_PATH=${quotedPath} RELEASE_STAMP=${bashQuote(stamp)} APP_USER=${bashQuote(appUser)} DOMAIN=${bashQuote(domain)} API_PORT=${bashQuote(apiPort)}`
const install = `${installEnv} bash ${quotedRelease}/scripts/remote-install.sh`
const remoteInstall =
  sshUser === 'root'
    ? install
    : `sudo -n env ${installEnv} bash ${quotedRelease}/scripts/remote-install.sh`
run('ssh', [...sshBase, target, remoteInstall])
