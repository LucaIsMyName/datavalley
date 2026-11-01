import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

if (!existsSync('.env.development')) {
  console.error('Missing .env.development. Copy .env.development.example to .env.development.')
  process.exit(1)
}

process.loadEnvFile('.env.development')

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: process.env })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code ?? 'signal'}`))
    })
  })
}

await run('node_modules/.bin/tsx', ['scripts/seed-admin.ts'])
await run('node_modules/.bin/concurrently', [
  '-n',
  'api,web,worker',
  '-c',
  'blue,green,magenta',
  'npm run dev -w @datavalley/api',
  'npm run dev -w @datavalley/web',
  'npm run dev -w @datavalley/worker',
])
