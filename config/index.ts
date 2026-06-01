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

function getHttpsDevServerConfig() {
  if (process.env.TARO_DEV_HTTPS !== '1') return {}

  const certPath = process.env.TARO_DEV_HTTPS_CERT || path.resolve(process.cwd(), 'certs/dev.pem')
  const keyPath = process.env.TARO_DEV_HTTPS_KEY || path.resolve(process.cwd(), 'certs/dev-key.pem')

  return {
    devServer: {
      host: '0.0.0.0',
      https: {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      }
    }
  }
}

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
  outputRoot: process.env.TARO_ENV === 'h5' ? 'dist-h5' : 'dist',
  plugins: ['@tarojs/plugin-platform-weapp', '@tarojs/plugin-platform-h5'],
  defineConstants: {
    'process.env.TARO_APP_SUPABASE_URL': JSON.stringify(process.env.TARO_APP_SUPABASE_URL || ''),
    'process.env.TARO_APP_SUPABASE_ANON_KEY': JSON.stringify(process.env.TARO_APP_SUPABASE_ANON_KEY || '')
  },
  copy: {
    patterns: [
      {
        from: 'public',
        to: process.env.TARO_ENV === 'h5' ? 'dist-h5' : 'dist'
      }
    ],
    options: {}
  },
  framework: 'react',
  compiler: {
    type: 'webpack5',
    prebundle: {
      enable: false
    }
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    router: {
      mode: 'hash'
    },
    ...getHttpsDevServerConfig()
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
