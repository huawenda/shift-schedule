import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const certFile = process.env.TARO_DEV_HTTPS_CERT || path.join(root, 'certs', 'dev.pem')
const keyFile = process.env.TARO_DEV_HTTPS_KEY || path.join(root, 'certs', 'dev-key.pem')

function printCertificateHelp() {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter(Boolean)
    .filter(item => item.family === 'IPv4' && !item.internal)
    .map(item => item.address)

  const hosts = ['localhost', '127.0.0.1', ...addresses]
  console.log('\nMissing HTTPS development certificate.')
  console.log('\nCreate one with mkcert:')
  console.log('  mkcert -install')
  console.log(`  mkcert -key-file "${keyFile}" -cert-file "${certFile}" ${hosts.join(' ')}`)
  console.log('\nThen trust the mkcert root certificate on your phone and run this command again.\n')
}

if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) {
  printCertificateHelp()
  process.exit(1)
}

process.env.TARO_DEV_HTTPS = '1'
process.env.TARO_DEV_HTTPS_CERT = certFile
process.env.TARO_DEV_HTTPS_KEY = keyFile

const child = process.platform === 'win32'
  ? spawn('pnpm exec taro build --type h5 --watch', {
    env: process.env,
    shell: true,
    stdio: 'inherit'
  })
  : spawn('pnpm', ['exec', 'taro', 'build', '--type', 'h5', '--watch'], {
    env: process.env,
    stdio: 'inherit'
  })

child.on('error', error => {
  console.error(error)
  process.exit(1)
})

child.on('exit', code => {
  process.exit(code ?? 0)
})
