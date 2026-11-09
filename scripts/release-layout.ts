export function releaseStamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('')
}

export function releasePaths(deployPath: string, stamp: string) {
  const root = deployPath.replace(/\/$/, '')
  return {
    root,
    release: `${root}/releases/${stamp}`,
    shared: `${root}/shared`,
    envFile: `${root}/shared/.env`,
    media: `${root}/shared/data/media`,
    current: `${root}/current`,
  }
}

export function remoteCopyToolsShell() {
  return 'if ! command -v ssh >/dev/null 2>&1 || ! command -v scp >/dev/null 2>&1 || ! command -v rsync >/dev/null 2>&1; then export DEBIAN_FRONTEND=noninteractive; apt-get update; apt-get install -y openssh-client rsync; fi'
}

export function productionMediaRoot(deployPath: string, mediaRoot: string | undefined) {
  const media = mediaRoot?.trim() || './data/media'
  if (media.startsWith('/')) return media
  const root = deployPath.replace(/\/$/, '')
  return `${root}/shared/${media.replace(/^\.\//, '')}`
}

export const dockerMediaRoot = '/var/lib/datavalley/media'

const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function isLoopbackUrl(url: string) {
  return loopbackHosts.has(new URL(url).hostname)
}

export function rewriteLoopbackHost(url: string, hostname: string) {
  const parsed = new URL(url)
  if (!loopbackHosts.has(parsed.hostname)) return url
  parsed.hostname = hostname
  return parsed.toString()
}

function decodeUrlComponent(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function postgresIdentity(url: string) {
  const parsed = new URL(url)
  const database = decodeUrlComponent(parsed.pathname.replace(/^\//, '').split('/')[0] ?? '')
  return {
    user: decodeUrlComponent(parsed.username),
    password: decodeUrlComponent(parsed.password),
    database,
  }
}

export function redisPassword(url: string) {
  return decodeUrlComponent(new URL(url).password)
}
