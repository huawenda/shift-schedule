import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const certDir = path.join(rootDir, 'certs')
const certPath = path.join(certDir, 'dev.pem')
const keyPath = path.join(certDir, 'dev-key.pem')

function getLanIpv4List() {
  return Object.values(networkInterfaces())
    .flat()
    .filter(Boolean)
    .filter(item => item.family === 'IPv4' && !item.internal)
    .map(item => item.address)
}

if (!existsSync(certPath) || !existsSync(keyPath)) {
  const hosts = ['localhost', '127.0.0.1', ...getLanIpv4List()]
  console.error('Missing HTTPS development certificates.')
  console.error('')
  console.error('Run:')
  console.error('  mkcert -install')
  console.error(`  mkcert -key-file ".\\certs\\dev-key.pem" -cert-file ".\\certs\\dev.pem" ${hosts.join(' ')}`)
  process.exit(1)
}

const child = spawn('pnpm --filter @shift-schedule/web exec vite --host 0.0.0.0 --port 6173', {
  cwd: rootDir,
  env: {
    ...process.env,
    WEB_DEV_HTTPS: '1'
  },
  shell: true,
  stdio: 'inherit'
})

child.on('exit', code => {
  process.exit(code ?? 0)
})
