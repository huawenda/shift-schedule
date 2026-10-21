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
  // 设计稿宽 375：源文件的 px 与 Web 端 CSS px 1:1，
  // pxtransform 会把 1px 编译成 2rpx（375 设计宽 × deviceRatio 2），
  // 在 375pt 宽的设备上 750rpx = 屏宽，于是 1 源 px = 1 物理 pt，
  // 渲染尺寸与 Web 端 ≤720px 断点完全一致。
  designWidth: 375,
  deviceRatio: {
    375: 2,
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
