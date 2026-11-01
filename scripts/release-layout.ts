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
