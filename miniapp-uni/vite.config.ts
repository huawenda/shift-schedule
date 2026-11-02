import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

// 数据层不进新工程：src/data 仍是唯一来源，靠 alias 指回仓库根
export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      '@': resolve(process.cwd(), 'src'),
      '@data': resolve(process.cwd(), '../src/data')
    }
  },
  server: {
    fs: {
      // h5 预览时允许读父目录的 src/data
      allow: [resolve(process.cwd(), '..')]
    }
  }
})
