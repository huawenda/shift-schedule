import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const certPath = path.join(rootDir, 'certs/dev.pem')
const keyPath = path.join(rootDir, 'certs/dev-key.pem')

const useHttps = process.env.WEB_DEV_HTTPS === '1'
const https =
  useHttps && fs.existsSync(certPath) && fs.existsSync(keyPath)
    ? {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      }
    : undefined

export default defineConfig({
  server: {
    https
  }
})
