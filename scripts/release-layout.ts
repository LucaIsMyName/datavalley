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

export function productionMediaRoot(deployPath: string, mediaRoot: string | undefined) {
  const media = mediaRoot?.trim() || './data/media'
  if (media.startsWith('/')) return media
  const root = deployPath.replace(/\/$/, '')
  return `${root}/shared/${media.replace(/^\.\//, '')}`
}
