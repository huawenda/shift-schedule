import { defineConfig } from '@tarojs/cli'
import fs from 'node:fs'
import path from 'node:path'

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return

  fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .forEach(line => {
      const separatorIndex = line.indexOf('=')
      if (separatorIndex <= 0) return

      const key = line.slice(0, separatorIndex).trim()
      const rawValue = line.slice(separatorIndex + 1).trim()
      if (!key || process.env[key]) return

      process.env[key] = rawValue.replace(/^["']|["']$/g, '')
    })
}

loadLocalEnv()

export default defineConfig({
  projectName: 'shift-schedule-miniapp',
  date: '2026-05-23',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: ['@tarojs/plugin-platform-weapp'],
  framework: 'react',
  compiler: {
    type: 'webpack5',
    prebundle: {
      enable: false
    }
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {}
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]'
        }
      }
    }
  }
})
