const secretKeys = ['DATABASE_URL', 'SESSION_SECRET', 'CSRF_SECRET', 'CREDENTIALS_KEY', 'INITIAL_ADMIN_PASSWORD']
for (const key of secretKeys) delete process.env[key]

const pluginPath = process.argv[2]
if (!pluginPath) {
  console.error('Usage: plugin-host <module>')
  process.exit(1)
}

const plugin = await import(pluginPath)
const result = await plugin.default({
  token: process.env.PLUGIN_TOKEN ?? '',
  apiBase: process.env.PLUGIN_API_BASE ?? '',
  envKeys: Object.keys(process.env).filter((key) => secretKeys.includes(key)),
})
console.log(JSON.stringify(result))

export {}
